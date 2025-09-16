const sampleInput = document.getElementById('sample-input');
const sizeInput = document.getElementById('sample-size');
const weightSelect = document.getElementById('sample-weight');
// Shared user-facing message used in multiple places below
const NOT_AVAILABLE_MSG = 'The Font Access API (queryLocalFonts) is not available in your browser.';
if (sampleInput) {
  const setPreviewText = (text) => {
    const gallery = document.getElementById('font-gallery');
    if (gallery) {
      if (window.__localFontsCache) {
        renderFontGallery(window.__localFontsCache, text);
      }
    }
  };

  setPreviewText(sampleInput.value || sampleInput.placeholder || '');

  sampleInput.addEventListener('input', (e) => {
    setPreviewText(e.target.value);
  });
  const updateFromControls = () => {
    if (window.__localFontsCache) {
      renderFontGallery(window.__localFontsCache, sampleInput.value || '');
    }
  };
  sizeInput?.addEventListener('input', updateFromControls);
  weightSelect?.addEventListener('change', updateFromControls);
}

// Render a simple gallery of fonts: family name and the sample text in that font.
function renderFontGallery(fonts, sampleText) {
  const gallery = document.getElementById('font-gallery');
  if (!gallery) return;
  gallery.innerHTML = '';
  const size = parseInt(document.getElementById('sample-size')?.value || '24', 10);
  const weight = document.getElementById('sample-weight')?.value || '400';
  fonts.forEach((metadata) => {
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
  });
}

// Fetch local fonts, dedupe by family, and cache. Returns an array of family metadata.
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

// Check whether a font family supports the requested weight using the FontFaceSet.check API.
// The app displays the fonts returned by the Font Access API; additional
// filtering or heuristics are intentionally omitted.

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

// Note: we intentionally do not call any programmatic permission.request().
// The code will only proceed when the Permissions API reports 'granted', or
// when the Permissions API is absent (in which case we attempt queryLocalFonts()
// directly). This avoids triggering permission prompts programmatically; if the
// browser wants to prompt the user it will do so for the appropriate API call.

// High-level flow: only prompt if permission state is not already 'granted'. If granted, fetch and render immediately.
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
    setStatus('Permission to access local fonts denied or unavailable. You can try again below.', true);
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
  const aliasMap = new Map();
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
    } catch (e) {}
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
  setStatus(`Rendered ${pickedFonts.length} font entries.`);
}

if (navigator.permissions && 'query' in navigator.permissions) {
  try {
    navigator.permissions.query({ name: 'local-fonts' }).then((status) => {
      if (status && typeof status.addEventListener === 'function') {
        status.addEventListener('change', async () => {
          if (status.state === 'granted') {
            // Refresh fonts when permission becomes granted
            await requestFontsAndRender();
          }
        });
      }
    }).catch(() => {
      // ignore
    });
  } catch (err) {
    // ignore
  }
}

if (window.__localFontsCache && document.getElementById('font-gallery')) {
  renderFontGallery(window.__localFontsCache, document.getElementById('sample-input')?.value || '');
  setPermissionNote('', false);
}
function setPermissionNote(text, visible = true, color = '') {
  const note = document.getElementById('permission-note');
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
        const galleryEl = document.getElementById('font-gallery');
        if (galleryEl) galleryEl.innerHTML = '';
      }
    } catch (err) {
      setPermissionNote('', false);
    }
  } else {
    setPermissionNote('', false);
    try {
      requestFontsAndRender();
    } catch (e) {}
  }
}

// Initialize permission-related UI on load
initPermissionUI().catch(() => {});
