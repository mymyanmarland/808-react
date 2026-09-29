// Dashboard: curriculum list + continue-learning card
async function api(p, o) {
  const r = await fetch(p, o);
  return r.json();
}

async function init() {
  const main = document.getElementById('main');
  const [me, cur] = await Promise.all([api('/api/me'), api('/api/curriculum')]);

  if (me.user) {
    document.getElementById('streakPill').style.display = '';
    document.getElementById('xpPill').style.display = '';
    document.getElementById('streakN').textContent = me.streak;
    document.getElementById('xpN').textContent = me.xp;
  }

  if (!cur.path) {
    main.innerHTML = '<div class="card">သင်ရိုးမရှိသေးပါ။</div>';
    return;
  }

  let html = '';
  if (!me.user) {
    html += `<div class="hero">
      <div class="big">⚛️</div>
      <h1>မြန်မာလို React သင်မယ်</h1>
      <p class="mut">Mimo လို တစ်ပိုင်းချင်းစီ — code တကယ်ရေးရင်း၊ quiz ဖြေရင်း သင်မယ်။</p>
      <a class="btn" href="/auth.html">အခမဲ့ စတင်မယ် 🚀</a>
      <p class="small mut" style="margin-top:10px">အကောင့်ဖွင့်မှ တိုးတက်မှု သိမ်းထားပေးမယ်</p>
    </div>`;
  } else if (cur.next) {
    const nl = findLesson(cur.modules, cur.next);
    html += `<div class="card" style="border-color:var(--acc)">
      <div class="small mut">ဆက်လက်သင်ရန် ${me.user.name ? ' — ' + esc(me.user.name) : ''}</div>
      <h3>${esc(nl.title)}</h3>
      <div class="progress"><div style="width:${pct(nl)}%"></div></div>
      <p class="small mut">${nl.doneSteps}/${nl.totalSteps} ဆင့် ပြီးပြီ</p>
      <a class="btn block" href="/lesson.html?slug=${nl.slug}">ဆက်သင်မယ် ▶</a>
    </div>`;
  } else {
    html += `<div class="card" style="border-color:var(--good);text-align:center">
      <div style="font-size:40px">🏆</div>
      <h3>သင်ရိုးအကုန် ပြီးသွားပြီ!</h3>
      <p class="mut small">တော်လိုက်တာ — React အခြေခံ ပိုင်သွားပြီ။ Playground မှာ ကိုယ်ပိုင် project လေးတွေ ဆက်စမ်းကြည့်ပါ။</p>
    </div>`;
  }

  html += `<h2>${esc(cur.path.icon || '')} ${esc(cur.path.title)}</h2>
    <p class="mut small" style="margin-top:-6px">${esc(cur.path.description || '')}</p>`;

  cur.modules.forEach((m, i) => {
    const doneCount = m.lessons.filter(l => l.done).length;
    html += `<div class="mod-head"><div class="mod-num">${m.done ? '✓' : i + 1}</div>
      <div><b>${esc(m.title)}</b><div class="small mut">${doneCount}/${m.lessons.length} lessons</div></div></div>`;
    m.lessons.forEach(l => {
      const cls = l.done ? 'done' : (l.slug === cur.next ? 'next' : '');
      const dot = l.done ? '✓' : (l.slug === cur.next ? '▶' : '·');
      html += `<a class="lesson ${cls}" href="/lesson.html?slug=${l.slug}">
        <div class="dot">${dot}</div>
        <div class="t"><b>${esc(l.title)}</b><span>${l.doneSteps}/${l.totalSteps} ဆင့်${l.titleEn ? ' · ' + esc(l.titleEn) : ''}</span></div>
      </a>`;
    });
  });

  if (!me.user) {
    html += `<div class="card" style="margin-top:16px;text-align:center">
      <p class="mut small">XP, streak နဲ့ တိုးတက်မှု သိမ်းချင်ရင်</p>
      <a class="btn" href="/auth.html">အကောင့်ဖွင့်မယ်</a></div>`;
  }
  main.innerHTML = html;
}
function findLesson(mods, slug) {
  for (const m of mods) for (const l of m.lessons) if (l.slug === slug) return l;
  return null;
}
function pct(l) { return l.totalSteps ? Math.round(100 * l.doneSteps / l.totalSteps) : 0; }
init();
