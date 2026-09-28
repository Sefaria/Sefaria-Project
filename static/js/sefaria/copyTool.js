/*
  Copy Tool: copy a word, segment or section of a text with a chosen set of
  languages, versions, formats and extras (citation, numbers, notes, vowels).

  This module holds everything that isn't React: settings persistence, finding
  what was right-clicked, fetching text, rendering output and writing to the
  clipboard. The UI lives in CopyTool.jsx; ReaderApp wires the two together.

  Browser-only: nothing here may run during SSR render.
*/
import Sefaria from './sefaria';

export const LEVELS = { WORD: 'word', SEGMENT: 'segment', SECTION: 'section' };
export const FORMATS = { FORMATTED: 'formatted', PLAIN: 'plain', MARKDOWN: 'markdown', HTML: 'html' };
export const NOTES = { OMIT: 'omit', INLINE: 'inline', END: 'end' };
export const VOWELS = { ALL: 'all', VOWELS: 'vowels', NONE: 'none' };

export const DEFAULT_SETTINGS = {
  level: LEVELS.SEGMENT,
  languages: null,       // {source: bool, translation: bool}; null means "whatever is on screen"
  format: FORMATS.FORMATTED,
  citation: true,
  segmentNumbers: false,
  notes: NOTES.OMIT,
  vowels: VOWELS.ALL,
};

// Same character classes TextRange uses for its vowel display options.
const CANTILLATION_RE = /[֑-ֽֿ֯׀ׅׄ‍]/g;
const CANTILLATION_AND_NIKKUD_RE = /[֑-ֽֿ-ׇׅ‍]/g;
const NIKKUD_TEST_RE = /[֑-ׇ]/;


/* ---------- Persistence ---------- */

const SETTINGS_KEY = 'copyTool.settings';
const ANON_COUNT_KEY = 'copyTool.anonCopies';
const PENDING_KEY = 'copyTool.pending';
const PENDING_TTL_MS = 60 * 60 * 1000;

const storageGet = (key) => {
  try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
};
const storageSet = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
};
const storageRemove = (key) => {
  try { window.localStorage.removeItem(key); } catch (e) {}
};

export const loadSettings = () => {
  const saved = storageGet(SETTINGS_KEY);
  return saved ? {...DEFAULT_SETTINGS, ...saved} : null;
};
export const saveSettings = (settings) => storageSet(SETTINGS_KEY, settings);
export const hasPreviousSettings = () => !!storageGet(SETTINGS_KEY);

// Anonymous users get one copy; every attempt after that shows the sign-up pitch.
export const recordCopy = () => {
  if (!Sefaria._uid) { storageSet(ANON_COUNT_KEY, (storageGet(ANON_COUNT_KEY) || 0) + 1); }
};
export const shouldPitch = () => !Sefaria._uid && (storageGet(ANON_COUNT_KEY) || 0) >= 1;

// A copy request interrupted by the sign-up pitch, resumed after login lands back on the page.
export const stashPending = (target) => storageSet(PENDING_KEY, {target, time: Date.now()});
export const clearPending = () => storageRemove(PENDING_KEY);
export const takePending = () => {
  const pending = storageGet(PENDING_KEY);
  clearPending();
  return pending && Date.now() - pending.time < PENDING_TTL_MS ? pending.target : null;
};


/* ---------- Finding the target of a right-click ---------- */

