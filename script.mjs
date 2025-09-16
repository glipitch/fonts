const sampleInput = document.getElementById('sample-input');
const sizeInput = document.getElementById('sample-size');
const weightSelect = document.getElementById('sample-weight');
const filterInput = document.getElementById('filter-input');
const $ = (id) => document.getElementById(id);
const NOT_AVAILABLE_MSG = "The Font Access API (queryLocalFonts) is not available in your browser.\nIf your browser supports the API, check site permissions.";
if (sampleInput) {
  const setPreviewText = (text) => {
    const gallery = $('font-gallery');
    if (gallery && window.__localFontsCache) renderFontGallery(window.__localFontsCache, text);
  };

  setPreviewText(sampleInput.value || sampleInput.placeholder || '');

  sampleInput.addEventListener('input', (e) => {
    setPreviewText(e.target.value);
  });
  const updateFromControls = () => {
    if (window.__localFontsCache) renderFontGallery(window.__localFontsCache, sampleInput.value || '');
  };
  sizeInput?.addEventListener('input', updateFromControls);
  weightSelect?.addEventListener('change', updateFromControls);
  filterInput?.addEventListener('input', updateFromControls);
}

function renderFontGallery(fonts, sampleText) {
  const gallery = $('font-gallery');
  if (!gallery) return;
  gallery.innerHTML = '';
  const filter = (filterInput?.value || '').trim().toLowerCase();
  const size = parseInt(sizeInput?.value || '24', 10);
  const weight = weightSelect?.value || '400';
  let renderedCount = 0;
  fonts.forEach((metadata) => {
    if (filter) {
      const name = (metadata.fullName || metadata.family || metadata.postscriptName || '').toLowerCase();
      if (!name.includes(filter)) return;
    }
    const container = document.createElement('div');
    container.className = 'font-sample';
    const title = document.createElement('div');
    title.className = 'font-name';
    title.textContent = metadata.fullName || metadata.family || metadata.postscriptName || 'Unknown';
    const sample = document.createElement('div');
    sample.className = 'font-sample-text';
    sample.style.fontFamily = metadata.__localFamily || metadata.fullName || metadata.family || metadata.postscriptName || '';
    sample.style.fontSize = `${size}px`;
    sample.style.fontWeight = weight;
    sample.textContent = sampleText || '';
    container.appendChild(title);
    container.appendChild(sample);
    gallery.appendChild(container);
    renderedCount++;
  });

  // Display only the number of visible fonts (after any filtering)
  setStatus(String(renderedCount));
}

async function fetchAndCacheLocalFonts() {
  try {
    const pickedFonts = await queryLocalFonts();
    window.__localFontsCache = pickedFonts;
    return pickedFonts;
  } catch (err) {
    console.warn('Could not query local fonts:', err);
    throw err;
  }
}

function setStatus(text, isError = false) {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = text;
  status.style.color = isError ? 'crimson' : '';
  if (isError && text.includes('Permission to access local fonts denied or unavailable')) {
    status.style.textAlign = 'center';
    status.style.display = 'block';
    status.style.width = '100%';
  } else {
    status.style.textAlign = '';
  }
}

