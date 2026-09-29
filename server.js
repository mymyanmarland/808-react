// 808 React — Mimo-style Burmese React learning app (Tech Stack 2)
// Node.js + Express + node:sqlite + vanilla JS
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { getDb } from './db.js';
import { scryptSync, randomBytes, timingSafeEqual, randomInt, createHash } from 'node:crypto';
import { sendOtpEmail } from './mailer.js';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3015;
const db = getDb();

const XP = { concept: 10, code: 10, quiz: 20, fill: 20, playground: 30 };

// ---------- helpers ----------
function yangonDate(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Yangon' });
}
function levelFor(xp) { return Math.floor(Math.sqrt(xp / 50)) + 1; }
function xpNeededFor(level) { return 50 * (level - 1) * (level - 1); }

function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const h = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function verifyPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  const h2 = scryptSync(pw, salt, 64);
  const hb = Buffer.from(h, 'hex');
  return hb.length === h2.length && timingSafeEqual(hb, h2);
}
function newSession(userId) {
  const id = randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, exp);
  return id;
}
function getUser(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  const row = db.prepare(`SELECT u.id, u.name, u.email FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now')`).get(sid);
  return row || null;
}
function requireAuth(req, res, next) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'login_required' });
  req.user = u;
  next();
}
function totalXp(userId) {
  return db.prepare('SELECT COALESCE(SUM(xp_earned),0) AS xp FROM progress WHERE user_id = ?').get(userId).xp;
}
function touchStreak(userId) {
  const today = yangonDate();
  const y = new Date(Date.now() - 24 * 3600 * 1000);
  const yesterday = yangonDate(y);
  let s = db.prepare('SELECT * FROM streaks WHERE user_id = ?').get(userId);
  if (!s) {
    db.prepare('INSERT INTO streaks (user_id, current, longest, last_date) VALUES (?, 1, 1, ?)').run(userId, today);
    return { current: 1, longest: 1 };
  }
  if (s.last_date === today) return { current: s.current, longest: s.longest };
  const cur = s.last_date === yesterday ? s.current + 1 : 1;
  const longest = Math.max(s.longest, cur);
  db.prepare('UPDATE streaks SET current = ?, longest = ?, last_date = ? WHERE user_id = ?')
    .run(cur, longest, today, userId);
  return { current: cur, longest };
}
// Award XP once per step. Returns {awarded, xpEarned, xp, level, leveledUp, streak}
function awardXp(userId, stepId, lessonId, xp) {
  const before = totalXp(userId);
  const lvlBefore = levelFor(before);
  try {
    db.prepare('INSERT INTO progress (user_id, lesson_id, step_id, xp_earned) VALUES (?, ?, ?, ?)')
      .run(userId, lessonId, stepId, xp);
  } catch {
    return { awarded: false, xpEarned: 0, xp: before, level: lvlBefore, leveledUp: false, streak: null };
  }
  const streak = touchStreak(userId);
  const after = before + xp;
  const lvlAfter = levelFor(after);
  return { awarded: true, xpEarned: xp, xp: after, level: lvlAfter, leveledUp: lvlAfter > lvlBefore, streak };
}
function stripStep(step) {
  // Remove answers before sending to client
  const d = JSON.parse(step.data);
  const out = { id: step.id, type: step.type, ord: step.ord };
  if (step.type === 'concept') { out.title = d.title; out.body = d.body; }
  else if (step.type === 'code') { out.title = d.title; out.explanation = d.explanation; out.code = d.code; out.notes = d.notes || []; }
  else if (step.type === 'quiz') { out.question = d.question; out.options = d.options; }
  else if (step.type === 'fill') { out.instruction = d.instruction; out.code = d.code; out.hint = d.hint; out.blanks = (d.answers || []).length; }
  else if (step.type === 'playground') { out.title = d.title; out.instruction = d.instruction; out.starter = d.starter; out.hint = d.hint; out.solution = d.solution; }
  return out;
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- auth ----------
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || password.length < 6)
    return res.status(400).json({ error: 'name, email နဲ့ password (အနည်းဆုံး ၆ လုံး) လိုအပ်ပါတယ်' });
  const em = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(em))
    return res.status(400).json({ error: 'ဒီ email နဲ့ အကောင့်ရှိပြီးသားပါ' });
  const r = db.prepare('INSERT INTO users (name, email, pass_hash) VALUES (?, ?, ?)')
    .run(name.trim().slice(0, 40), em, hashPassword(password));
  const sid = newSession(r.lastInsertRowid);
  res.cookie('sid', sid, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
  res.json({ ok: true, user: { id: r.lastInsertRowid, name: name.trim().slice(0, 40), email: em } });
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (!u || !verifyPassword(password || '', u.pass_hash))
    return res.status(400).json({ error: 'email သို့မဟုတ် password မှားနေပါတယ်' });
  const sid = newSession(u.id);
  res.cookie('sid', sid, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
  res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email } });
});
app.post('/api/auth/logout', (req, res) => {
  const sid = req.cookies?.sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

// ---------- OTP (passwordless email code) ----------
const otpReqTimes = new Map(); // email -> [timestamps] for rate limiting
function otpAllowed(email) {
  const now = Date.now();
  const arr = (otpReqTimes.get(email) || []).filter(t => now - t < 3600_000);
  if (arr.length >= 5) return false;
  arr.push(now);
  otpReqTimes.set(email, arr);
  return true;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/otp/request', async (req, res) => {
  const em = ((req.body || {}).email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.status(400).json({ error: 'email မှန်ကန်စွာ ရိုက်ထည့်ပါ' });
  if (!otpAllowed(em)) return res.status(429).json({ error: 'ခဏစောင့်ပြီးမှ ပြန်တောင်းပါ (တစ်နာရီ ၅ ကြိမ်သာ)' });
  const code = String(randomInt(100000, 1000000));
  const hash = createHash('sha256').update(code).digest('hex');
  const exp = new Date(Date.now() + 10 * 60_000).toISOString();
  db.prepare(`INSERT INTO otps (email, code_hash, expires_at, attempts)
              VALUES (?, ?, ?, 0)
              ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,
                expires_at=excluded.expires_at, attempts=0, created_at=datetime('now')`)
    .run(em, hash, exp);
  const sent = await sendOtpEmail(em, code);
  if (!sent.ok) return res.status(500).json({ error: 'email ပို့လို့ မရသေးပါ, ခဏနေမှ ပြန်လုပ်ပါ' });
  const out = { ok: true, dev: sent.dev === true };
  if (process.env.OTP_DEBUG === '1') out.debugCode = code; // tests only, never in production
  res.json(out);
});

app.post('/api/auth/otp/verify', (req, res) => {
  const { email, code, name } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  const row = db.prepare('SELECT * FROM otps WHERE email = ?').get(em);
  if (!row) return res.status(400).json({ error: 'ကုဒ်ကို အရင်တောင်းပါ' });
  if (row.attempts >= 5) {
    db.prepare('DELETE FROM otps WHERE email = ?').run(em);
    return res.status(400).json({ error: 'အကြိမ်များလွန်းလို့ ကုဒ်အသစ် ပြန်တောင်းပါ' });
  }
  const hash = createHash('sha256').update(String(code || '').trim()).digest('hex');
  const okHash = hash.length === row.code_hash.length &&
    timingSafeEqual(Buffer.from(hash), Buffer.from(row.code_hash));
  if (!okHash || row.expires_at < new Date().toISOString()) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ?').run(em);
    return res.status(400).json({ error: 'ကုဒ် မှားနေပါတယ် (သို့) သက်တမ်းကုန်ပါပြီ' });
  }
  db.prepare('DELETE FROM otps WHERE email = ?').run(em);
  let u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (!u) {
    // signup via OTP: password unused, random hash placeholder
    const nm = (name || '').trim().slice(0, 40) || em.split('@')[0].slice(0, 40);
    const r = db.prepare('INSERT INTO users (name, email, pass_hash) VALUES (?, ?, ?)')
      .run(nm, em, 'otp:' + randomBytes(16).toString('hex'));
    u = { id: r.lastInsertRowid, name: nm, email: em };
  }
  const sid = newSession(u.id);
  res.cookie('sid', sid, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
  res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email } });
});