const WORD_BOUNDARY_RE = /[\s.,;:!?()\[\]{}<>"“”«»—–־׀׃…]/;

export function wordAt(text, offset) {
  // Returns the word in `text` around character `offset`, or null.
  if (!text) { return null; }
  offset = Math.min(Math.max(offset, 0), text.length);
  if ((offset === text.length || WORD_BOUNDARY_RE.test(text[offset])) && offset > 0 && !WORD_BOUNDARY_RE.test(text[offset - 1])) {
    offset -= 1;  // clicked just past the end of a word
  }
  let start = offset, end = offset;
  while (start > 0 && !WORD_BOUNDARY_RE.test(text[start - 1])) { start--; }
  while (end < text.length && !WORD_BOUNDARY_RE.test(text[end])) { end++; }
  const word = text.slice(start, end).replace(/^['‘’]+|['‘’]+$/g, '');
  return word || null;
}

function caretAt(x, y) {
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    return pos && {node: pos.offsetNode, offset: pos.offset};
  }
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    return range && {node: range.startContainer, offset: range.startOffset};
  }
  return null;
}

const isVisible = (el) => !!el && el.getClientRects().length > 0;

function wordAtPoint(container, x, y) {
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !container.contains(caret.node)) { return null; }
  if (caret.node.parentElement.closest('.segmentNumber, .linkCount, .footnote-marker, .footnote')) { return null; }
  return wordAt(caret.node.textContent, caret.offset);
}

const versionOrNull = (v) => v && v.versionTitle ? {languageFamilyName: v.languageFamilyName, versionTitle: v.versionTitle} : null;

export function getTargetFromEvent(e, panels) {
  /*
  Returns a serializable description of the right-clicked text, or null when the
  click isn't on copyable library text (the browser menu then opens as usual).
  */
  const el = e.target instanceof Element ? e.target : e.target?.parentElement;
  if (!el || el.closest('input, textarea, [contenteditable="true"], .sheetContent, a[href]:not(.namedEntityLink)')) { return null; }

  const segmentEl = el.closest('.readerPanel .segment[data-ref]');
  if (segmentEl) {
    const panelEl = segmentEl.closest('.readerPanel');
    const panel = panels[Array.from(document.querySelectorAll('.readerPanel')).indexOf(panelEl)];
    if (!panel || panel.mode === 'Sheet') { return null; }
    // Commentary in the connections panel shows default versions; the main text shows the panel's.
    const currVersions = panel.mode === 'Connections' ? {} : (panel.currVersions || {});
    const spanEl = el.closest('.contentSpan');
    return {
      ref: segmentEl.getAttribute('data-ref'),
      word: wordAtPoint(segmentEl, e.clientX, e.clientY),
      wordLang: spanEl ? (spanEl.classList.contains('primary') ? 'source' : 'translation') : null,
      versions: {source: versionOrNull(currVersions.he), translation: versionOrNull(currVersions.en)},
      shown: {
        source: isVisible(segmentEl.querySelector('.contentSpan.primary')),
        translation: isVisible(segmentEl.querySelector('.contentSpan.translation')),
      },
    };
  }

  const resultEl = el.closest('.textResult[data-ref]');
  if (resultEl && el.closest('.snippet')) {
    const isPrimary = resultEl.getAttribute('data-is-primary') === 'true';
    const version = versionOrNull({
      languageFamilyName: resultEl.getAttribute('data-language-family'),
      versionTitle: resultEl.getAttribute('data-version-title'),
    });
    return {
      ref: resultEl.getAttribute('data-ref'),
      word: wordAtPoint(resultEl, e.clientX, e.clientY),
      wordLang: isPrimary ? 'source' : 'translation',
      versions: {source: isPrimary ? version : null, translation: isPrimary ? null : version},
      shown: {source: isPrimary, translation: !isPrimary},
    };
  }
  return null;
}


/* ---------- Loading text and versions ---------- */

const _textCache = {};
function fetchText(ref, version) {
  // Exact text of one version, without filling gaps from other versions.
  const url = Sefaria.makeUrlForAPIV3Text(ref, [version], false, 'default');
  if (!_textCache[url]) {
    _textCache[url] = Promise.resolve(Sefaria._ApiPromise(url))
      .then(data => { if (data.error) { throw new Error(data.error); } return data; })
      .catch(err => { delete _textCache[url]; throw err; });
  }
  return _textCache[url];
}

