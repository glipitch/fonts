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
  if ('queryLocalFonts' in window) {
    try {
      const status = await navigator.permissions.query({ name: 'local-fonts' });
      if (status.state === 'granted') {
        const fonts = await window.queryLocalFonts();
        const set = new Set();
        for (const f of fonts) {
          const n = f.fullName || f.postscriptName || f.family;
          if (n) set.add(n);
        }
        return [...set].sort((a, b) => a.localeCompare(b));
      }
    } catch (err) {
      console.warn('Local Font Access API failed:', err);
    }
  }
  return null;
}

function hashCandidates(list) {
  let h = 0, str = list.join('|');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function loadCache(hash) {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}:${hash}:${navigator.userAgent}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.time > 7 * 24 * 60 * 60 * 1000) return null;
    return obj.fonts || null;
  } catch { return null; }
}

function saveCache(hash, fonts) {
  try { localStorage.setItem(`${CACHE_KEY_PREFIX}:${hash}:${navigator.userAgent}`, JSON.stringify({ time: Date.now(), fonts })); } catch { }
}

async function heuristicFonts() {
  if (webFontFaces.length) {
    const style = document.createElement('style');
    style.textContent = webFontFaces.join('\n');
    document.head.appendChild(style);
    await new Promise(r => setTimeout(r, 30));
  }
  const uniq = [...new Set(candidateFonts)];
  const hash = hashCandidates(uniq);
  const cached = loadCache(hash);
  if (cached && cached.length) return cached;
  initBaseline();
  const found = [];
  for (const n of uniq) { try { if (hasFont(n)) found.push(n); } catch { } }
  found.sort((a, b) => a.localeCompare(b));
  saveCache(hash, found);
  return found;
}

function fallback(name) {
  const n = name.toLowerCase();
  if (/mono|code/.test(n)) return 'monospace';
  if (/serif|times|georgia|garamond/.test(n)) return 'serif';
  return 'sans-serif';
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
