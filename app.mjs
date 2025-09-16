import { candidateFonts, webFontFaces } from './fonts-list.mjs';

// Element helpers
const $ = id => document.getElementById(id);
const txt = $('t');
const sz = $('sz');
const flt = $('flt');
const out = $('out');
const st = $('st');
const cpy = $('cpy');
const th = $('th');
const tpl = $('tpl');

// State
let fonts = [];
const BASE = ['monospace', 'serif', 'sans-serif'];
const PROBES = [
  'mmmmmmlliWWOO123',
  'AaBbCcXxYyZz 0123456789',
  '%%%%@@@####____===='
];
const BM = {}; // baseline metrics per generic per probe
const DIFF_THRESHOLD = 1;
const CACHE_KEY_PREFIX = 'fontDetectCache_v1';

// Utilities
const setStatus = msg => { st.textContent = msg; };

function measure(stack, text) {
  const span = document.createElement('span');
  span.style.cssText = 'position:absolute;top:-9999px;left:-9999px;font-size:72px;white-space:nowrap;font-family:' + stack;
  span.textContent = text;
  document.body.appendChild(span);
  const w = span.offsetWidth, h = span.offsetHeight;
  span.remove();
  return { w, h };
}

function initBaseline() {
  BASE.forEach(g => { BM[g] = PROBES.map(p => measure(g, p)); });
}

function diffEnough(a, b) {
  return Math.abs(a.w - b.w) >= DIFF_THRESHOLD || Math.abs(a.h - b.h) >= DIFF_THRESHOLD;
}

function hasFont(name) {
  for (const g of BASE) {
    let any = false;
    for (let i = 0; i < PROBES.length; i++) {
      const m = measure(`'${name}', ${g}`, PROBES[i]);
      if (diffEnough(m, BM[g][i])) { any = true; break; }
    }
    if (!any) return false;
  }
  return true;
}

async function apiFonts() {
  // Try the modern Local Font Access API (window.queryLocalFonts)
  if (typeof window.queryLocalFonts === 'function') {
    try {
      // This call may prompt the user for permission in supporting browsers.
      const fontDataList = await window.queryLocalFonts();
      const set = new Set();
      for (const f of fontDataList) {
        const n = f.fullName || f.postscriptName || f.family;
        if (n) set.add(n);
      }
      const arr = [...set].sort((a, b) => a.localeCompare(b));
      if (arr.length) return arr;
    } catch (err) {
      console.warn('queryLocalFonts() failed:', err);
      // fall through to other attempts/fallback
    }
  }

  // Some experimental implementations exposed via navigator.fonts.query()
  try {
    if (navigator.fonts && typeof navigator.fonts.query === 'function') {
      const q = await navigator.fonts.query();
      const set = new Set();
      // q might be an async iterable in some polyfills/experiments
      if (q && Symbol.asyncIterator in Object(q)) {
        for await (const f of q) {
          const n = f.fullName || f.postscriptName || f.family;
          if (n) set.add(n);
        }
      } else if (q && (Array.isArray(q) || Symbol.iterator in Object(q))) {
        for (const f of q) {
          const n = f.fullName || f.postscriptName || f.family;
          if (n) set.add(n);
        }
      }
      const arr = [...set].sort((a, b) => a.localeCompare(b));
      if (arr.length) return arr;
    }
  } catch (err) {
    console.warn('navigator.fonts.query() failed:', err);
  }

  // As a last API attempt, try the old/undocumented navigator.queryLocalFonts
  try {
    if (typeof navigator.queryLocalFonts === 'function') {
      const q = await navigator.queryLocalFonts();
      const set = new Set();
      for (const f of q) {
        const n = f.fullName || f.postscriptName || f.family;
        if (n) set.add(n);
      }
      const arr = [...set].sort((a, b) => a.localeCompare(b));
      if (arr.length) return arr;
    }
  } catch (err) {
    console.warn('navigator.queryLocalFonts() failed:', err);
  }

  // No working API detected or permission denied/empty result
  return null;
}

function hashCandidates(list) {
  let h = 0, str = list.join('|');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function render() {
  const filter = (flt.value || '').toLowerCase();
  out.innerHTML = '';
  const list = !filter ? fonts : fonts.filter(f => f.toLowerCase().includes(filter));
  if (!list.length) { out.textContent = fonts.length ? 'No match' : 'None'; return; }
  const frag = document.createDocumentFragment();
  for (const name of list) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('h2').textContent = name;
    const sample = node.querySelector('.s');
    sample.textContent = txt.value;
    sample.style.cssText = `font-family:'${name}',${fallback(name)};font-size:${sz.value}px`;
    frag.appendChild(node);
  }
  out.appendChild(frag);
  setStatus(`${list.length}/${fonts.length}`);
}

function copyNames() {
  if (!fonts.length) return;
  navigator.clipboard.writeText(fonts.join('\n'))
    .then(() => setStatus('Copied'))
    .catch(() => setStatus('Copy failed'));
}

function toggleTheme() {
  const dark = document.body.classList.toggle('dark');
  th.textContent = dark ? 'Light' : 'Dark';
  th.setAttribute('aria-pressed', dark);
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

function restoreTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    th.textContent = 'Light';
    th.setAttribute('aria-pressed', 'true');
  }
}

async function start() {
  setStatus('Detecting…');
  let list = await apiFonts();
  let method = 'api';
  if (!list || !list.length) { list = await heuristicFonts(); method = 'heuristic'; }
  fonts = list;
  setStatus(`${fonts.length} fonts (${method})`);
  render();
}

// Event bindings
txt.oninput = render;
sz.oninput = render;
flt.oninput = render;
cpy.onclick = copyNames;
th.onclick = toggleTheme;

restoreTheme();
start();