export async function loadTargetInfo(target, translationLanguagePreference) {
  /*
  Everything the dialog needs about a target: the version choices per language,
  the versions on screen (resolved the same way the reader resolves them), and
  the named levels (e.g. Verse / Chapter, Line / Daf) it can be copied at.
  */
  const [versionsByLang, [source, translation]] = await Promise.all([
    Sefaria.getVersions(target.ref),
    Sefaria._getVersionObjects(target.ref, target.versions.source || {}, target.versions.translation || {}, translationLanguagePreference),
  ]);
  const all = Object.values(versionsByLang).flat();
  // Highest priority wins (missing = 0); ties go to the primary version, then a locked one.
  const byPriority = (a, b) => (b.priority || 0) - (a.priority || 0)
    || (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
    || (b.status === 'locked' ? 1 : 0) - (a.status === 'locked' ? 1 : 0);
  const sourceVersions = all.filter(v => v.isSource || v.isPrimary).sort(byPriority);
  const translationVersions = all.filter(v => !v.isSource && !v.isPrimary).sort(byPriority);
  const pick = (resolved, options) => {
    const match = resolved?.versionTitle && options.find(v => v.versionTitle === resolved.versionTitle && v.languageFamilyName === resolved.languageFamilyName);
    const v = match || options[0];
    return v ? {languageFamilyName: v.languageFamilyName, versionTitle: v.versionTitle} : null;
  };
  // _getVersionObjects can come back with no versionTitle (just {languageFamilyName: 'translation'}) when
  // the reader didn't pin one; options[0] would then be whatever's globally top-priority, which can be a
  // non-English translation. Match the reader: its language preference bucket, then English, then top priority.
  const pickTranslation = (resolved, options) => {
    if (resolved?.versionTitle) { return pick(resolved, options); }
    const byLang = lang => options.find(v => (v.actualLanguage || v.language) === lang);
    const v = (translationLanguagePreference && byLang(translationLanguagePreference)) || byLang('en') || options[0];
    return v ? {languageFamilyName: v.languageFamilyName, versionTitle: v.versionTitle} : null;
  };
  const defaults = {source: pick(source, sourceVersions), translation: pickTranslation(translation, translationVersions)};
  if (!defaults.source && !defaults.translation) { throw new Error('no versions'); }
  const meta = await fetchText(target.ref, defaults.source || defaults.translation);
  const names = meta.sectionNames || [];
  const levels = [];
  if (target.word) { levels.push({level: LEVELS.WORD}); }
  levels.push({level: LEVELS.SEGMENT, name: names[meta.textDepth - 1] || 'Segment', ref: meta.ref, heRef: meta.heRef});
  if (meta.textDepth >= 2 && meta.sectionRef !== meta.ref) {
    levels.push({level: LEVELS.SECTION, name: names[meta.textDepth - 2], ref: meta.sectionRef, heRef: meta.heSectionRef});
  }
  return {versions: {source: sourceVersions, translation: translationVersions}, defaults, levels};
}

export function resolveOptions(target, info, settings) {
  // Merge saved settings with what this target supports.
  const available = {source: !!info.defaults.source, translation: !!info.defaults.translation};
  let level = settings.level;
  if (!info.levels.some(l => l.level === level)) { level = LEVELS.SEGMENT; }
  let languages = settings.languages || target.shown;
  languages = {source: languages.source && available.source, translation: languages.translation && available.translation};
  if (!languages.source && !languages.translation) {
    languages = available.source ? {source: true, translation: false} : {source: false, translation: true};
  }
  return {...settings, level, languages, versions: {...info.defaults}};
}

export async function loadCopyData(target, info, options) {
  // Fetch the texts for `options` and return the input to `render`.
  const levelInfo = info.levels.find(l => l.level === options.level);
  if (options.level === LEVELS.WORD) {
    const lang = target.wordLang === 'translation' && options.versions.translation ? 'translation' : 'source';
    const data = await fetchText(target.ref, options.versions[lang]);
    return {level: LEVELS.WORD, word: target.word, wordLang: lang, meta: data, versionInfo: {[lang]: data.versions[0] || null}, segments: []};
  }
  const ref = levelInfo.ref;
  const langs = ['source', 'translation'].filter(l => options.languages[l] && options.versions[l]);
  const results = await Promise.all(langs.map(l => fetchText(ref, options.versions[l])));
  const meta = results[0];
  const versionInfo = {};
  const texts = {};
  langs.forEach((l, i) => {
    versionInfo[l] = results[i].versions[0] || null;
    texts[l] = versionInfo[l]?.text;
  });
  return {level: options.level, meta, versionInfo, segments: toSegments(meta, texts)};
}

export function toSegments(meta, texts) {
  // Flat list of {ref, number, source, translation} using the reader's segment logic.
  // v3 returns sections as strings; makeSegments does arithmetic on them.
  const toNum = s => (typeof s === 'string' && /^\d+$/.test(s)) ? parseInt(s, 10) : s;
  const data = {
    ...meta,
    sections: (meta.sections || []).map(toNum),
    toSections: (meta.toSections || []).map(toNum),
    he: texts.source ?? [],
    text: texts.translation ?? [],
  };
  return Sefaria.makeSegments(data, false).map(s => ({ref: s.ref, number: s.number, source: s.he || '', translation: s.en || ''}));
}


/* ---------- Rendering ---------- */

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeMarkdown = (s) => s.replace(/([\\*_`])/g, '\\$1');

function stripVowels(text, vowels) {
  if (vowels === VOWELS.VOWELS) { return text.replace(CANTILLATION_RE, ''); }
  if (vowels === VOWELS.NONE) { return text.replace(CANTILLATION_AND_NIKKUD_RE, ''); }
  return text;
}

function markdownWrap(inner, mark) {
  // Emphasis markers must hug the text: "** bold **" isn't bold, " **bold** " is.
  const [, lead, body, trail] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return body ? `${lead}${mark}${body}${mark}${trail}` : inner;
}

function renderNodes(nodes, format, ctx) {
  return Array.from(nodes).map(node => renderNode(node, format, ctx)).join('');
}

function renderNode(node, format, ctx) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = stripVowels(node.textContent.replace(/\s+/g, ' '), ctx.vowels);
    return format === FORMATS.MARKDOWN ? escapeMarkdown(text) : (format === FORMATS.PLAIN ? text : escapeHtml(text));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) { return ''; }
  const tag = node.tagName.toLowerCase();
  const html = format === FORMATS.FORMATTED || format === FORMATS.HTML;

  if (tag === 'sup' && node.classList.contains('footnote-marker')) {
    if (ctx.notes !== NOTES.END) { return ''; }
    const n = ++ctx.noteCount;
    return html ? `<sup>[${n}]</sup>` : (format === FORMATS.MARKDOWN ? `[^${n}]` : `[${n}]`);
  }
  if (tag === 'i' && node.classList.contains('footnote')) {
    ctx.hasNotes = true;
    if (ctx.notes === NOTES.OMIT) { return ''; }
    const inner = renderNodes(node.childNodes, format, ctx).trim();
    if (ctx.notes === NOTES.END) { ctx.endNotes.push(inner); return ''; }
    return html ? ` [<i>${inner}</i>]` : (format === FORMATS.MARKDOWN ? ` [${markdownWrap(inner, '*')}]` : ` [${inner}]`);
  }

  const inner = renderNodes(node.childNodes, format, ctx);
  switch (tag) {
    case 'br':
      return html ? '<br>' : (format === FORMATS.MARKDOWN ? '  \n' : '\n');
    case 'b': case 'strong':
      return html ? `<b>${inner}</b>` : (format === FORMATS.MARKDOWN ? markdownWrap(inner, '**') : inner);
    case 'i': case 'em':
      return html ? `<i>${inner}</i>` : (format === FORMATS.MARKDOWN ? markdownWrap(inner, '*') : inner);
    case 'sup': case 'sub': case 'small': case 'big':
      return html ? `<${tag}>${inner}</${tag}>` : inner;
    default:
      return inner;  // spans, links, etc. are unwrapped
  }
}

function renderText(textHtml, format, ctx) {
  const template = document.createElement('template');
  template.innerHTML = textHtml || '';
  return renderNodes(template.content.childNodes, format, ctx).trim();
}

const versionTitle = (v) => (Sefaria.interfaceLang === 'hebrew' && v.versionTitleInHebrew) || v.versionTitle;

function citation(data, format) {
  const hebrew = Sefaria.interfaceLang === 'hebrew';
  const ref = hebrew ? data.meta.heRef : data.meta.ref;
  let url = Sefaria.util.fullURL('/' + Sefaria.normRef(data.meta.ref), Sefaria.LIBRARY_MODULE);
  if (url.startsWith('/')) { url = window.location.origin + url; }  // pasted links must be absolute
  const versions = ['source', 'translation']
    .map(l => data.versionInfo[l])
    .filter(v => v && v.versionTitle)
    .map(v => versionTitle(v) + (v.license && v.license !== 'unknown' ? ` (${v.license})` : ''))
    .join('; ');
  const details = versions ? `, ${versions}` : '';
  if (format === FORMATS.PLAIN) { return `— ${ref}${details}, ${url}`; }
  if (format === FORMATS.MARKDOWN) { return `— [${escapeMarkdown(ref)}](${url})${escapeMarkdown(details)}`; }
  return `<a href="${escapeHtml(url)}">${escapeHtml(ref)}</a>${escapeHtml(details)}`;
}

function segmentNumber(n, onlyHebrew) {
  return onlyHebrew ? Sefaria.hebrew.encodeHebrewNumeral(n, false) : String(n);
}

export function hasNikkud(data) {
  return data.level === LEVELS.WORD ? NIKKUD_TEST_RE.test(data.word) : data.segments.some(s => NIKKUD_TEST_RE.test(s.source));
}

export function render(data, options) {
  /*
  Returns {plain, html, hasNotes}. `html` is null for formats that paste as text.
  Bilingual output is stacked: each segment's source, then its translation.
  */
  const format = options.format;
  const asHtml = format === FORMATS.FORMATTED || format === FORMATS.HTML;
  const ctx = {notes: options.notes, vowels: options.vowels, noteCount: 0, endNotes: [], hasNotes: false};
  const dirOf = (lang) => data.versionInfo[lang]?.direction || (lang === 'source' ? 'rtl' : 'ltr');
  const langAttr = (lang) => (data.versionInfo[lang]?.actualLanguage || data.versionInfo[lang]?.language || (lang === 'source' ? 'he' : 'en'));
  const blocks = [];  // [{lang, body, number}], rendered per format below
  const missing = {};  // per language: segments with no text at all in that version (fill_in_missing_segments=0 leaves them blank)
  let missingSegments = 0;  // distinct segments empty in any selected language (what the dialog's coverage note counts)

  if (data.level === LEVELS.WORD) {
    blocks.push({lang: data.wordLang, body: renderText(escapeHtml(data.word), format, ctx)});
  } else {
    const langs = ['source', 'translation'].filter(l => data.versionInfo[l]);
    langs.forEach(l => { missing[l] = data.segments.filter(seg => !seg[l]).length; });
    missingSegments = data.segments.filter(seg => langs.some(l => !seg[l])).length;
    const onlyHebrew = langs.length === 1 && dirOf(langs[0]) === 'rtl';
    data.segments.forEach(seg => {
      let first = true;
      langs.forEach(lang => {
        const body = renderText(seg[lang], format, ctx);
        if (!body) { return; }
        blocks.push({lang, body, number: options.segmentNumbers && first ? segmentNumber(seg.number, onlyHebrew) : null, segmentStart: first});
        first = false;
      });
    });
  }
  if (!blocks.length) { return {plain: '', html: null, hasNotes: ctx.hasNotes, missing, missingSegments}; }

  const bilingual = new Set(blocks.map(b => b.lang)).size > 1;
  const cite = options.citation ? citation(data, format) : null;

  if (asHtml) {
    const lines = blocks.map(b => {
      const num = b.number ? `<b>${b.number}</b> ` : '';
      return `<p dir="${dirOf(b.lang)}" lang="${langAttr(b.lang)}">${num}${b.body}</p>`;
    });
    ctx.endNotes.forEach((note, i) => lines.push(`<p><small>[${i + 1}] ${note}</small></p>`));
    if (cite) { lines.push(`<p><small>— ${cite}</small></p>`); }
    const html = lines.join('\n');
    // Formatted pastes as rich text with a plain fallback; HTML source pastes the markup itself.
    return format === FORMATS.HTML
      ? {plain: html, html: null, hasNotes: ctx.hasNotes, missing, missingSegments}
      : {plain: render(data, {...options, format: FORMATS.PLAIN}).plain, html, hasNotes: ctx.hasNotes, missing, missingSegments};
  }

  const md = format === FORMATS.MARKDOWN;
  const pieces = blocks.map((b, i) => {
    const num = b.number ? (md ? `**${b.number}** ` : `(${b.number}) `) : '';
    // Paragraph breaks between segments (and between every line in Markdown); line breaks within a segment.
    const sep = i === 0 ? '' : (md || (bilingual && b.segmentStart) ? '\n\n' : '\n');
    return sep + num + b.body;
  });
  let out = pieces.join('');
  if (ctx.endNotes.length) {
    out += '\n\n' + ctx.endNotes.map((note, i) => md ? `[^${i + 1}]: ${note}` : `[${i + 1}] ${note}`).join('\n');
  }
  if (cite) { out += '\n\n' + cite; }
  return {plain: out, html: null, hasNotes: ctx.hasNotes, missing, missingSegments};
}


/* ---------- Clipboard ---------- */

function textareaCopy(text) {
  // Last resort for browsers without the async clipboard API. ReaderApp's copy handler skips textareas.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) { throw new Error('copy failed'); }
}

export async function writeClipboard(output, withHtml) {
  /*
  `output` is {plain, html} or a promise of one. Passing a promise lets the write
  start inside the click (Safari requires that) while the text is still loading.
  */
  if (window.ClipboardItem && navigator.clipboard?.write) {
    const outputPromise = Promise.resolve(output);
    const blob = (key, type) => outputPromise.then(o => new Blob([o[key]], {type}));
    const items = {'text/plain': blob('plain', 'text/plain')};
    if (withHtml) { items['text/html'] = blob('html', 'text/html'); }
    try {
      await navigator.clipboard.write([new ClipboardItem(items)]);
      return;
    } catch (e) {
      // Some browsers reject promise-valued items; fall through with the resolved text.
    }
  }
  const o = await output;
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(o.plain); return; } catch (e) {}
  }
  textareaCopy(o.plain);
}

export async function copyWithSettings(target, settings, translationLanguagePreference) {
  // One-step copy (menu shortcut and the anonymous "just copy" fallback). Returns the copied output.
  const outputPromise = (async () => {
    const info = await loadTargetInfo(target, translationLanguagePreference);
    const options = resolveOptions(target, info, settings);
    const output = render(await loadCopyData(target, info, options), options);
    if (!output.plain) { throw new Error('no text'); }
    return output;
  })();
  await writeClipboard(outputPromise, settings.format === FORMATS.FORMATTED);
  return outputPromise;
}