// ---------- me / stats ----------
app.get('/api/me', (req, res) => {
  const u = getUser(req);
  if (!u) return res.json({ user: null });
  const xp = totalXp(u.id);
  const level = levelFor(xp);
  const s = db.prepare('SELECT * FROM streaks WHERE user_id = ?').get(u.id) || { current: 0, longest: 0 };
  const stepsDone = db.prepare('SELECT COUNT(*) c FROM progress WHERE user_id = ?').get(u.id).c;
  const lessonsDone = db.prepare(`SELECT COUNT(DISTINCT p.lesson_id) c FROM progress p
    WHERE p.user_id = ? AND NOT EXISTS (
      SELECT 1 FROM steps s2 WHERE s2.lesson_id = p.lesson_id
      AND NOT EXISTS (SELECT 1 FROM progress p2 WHERE p2.user_id = p.user_id AND p2.step_id = s2.id)
    )`).get(u.id).c;
  res.json({
    user: u, xp, level,
    xpIntoLevel: xp - xpNeededFor(level),
    xpForNext: xpNeededFor(level + 1) - xpNeededFor(level),
    streak: s.current, longestStreak: s.longest, stepsDone, lessonsDone,
  });
});

// ---------- curriculum ----------
app.get('/api/curriculum', (req, res) => {
  const u = getUser(req);
  const p = db.prepare('SELECT * FROM paths ORDER BY rowid LIMIT 1').get();
  if (!p) return res.json({ path: null, modules: [] });
  const mods = db.prepare('SELECT * FROM modules WHERE path_slug = ? ORDER BY ord').all(p.slug);
  const doneSet = u ? new Set(db.prepare('SELECT step_id FROM progress WHERE user_id = ?').all(u.id).map(r => r.step_id)) : new Set();
  const modules = mods.map(m => {
    const lessons = db.prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY ord').all(m.id).map(l => {
      const steps = db.prepare('SELECT id FROM steps WHERE lesson_id = ? ORDER BY ord').all(l.id);
      const done = steps.filter(s => doneSet.has(s.id)).length;
      return { slug: l.slug, title: l.title, titleEn: l.title_en, description: l.description, totalSteps: steps.length, doneSteps: done, done: steps.length > 0 && done === steps.length };
    });
    const allDone = lessons.length && lessons.every(l => l.done);
    return { slug: m.slug, title: m.title, titleEn: m.title_en, description: m.description, lessons, done: !!allDone };
  });
  // next lesson = first incomplete
  let next = null;
  for (const m of modules) for (const l of m.lessons) if (!l.done && !next) next = l.slug;
  res.json({ path: p, modules, next });
});

