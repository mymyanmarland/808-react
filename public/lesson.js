// Lesson player: renders each step type, awards XP via API
const slug = new URLSearchParams(location.search).get('slug');
let lesson, steps, idx = 0, doneIds = new Set(), me = null, finishing = false, earned = 0;

async function api(p, o) {
  const r = await fetch(p, o);
  const j = await r.json();
  if (r.status === 401) { location.href = '/auth.html?next=' + encodeURIComponent(location.pathname + location.search); return null; }
  return j;
}
function needLogin() {
  toast('အရင် အကောင့်ဝင်ပါ 🔑');
  setTimeout(() => location.href = '/auth.html?next=' + encodeURIComponent(location.pathname + location.search), 800);
}

async function init() {
  if (!slug) { location.href = '/'; return; }
  const [m, data] = await Promise.all([api('/api/me'), api('/api/lessons/' + slug)]);
  if (!data) return;
  me = m;
  if (me.user) document.getElementById('xpN').textContent = me.xp;
  lesson = data.lesson; steps = data.steps; doneIds = new Set(data.doneStepIds);
  document.title = lesson.title + ' — 808 React ⚛️';
  // resume at first incomplete step
  const firstNew = steps.findIndex(s => !doneIds.has(s.id));
  idx = firstNew >= 0 ? firstNew : 0;
  onRunnerEvent(onRunEvent);
  render();
}
let runLog = [];
function onRunEvent(e) {
  const box = document.getElementById('runConsole');
  if (!box) return;
  const line = document.createElement('div');
  line.className = e.type === 'error' ? 'err' : '';
  line.textContent = (e.type === 'error' ? '⚠️ ' : '› ') + e.message;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function render() {
  const main = document.getElementById('main');
  const s = steps[idx];
  document.getElementById('pbarFill').style.width = Math.round(100 * doneIds.size / steps.length) + '%';
  let h = `<p class="small mut">${esc(lesson.title)} · ဆင့် ${idx + 1}/${steps.length}</p>`;
  h += renderStep(s);
  h += `<div style="display:flex;gap:8px;margin-top:14px">
    <button class="btn ghost" id="prevBtn" ${idx === 0 ? 'disabled' : ''}>‹ နောက်</button>
    <button class="btn ghost" id="nextBtn" ${idx === steps.length - 1 ? 'disabled' : ''} style="margin-left:auto">ရှေ့ ›</button>
  </div>`;
  main.innerHTML = h;
  wireStep(s);
  const pb = document.getElementById('prevBtn'), nb = document.getElementById('nextBtn');
  if (pb) pb.onclick = () => { if (idx > 0) { idx--; render(); window.scrollTo(0, 0); } };
  if (nb) nb.onclick = () => { if (idx < steps.length - 1) { idx++; render(); window.scrollTo(0, 0); } };
}

function renderStep(s) {
  if (s.type === 'concept') return `
    <div class="card"><h1>${esc(s.title)}</h1><div class="step-body">${md(s.body)}</div>
    <button class="btn block" id="doneBtn" style="margin-top:14px">${doneIds.has(s.id) ? 'ပြီးပြီ ✓ — ဆက်သွားမယ်' : 'နားလည်ပြီ, ဆက်သွားမယ် ▶'}</button></div>`;
  if (s.type === 'code') return `
    <div class="card"><h3>💻 ${esc(s.title)}</h3><div class="step-body small">${md(s.explanation)}</div>
    <pre class="code">${codeHtml(s.code, s.notes)}</pre>
    ${(s.notes || []).map(n => `<div class="note"><b>လိုင်း ${n.line}:</b> ${esc(n.text)}</div>`).join('')}
    <button class="btn ghost block" id="runBtn" style="margin-top:8px">▶ စမ်းကြည့်မယ်</button>
    <iframe class="preview" id="pv" style="display:none;margin-top:8px" sandbox="allow-scripts"></iframe>
    <div class="console-log" id="runConsole" style="display:none;margin-top:8px"></div>
    <button class="btn block" id="doneBtn" style="margin-top:12px">${doneIds.has(s.id) ? 'ပြီးပြီ ✓ — ဆက်သွားမယ်' : 'ဆက်သွားမယ် ▶'}</button></div>`;
  if (s.type === 'quiz') return `
    <div class="card"><h3>❓ Quiz</h3><div class="step-body" style="margin-bottom:12px">${md(s.question)}</div>
    <div id="opts">${s.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}</div>
    <div id="qfb"></div></div>`;
  if (s.type === 'fill') {
    const parts = s.code.split('___');
    let h = `<div class="card"><h3>⌨️ Code ဖြည့်ပါ</h3><div class="step-body small" style="margin-bottom:10px">${md(s.instruction)}</div><pre class="code">`;
    parts.forEach((p, i) => {
      h += esc(p);
      if (i < parts.length - 1) h += `<input data-b="${i}" placeholder="___" style="width:110px;background:#0a0f1e;border:1px solid var(--acc);color:var(--txt);border-radius:6px;padding:2px 8px;font:inherit">`;
    });
    h += `</pre>${s.hint ? `<div class="note">💡 ${esc(s.hint)}</div>` : ''}
      <div id="qfb"></div>
      <button class="btn block" id="checkBtn" style="margin-top:10px">စစ်ဆေးမယ် ✓</button></div>`;
    return h;
  }
  if (s.type === 'playground') return `
    <div class="card"><h3>🧪 ${esc(s.title)}</h3><div class="step-body small" style="margin-bottom:10px">${md(s.instruction)}</div>
    <textarea class="code-input" id="pgCode" spellcheck="false">${esc(s.starter)}</textarea>
    <div style="display:flex;gap:8px;margin:10px 0">
      <button class="btn" id="runBtn" style="flex:1">▶ Run</button>
      <button class="btn ghost" id="solBtn">နမူနာအဖြေ</button>
    </div>
    <div id="solBox" style="display:none"><pre class="code">${esc(s.solution)}</pre></div>
    <iframe class="preview" id="pv" sandbox="allow-scripts"></iframe>
    <div class="console-log" id="runConsole" style="margin-top:8px"><div class="mut">console output ဒီမှာပေါ်မယ်…</div></div>
    ${s.hint ? `<div class="note">💡 ${esc(s.hint)}</div>` : ''}
    <div id="qfb"></div>
    <button class="btn block" id="doneBtn" style="margin-top:10px">${doneIds.has(s.id) ? 'ပြီးပြီ ✓ — ဆက်သွားမယ်' : 'ပြီးအောင်လုပ်ပြီးပြီ ✓'}</button></div>`;
  return '';
}

function codeHtml(code, notes) {
  const hl = new Set((notes || []).map(n => n.line));
  return esc(code).split('\n').map((ln, i) => hl.has(i + 1) ? `<span class="hl">${ln || ' '}</span>` : ln).join('\n');
}

function wireStep(s) {
  const main = document.getElementById('main');
  if (s.type === 'concept' || s.type === 'code') {
    const rb = document.getElementById('runBtn');
    if (rb) rb.onclick = () => {
      const pv = document.getElementById('pv'), box = document.getElementById('runConsole');
      pv.style.display = ''; box.style.display = ''; box.innerHTML = '';
      runJSX(s.code, pv);
    };
    document.getElementById('doneBtn').onclick = () => completeSimple(s);
  }
  if (s.type === 'quiz') {
    main.querySelectorAll('.opt').forEach(b => b.onclick = () => answerQuiz(s, Number(b.dataset.i), b));
  }
  if (s.type === 'fill') {
    document.getElementById('checkBtn').onclick = () => {
      const ans = [...main.querySelectorAll('input[data-b]')].map(i => i.value);
      checkAnswer(s, ans);
    };
  }
  if (s.type === 'playground') {
    document.getElementById('runBtn').onclick = () => {
      const box = document.getElementById('runConsole');
      box.innerHTML = '<div class="mut">running…</div>';
      runJSX(document.getElementById('pgCode').value, document.getElementById('pv'));
    };
    document.getElementById('solBtn').onclick = () => {
      const b = document.getElementById('solBox');
      b.style.display = b.style.display === 'none' ? '' : 'none';
    };
    document.getElementById('doneBtn').onclick = () => completePlayground(s);
  }
}

async function completeSimple(s) {
  if (!me.user) return needLogin();
  if (doneIds.has(s.id)) return advance();
  const r = await api('/api/steps/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId: s.id }) });
  if (!r) return;
  onAwarded(r, s);
}
async function completePlayground(s) {
  if (!me.user) return needLogin();
  if (doneIds.has(s.id)) return advance();
  const code = document.getElementById('pgCode').value;
  const r = await api('/api/steps/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId: s.id, code }) });
  if (!r) return;
  if (r.error === 'not_ready') {
    document.getElementById('qfb').innerHTML = `<div class="note" style="border-color:var(--warn)">⚠️ code ထဲမှာ <code>${esc(r.missing.join(', '))}</code> ပါအောင် ရေးပါ</div>`;
    return;
  }
  onAwarded(r, s);
}
async function answerQuiz(s, i, btn) {
  if (!me.user) return needLogin();
  const opts = [...document.querySelectorAll('.opt')];
  opts.forEach(b => b.disabled = true);
  const r = await api('/api/steps/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId: s.id, answer: i }) });
  if (!r) return;
  const fb = document.getElementById('qfb');
  if (r.correct) {
    btn.classList.add('right');
    fb.innerHTML = `<div class="note" style="border-color:var(--good)">✅ မှန်တယ်! ${r.explanation ? esc(r.explanation) : ''}</div>
      <button class="btn block" id="contBtn" style="margin-top:8px">ဆက်သွားမယ် ▶</button>`;
    onAwarded(r, s, true);
    document.getElementById('contBtn').onclick = advance;
  } else {
    btn.classList.add('wrong');
    fb.innerHTML = `<div class="note" style="border-color:var(--bad)">❌ မှားနေတယ် — နောက်တစ်ခါ ကြိုးစားကြည့်${r.hint ? '<br>💡 ' + esc(r.hint) : ''}</div>
      <button class="btn ghost block" id="retryBtn" style="margin-top:8px">ပြန်ဖြေမယ် ↻</button>`;
    document.getElementById('retryBtn').onclick = render;
  }
}
async function checkAnswer(s, ans) {
  if (!me.user) return needLogin();
  const r = await api('/api/steps/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId: s.id, answer: ans }) });
  if (!r) return;
  const fb = document.getElementById('qfb');
  if (r.correct) {
    fb.innerHTML = `<div class="note" style="border-color:var(--good)">✅ မှန်တယ်! ${r.explanation ? esc(r.explanation) : ''}</div>
      <button class="btn block" id="contBtn" style="margin-top:8px">ဆက်သွားမယ် ▶</button>`;
    onAwarded(r, s, true);
    document.getElementById('contBtn').onclick = advance;
  } else {
    fb.innerHTML = `<div class="note" style="border-color:var(--bad)">❌ မှားနေသေးတယ် — ပြန်စစ်ကြည့်${r.hint ? '<br>💡 ' + esc(r.hint) : ''}</div>`;
  }
}
function onAwarded(r, s, silent) {
  if (r.awarded) {
    doneIds.add(s.id);
    earned += r.xpEarned;
    document.getElementById('xpN').textContent = r.xp;
    if (!silent) toast(`+${r.xpEarned} XP ⚡`);
    if (r.leveledUp) setTimeout(() => toast(`🎉 Level ${r.level} တက်သွားပြီ!`, 3000), 600);
    if (r.streak && r.streak.current > 1 && !silent) setTimeout(() => toast(`🔥 ${r.streak.current} ရက်ဆက် streak!`, 3000), 1200);
  }
  document.getElementById('pbarFill').style.width = Math.round(100 * doneIds.size / steps.length) + '%';
  if (!silent) setTimeout(advance, 900);
}
function advance() {
  if (doneIds.size >= steps.length && !finishing) return finishLesson();
  if (idx < steps.length - 1) { idx++; render(); window.scrollTo(0, 0); }
  else if (doneIds.size >= steps.length) finishLesson();
}
async function finishLesson() {
  finishing = true;
  const cur = await api('/api/curriculum');
  const main = document.getElementById('main');
  main.innerHTML = `<div class="card" style="text-align:center;border-color:var(--good)">
    <div style="font-size:52px">🎉</div>
    <h1>Lesson ပြီးသွားပြီ!</h1>
    <p class="mut">«${esc(lesson.title)}»</p>
    <p>ဒီ lesson မှာ <b style="color:var(--acc)">+${earned} XP</b> ရခဲ့တယ်</p>
    ${cur.next && cur.next !== slug ? `<a class="btn block" href="/lesson.html?slug=${cur.next}">နောက် lesson ▶</a>` : `<a class="btn block" href="/">ပင်မစာမျက်နှာ 🏠</a>`}
  </div>`;
  window.scrollTo(0, 0);
}
init();
