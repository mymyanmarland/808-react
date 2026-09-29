// Shared in-browser JSX runner: transforms user code with Babel and renders in a
// sandboxed iframe (no server execution needed).
const REACT_CDN = 'https://unpkg.com/react@18.3.1/umd/react.production.min.js';
const REACTDOM_CDN = 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js';
const BABEL_CDN = 'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js';

function buildSrcdoc(code) {
  const safe = code.replace(/<\/script/gi, '<\\/script');
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>body{font-family:system-ui,sans-serif;padding:14px;background:#f8fafc;color:#0f172a;margin:0}' +
    'button{background:#61dafb;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;margin:2px}' +
    'input{border:1px solid #cbd5e1;border-radius:8px;padding:8px;margin:2px}' +
    '#err{color:#dc2626;font-size:13px;white-space:pre-wrap;margin-top:8px}</style></head><body>' +
    '<div id="root"></div><div id="err"></div>' +
    '<scr' + 'ipt src="' + REACT_CDN + '"></scr' + 'ipt>' +
    '<scr' + 'ipt src="' + REACTDOM_CDN + '"></scr' + 'ipt>' +
    '<scr' + 'ipt src="' + BABEL_CDN + '"></scr' + 'ipt>' +
    '<scr' + 'ipt>window.onerror=function(m){var e=document.getElementById("err");' +
    'e.textContent="\\u26a0\\ufe0f "+m;' +
    'parent.postMessage({t:"jsx-error",message:String(m)},"*")};' +
    'console.log=function(){var s=[].map.call(arguments,function(a){try{return String(a)}catch(e){return "?"}}).join(" ");' +
    'parent.postMessage({t:"jsx-log",message:s},"*")};</scr' + 'ipt>' +
    '<scr' + 'ipt type="text/babel" data-presets="react">\n' +
    'const {useState, useEffect, useRef, useMemo, useCallback} = React;\n' + safe + '\n' +
    'try{ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));}' +
    'catch(e){document.getElementById("err").textContent="\\u26a0\\ufe0f "+(e&&e.message||e);' +
    'parent.postMessage({t:"jsx-error",message:String((e&&e.message)||e)},"*")}' +
    '</scr' + 'ipt></body></html>';
}

// Render `code` (must define function App) into iframe. Returns nothing; errors/logs
// arrive via the callback registered with onRunnerEvent.
function runJSX(code, iframe) {
  iframe.srcdoc = buildSrcdoc(code);
}

// Register once per page: cb({type:'log'|'error', message})
function onRunnerEvent(cb) {
  window.addEventListener('message', (ev) => {
    if (!ev.data || typeof ev.data.t !== 'string') return;
    if (ev.data.t === 'jsx-log') cb({ type: 'log', message: ev.data.message });
    else if (ev.data.t === 'jsx-error') cb({ type: 'error', message: ev.data.message });
  });
}

// Tiny toast helper shared by pages
function toast(msg, ms = 2200) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// Minimal markdown-ish renderer for concept bodies: **bold** + `code` + newlines
function md(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background:#0a0f1e;padding:1px 6px;border-radius:6px;color:#61dafb">$1</code>')
    .replace(/\n/g, '<br>');
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
