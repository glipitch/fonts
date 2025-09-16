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
  // Follow the Google sample pattern: request permission, call queryLocalFonts(),
  // and inject @font-face rules so full font/variation names can be used.
  if (typeof queryLocalFonts !== 'function') return null;
  try {
    // Try requesting permission explicitly where supported.
    if (navigator.permissions && typeof navigator.permissions.request === 'function') {
      try {
        const r = await navigator.permissions.request({ name: 'local-fonts' });
        if (r && r.state === 'denied') return null;
      } catch (err) {
        // Some browsers throw TypeError if the permission name isn't implemented — allow to proceed
        if (err && err.name !== 'TypeError') throw err;
      }
    }

    const picked = await queryLocalFonts();
    if (!picked || !picked.length) return null;

    // Build stylesheet rules exposing full/postscript names via local() so we can use them in font-family
    const rules = [];
    for (const meta of picked) {
      const full = meta.fullName;
      const post = meta.postscriptName;
      if (full) {
        const src = post ? `local('${full}'), local('${post}')` : `local('${full}')`;
        rules.push(`@font-face{font-family:'${full}';src:${src};}`);
      }
    }

    if (rules.length) {
      try {
        // Prefer Constructable Stylesheets when available
        if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
          const ss = new CSSStyleSheet();
          ss.replaceSync(rules.join('\n'));
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, ss];
        } else {
          const style = document.createElement('style');
          style.textContent = rules.join('\n');
          document.head.appendChild(style);
        }
      } catch (err) {
        // non-fatal
        console.warn('Failed to inject font-face rules:', err);
      }
    }

    const set = new Set();
    for (const meta of picked) {
      const n = meta.fullName || meta.postscriptName || meta.family;
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.warn('Local font access failed:', err);
    return null;
  }
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