app.get('/api/lessons/:slug', (req, res) => {
  const u = getUser(req);
  const l = db.prepare('SELECT * FROM lessons WHERE slug = ?').get(req.params.slug);
  if (!l) return res.status(404).json({ error: 'lesson မတွေ့ပါ' });
  const steps = db.prepare('SELECT * FROM steps WHERE lesson_id = ? ORDER BY ord').all(l.id).map(stripStep);
  const doneIds = u ? db.prepare('SELECT step_id FROM progress WHERE user_id = ? AND lesson_id = ?').all(u.id, l.id).map(r => r.step_id) : [];
  res.json({ lesson: { slug: l.slug, title: l.title, titleEn: l.title_en, description: l.description }, steps, doneStepIds: doneIds });
});

// ---------- steps: complete (concept/code/playground) ----------
app.post('/api/steps/complete', requireAuth, (req, res) => {
  const { stepId, code } = req.body || {};
  const s = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId);
  if (!s) return res.status(404).json({ error: 'step မတွေ့ပါ' });
  if (!['concept', 'code', 'playground'].includes(s.type))
    return res.status(400).json({ error: 'ဒီ step ကို check API နဲ့ ဖြေရပါမယ်' });
  if (s.type === 'playground') {
    const d = JSON.parse(s.data);
    const missing = (d.mustContain || []).filter(m => !(code || '').includes(m));
    if (missing.length) return res.status(400).json({ error: 'not_ready', missing });
  }
  res.json(awardXp(req.user.id, s.id, s.lesson_id, XP[s.type] || 10));
});

// ---------- steps: check (quiz/fill) ----------
app.post('/api/steps/check', requireAuth, (req, res) => {
  const { stepId, answer } = req.body || {};
  const s = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId);
  if (!s) return res.status(404).json({ error: 'step မတွေ့ပါ' });
  const d = JSON.parse(s.data);
  let correct = false;
  if (s.type === 'quiz') {
    correct = Number(answer) === d.answer;
  } else if (s.type === 'fill') {
    const given = Array.isArray(answer) ? answer : [answer];
    correct = d.answers.length === given.length &&
      d.answers.every((a, i) => String(given[i] ?? '').trim().toLowerCase() === String(a).trim().toLowerCase());
  } else {
    return res.status(400).json({ error: 'ဒီ step ကို complete API နဲ့ ပြီးအောင်လုပ်ရပါမယ်' });
  }
  if (!correct) return res.json({ correct: false, explanation: d.explanation || null, hint: d.hint || null });
  const r = awardXp(req.user.id, s.id, s.lesson_id, XP[s.type] || 20);
  res.json({ correct: true, explanation: d.explanation || null, ...r });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`808 React live on :${PORT}`));