async function requestFontsAndRender() {
  const sampleText = document.getElementById('sample-input')?.value || '';
  const gallery = document.getElementById('font-gallery');
  if (!gallery) return;
  if (!(typeof window.queryLocalFonts === 'function')) {
    setStatus('Font Access API is not available in this browser.', true);
    setPermissionNote(NOT_AVAILABLE_MSG, true, 'brown');
    gallery.innerHTML = '';
    return;
  }

  setStatus('Checking permission to access local fonts...');

  let canAccess = false;
  try {
    if (navigator.permissions && 'query' in navigator.permissions) {
      const state = await navigator.permissions.query({ name: 'local-fonts' });
      if (state.state === 'granted') {
        canAccess = true;
      } else {
        canAccess = false;
      }
    } else {
      canAccess = true;
    }
  } catch (err) {
    canAccess = false;
  }

  if (!canAccess) {
    setStatus('Permission to access local fonts denied or unavailable.', true);
    const galleryEl = document.getElementById('font-gallery');
    if (galleryEl) galleryEl.innerHTML = '';
    return;
  }

  setStatus('Querying local fonts (Font Access API, if available)...');

  let pickedFonts;
  try {
    pickedFonts = await fetchAndCacheLocalFonts();
  } catch (err) {
    setStatus('Failed to query local fonts. Ensure you are using a browser that supports the Font Access API.', true);
    return;
  }

  if (!pickedFonts || pickedFonts.length === 0) {
    setStatus('No local fonts returned by the API.', true);
    return;
  }

  setStatus(`Received ${pickedFonts.length} font entries from API. Preparing CSS...`);

  const rules = [];
  for (const font of pickedFonts) {
    const full = font.fullName || '';
    const post = font.postscriptName || '';
    if (!full && !post) continue;
    const escFull = full.replace(/'/g, "\\'");
    const escPost = post.replace(/'/g, "\\'");
    const idx = rules.length;
    const alias = `__local_font_${idx}`;
    const srcParts = [];
    if (escFull) srcParts.push(`local('${escFull}')`);
    if (escPost && escPost !== escFull) srcParts.push(`local('${escPost}')`);
    const weightVal = font.weight || font.wght || 400;
    const styleVal = (font.style || font.italic) ? 'italic' : 'normal';
    const src = srcParts.join(', ');
    if (!src) continue;
    rules.push(`@font-face { font-family: '${alias}'; src: ${src}; font-weight: ${weightVal}; font-style: ${styleVal}; font-display: block; }`);
    try {
      font.__localFamily = alias;
    } catch (e) { }
  }

  try {
    const sheet = new CSSStyleSheet();
    for (const r of rules) sheet.insertRule(r);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch (err) {
    const styleEl = document.createElement('style');
    styleEl.textContent = rules.join('\n');
    document.head.appendChild(styleEl);
  }

  renderFontGallery(pickedFonts, sampleText);
}

if (navigator.permissions && 'query' in navigator.permissions) {
  try {
    navigator.permissions.query({ name: 'local-fonts' }).then((status) => {
      if (status && typeof status.addEventListener === 'function') {
        status.addEventListener('change', async () => {
          if (status.state === 'granted') await requestFontsAndRender();
        });
      }
    }).catch(() => { });
  } catch (err) { }
}

if (window.__localFontsCache && $('font-gallery')) {
  renderFontGallery(window.__localFontsCache, sampleInput?.value || '');
  setPermissionNote('', false);
}
function setPermissionNote(text, visible = true, color = '') {
  const note = $('permission-note');
  if (!note) return;
  note.textContent = text;
  note.style.display = visible ? '' : 'none';
  note.style.color = color || '';
}

async function initPermissionUI() {
  if (navigator.permissions && 'query' in navigator.permissions) {
    try {
      if (!(typeof window.queryLocalFonts === 'function')) {
        setPermissionNote(NOT_AVAILABLE_MSG, true, 'brown');
        return;
      }
      const status = await navigator.permissions.query({ name: 'local-fonts' });
      if (status.state === 'granted') {
        setPermissionNote('', false);
        requestFontsAndRender();
      } else {
        setPermissionNote('Permission to access local fonts is not granted. If your browser prompts for access, follow its UI to allow it.', true);
        const galleryEl = $('font-gallery');
        if (galleryEl) galleryEl.innerHTML = '';
      }
    } catch (err) {
      setPermissionNote('', false);
    }
  } else {
    setPermissionNote('', false);
    try {
      requestFontsAndRender();
    } catch (e) { }
  }
}

initPermissionUI().catch(() => { });

// Attempt to trigger the browser permission prompt on the first user gesture
// (no additional UI). Some browsers require a user gesture for permission
// prompts; listening for a one-time pointer/keyboard/touch event and calling
// queryLocalFonts() from that handler will cause the browser to show the
// permission chooser on deploys like GitHub Pages.
let __localFontsUserGestureAttached = false;
async function attemptUserGestureQuery() {
  if (!(typeof window.queryLocalFonts === 'function')) return;
  if (window.__localFontsCache) return;
  try {
    setStatus('Requesting permission to access local fonts (user gesture)...');
    const fonts = await queryLocalFonts();
    window.__localFontsCache = fonts;
    setPermissionNote('', false);
    await requestFontsAndRender();
  } catch (err) {
    // If the call fails (user denied or API blocked), keep the existing
    // permission note/status. Don't surface an extra UI element.
    console.warn('User-gesture queryLocalFonts failed:', err);
  }
}

function addUserGestureListeners() {
  if (__localFontsUserGestureAttached) return;
  __localFontsUserGestureAttached = true;
  const handler = () => {
    // call but don't await here; handler options use { once: true }
    attemptUserGestureQuery();
  };
  // Use once:true so listeners remove themselves after firing.
  document.addEventListener('pointerdown', handler, { once: true, passive: true });
  document.addEventListener('keydown', handler, { once: true, passive: true });
  document.addEventListener('touchstart', handler, { once: true, passive: true });
}

// If the API exists and we don't already have cached fonts, attach a one-time
// user-gesture listener so the first user interaction will prompt for access.
if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function' && !window.__localFontsCache) {
  addUserGestureListeners();
}
