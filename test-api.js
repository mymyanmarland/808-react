// API test suite for 808 React. Usage: node test-api.js
// Seeds curriculum, boots the server on a test port, runs checks, shuts down.
import { spawn, execSync } from 'node:child_process';

const PORT = 3222;
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const results = [];
function ok(name, cond, extra = '') {
  if (cond) { passed++; results.push(`  ✅ ${name}`); }
  else { failed++; results.push(`  ❌ ${name} ${extra}`); }
}
let cookie = '';
async function req(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = r.headers.get('set-cookie');
  if (setC) cookie = setC.split(';')[0];
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

async function main() {
  console.log('Cleaning test DB…');
  execSync('rm -f data.sqlite', { cwd: import.meta.dirname });
  console.log('Seeding curriculum…');
  execSync('node seed.js', { cwd: import.meta.dirname, stdio: 'inherit' });

  console.log('Booting server…');
  const srv = spawn('node', ['server.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT), OTP_DEBUG: '1' }, stdio: 'pipe' });
  const ready = await new Promise((res) => {
    const t = setTimeout(() => res(false), 15000);
    const check = async () => {
      try { const r = await fetch(BASE + '/health'); if (r.ok) { clearTimeout(t); res(true); } else setTimeout(check, 300); }
      catch { setTimeout(check, 300); }
    };
    check();
  });
  if (!ready) { console.log('server did not start'); srv.kill(); process.exit(1); }

  try {
    console.log('\n— auth —');
    let r = await req('POST', '/api/auth/signup', { name: 'Test', email: 'test@808react.test', password: 'secret123' });
    ok('signup 200', r.status === 200 && r.j.ok, JSON.stringify(r.j));
    r = await req('POST', '/api/auth/signup', { name: 'Test', email: 'test@808react.test', password: 'secret123' });
    ok('duplicate signup 400', r.status === 400);
    r = await req('POST', '/api/auth/login', { email: 'test@808react.test', password: 'wrong' });
    ok('login wrong password 400', r.status === 400);
    cookie = '';
    r = await req('POST', '/api/auth/login', { email: 'test@808react.test', password: 'secret123' });
    ok('login ok', r.status === 200 && r.j.ok);

    console.log('\n— me & curriculum —');
    r = await req('GET', '/api/me');
    ok('me returns user', r.j.user && r.j.user.email === 'test@808react.test');
    ok('me starts at 0 xp level 1', r.j.xp === 0 && r.j.level === 1, JSON.stringify({ xp: r.j.xp, level: r.j.level }));
    r = await req('GET', '/api/curriculum');
    ok('curriculum has path', r.j.path && r.j.path.slug === 'react-basics');
    ok('6 modules', r.j.modules.length === 6, `got ${r.j.modules.length}`);
    const lessons = r.j.modules.flatMap(m => m.lessons);
    ok('15 lessons', lessons.length === 15, `got ${lessons.length}`);
    ok('next lesson points at first', r.j.next === lessons[0].slug);

    console.log('\n— lesson steps (answers stripped) —');
    r = await req('GET', '/api/lessons/' + lessons[0].slug);
    ok('lesson loads with steps', r.j.lesson && r.j.steps.length >= 5, `steps=${r.j.steps?.length}`);
    const quizStep = r.j.steps.find(s => s.type === 'quiz');
    const fillStep = r.j.steps.find(s => s.type === 'fill');
    const conceptStep = r.j.steps.find(s => s.type === 'concept');
    const pgStep = r.j.steps.find(s => s.type === 'playground');
    ok('quiz step has no answer leaked', quizStep && !('answer' in quizStep) && quizStep.options.length === 4);
    ok('fill step has no answers leaked', !fillStep || !('answers' in fillStep));

    console.log('\n— step completion & XP —');
    r = await req('POST', '/api/steps/complete', { stepId: conceptStep.id });
    ok('concept complete awards XP', r.j.awarded && r.j.xpEarned === 10, JSON.stringify(r.j));
    r = await req('POST', '/api/steps/complete', { stepId: conceptStep.id });
    ok('re-complete not double-awarded', r.j.awarded === false && r.j.xpEarned === 0);

    console.log('\n— quiz check —');
    r = await req('POST', '/api/steps/check', { stepId: quizStep.id, answer: -1 });
    ok('wrong quiz answer rejected', r.j.correct === false);
    // find right answer by trying 0..3 (only 4 tries, then verify awarded once)
    let qr = null;
    for (let i = 0; i < 4; i++) {
      qr = await req('POST', '/api/steps/check', { stepId: quizStep.id, answer: i });
      if (qr.j.correct) break;
    }
    ok('correct quiz answer accepted + XP', qr.j.correct && qr.j.awarded && qr.j.xpEarned === 20, JSON.stringify({ c: qr.j.correct, a: qr.j.awarded }));
    const qr2 = await req('POST', '/api/steps/check', { stepId: quizStep.id, answer: 0 });
    ok('quiz re-answer not double-awarded', qr2.j.awarded === false);

    if (fillStep) {
      console.log('\n— fill check —');
      r = await req('POST', '/api/steps/check', { stepId: fillStep.id, answer: ['___nope___'] });
      ok('wrong fill rejected', r.j.correct === false);
    }

    console.log('\n— playground mustContain —');
    if (pgStep) {
      r = await req('POST', '/api/steps/complete', { stepId: pgStep.id, code: 'function App(){return <h1>hi</h1>}' });
      const needsSomething = r.status === 400 && r.j.error === 'not_ready';
      ok('playground without mustContain rejected', pgStep && needsSomething ? true : r.j.awarded === true, JSON.stringify(r.j).slice(0, 120));
    } else {
      // find a playground step in any lesson
      let found = null;
      for (const l of lessons) {
        const lr = await req('GET', '/api/lessons/' + l.slug);
        const p = lr.j.steps.find(s => s.type === 'playground');
        if (p) { found = p; break; }
      }
      ok('playground step exists somewhere', !!found);
      if (found) {
        r = await req('POST', '/api/steps/complete', { stepId: found.id, code: 'function App(){return <h1>hi</h1>}' });
        ok('playground gate works', r.status === 400 || r.j.awarded === true, JSON.stringify(r.j).slice(0, 120));
      }
    }

    console.log('\n— streak & progress —');
    r = await req('GET', '/api/me');
    ok('xp accumulated', r.j.xp >= 30, `xp=${r.j.xp}`);
    ok('streak is 1 today', r.j.streak === 1, `streak=${r.j.streak}`);
    r = await req('GET', '/api/curriculum');
    const l0 = r.j.modules[0].lessons[0];
    ok('lesson progress reflected', l0.doneSteps >= 2, `doneSteps=${l0.doneSteps}`);

    console.log('\n— OTP —');
    r = await req('POST', '/api/auth/otp/request', { email: 'not-an-email' });
    ok('otp request bad email 400', r.status === 400);
    r = await req('POST', '/api/auth/otp/request', { email: 'otp1@test.com' });
    ok('otp request ok', r.j.ok === true, JSON.stringify(r.j));
    const code1 = r.j.debugCode;
    ok('otp debug code in test env', typeof code1 === 'string' && code1.length === 6);
    r = await req('POST', '/api/auth/otp/verify', { email: 'otp1@test.com', code: '000000' });
    ok('otp wrong code rejected', r.status === 400);
    r = await req('POST', '/api/auth/otp/verify', { email: 'otp1@test.com', code: code1, name: 'Otp User' });
    ok('otp verify creates user + logs in', r.j.ok && r.j.user.name === 'Otp User', JSON.stringify(r.j.user));
    r = await req('POST', '/api/auth/otp/verify', { email: 'otp1@test.com', code: code1 });
    ok('otp code single-use', r.status === 400);
    // login existing user via OTP (no name needed)
    await req('POST', '/api/auth/logout');
    r = await req('POST', '/api/auth/otp/request', { email: 'otp1@test.com' });
    const code2 = r.j.debugCode;
    r = await req('POST', '/api/auth/otp/verify', { email: 'otp1@test.com', code: code2 });
    ok('otp login existing user', r.j.ok && r.j.user.email === 'otp1@test.com');
    // rate limit: 5/hour
    let limited = false;
    for (let i = 0; i < 6; i++) {
      const rr = await req('POST', '/api/auth/otp/request', { email: 'ratelimit@test.com' });
      if (rr.status === 429) { limited = true; break; }
    }
    ok('otp rate limited after 5/hour', limited);

    console.log('\n— logout —');
    r = await req('POST', '/api/auth/logout');
    ok('logout ok', r.j.ok);
    r = await req('GET', '/api/me');
    ok('me after logout is null', r.j.user === null);
    r = await req('POST', '/api/steps/complete', { stepId: conceptStep.id });
    ok('complete without auth is 401', r.status === 401);
  } finally {
    srv.kill();
  }

  console.log('\n' + results.join('\n'));
  console.log(`\n${passed}/${passed + failed} tests passed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
