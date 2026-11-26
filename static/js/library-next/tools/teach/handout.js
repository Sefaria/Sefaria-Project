/**
 * The handout card: a bilingual, print-ready snippet of the selection. Pure shaping and
 * serialisation (HTML for the print view and the clipboard, Markdown for documents); the
 * component wires it to the reader. Grade level is a simulated tag: it only changes the
 * translation-style note and the type size. Jest-covered.
 */
import { plainText, stripHebrewMarks, canonicalUrl } from '../../reader/textData';

export const GRADE_LEVELS = ['elementary', 'middle', 'high', 'adult'];

/** Type scale per grade: younger readers get larger text. */
export const GRADE_FONT_SCALE = { elementary: 1.3, middle: 1.15, high: 1, adult: 0.95 };

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * `{ ref, heRef, title, heTitle, he: [lines], en: [lines], versionTitle, heVersionTitle, url, grade, scale }`
 * for the selection; `contentLang` drops a side (`he` | `en` | `bi`).
 */
export function handoutModel({ selection, book, grade = 'high', contentLang = 'bi', vowels = true, cantillation = true }) {
  const segments = selection.segments || [];
  return {
    ref: selection.ref,
    heRef: selection.heRef,
    title: book.title || '',
    heTitle: book.heTitle || book.title || '',
    he: contentLang === 'en' ? [] : segments.map(s => plainText(stripHebrewMarks(s.he, { vowels, cantillation }))).filter(Boolean),
    en: contentLang === 'he' ? [] : segments.map(s => plainText(s.en)).filter(Boolean),
    versionTitle: book.versionTitle || '',
    heVersionTitle: book.heVersionTitle || '',
    url: canonicalUrl(selection.ref),
    grade: GRADE_LEVELS.includes(grade) ? grade : 'high',
    scale: GRADE_FONT_SCALE[GRADE_LEVELS.includes(grade) ? grade : 'high'],
  };
}

/** The print stylesheet shared by the print view and the copied HTML (kept inline so the copy is self-contained). */
export const HANDOUT_CSS = `
  .ln-handout { font-family: Georgia, "Times New Roman", serif; max-width: 42rem; margin: 0 auto; padding: 1.5rem; color: #111; }
  .ln-handout header { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 2px solid #111; padding-bottom: .5rem; margin-bottom: 1rem; }
  .ln-handout h1 { font-size: 1.1rem; margin: 0; font-weight: 600; }
  .ln-handout h1[lang="he"] { font-family: "Taamey Frank", "Frank Ruehl", "David", serif; direction: rtl; }
  .ln-handout .text { display: grid; gap: 1rem; grid-template-columns: 1fr; }
  .ln-handout.bi .text { grid-template-columns: 1fr 1fr; }
  .ln-handout .he { direction: rtl; text-align: right; font-family: "Taamey Frank", "Frank Ruehl", "David", serif; font-size: calc(1.25rem * var(--scale, 1)); line-height: 1.7; }
  .ln-handout .en { direction: ltr; text-align: left; font-size: calc(1rem * var(--scale, 1)); line-height: 1.6; }
  .ln-handout p { margin: 0 0 .6em; }
  .ln-handout .n { font-size: .7em; vertical-align: super; color: #555; margin-inline-end: .3em; }
  .ln-handout footer { margin-top: 1.25rem; border-top: 1px solid #999; padding-top: .5rem; font-size: .75rem; color: #444; }
  .ln-handout .note { font-style: italic; }
  .ln-handout .lines { margin-top: 1.5rem; }
  .ln-handout .lines div { border-bottom: 1px solid #bbb; height: 1.6rem; }
  @media print { body { margin: 0; } .ln-handout { max-width: none; padding: 0; } }
`;

/**
 * The card as HTML. `strings` carries translated captions: `{ source, translation, gradeNote, from, notesLabel }`.
 * `document: true` wraps it in a full page with the print stylesheet (for `window.open` + `document.write`).
 */
export function handoutHtml(model, strings = {}, { document: full = false, lang = 'en', writingLines = 0 } = {}) {
  const bi = model.he.length && model.en.length;
  const body = `<article class="ln-handout ${bi ? 'bi' : ''}" style="--scale:${model.scale}" lang="${lang}">
  <header>
    <h1 lang="en">${esc(model.ref)}</h1>
    <h1 lang="he">${esc(model.heRef)}</h1>
  </header>
  <div class="text">
    ${model.he.length ? `<div class="he" lang="he">${model.he.map((l, i) => `<p><span class="n">${i + 1}</span>${esc(l)}</p>`).join('')}</div>` : ''}
    ${model.en.length ? `<div class="en" lang="en">${model.en.map((l, i) => `<p><span class="n">${i + 1}</span>${esc(l)}</p>`).join('')}</div>` : ''}
  </div>
  ${writingLines ? `<div class="lines">${strings.notesLabel ? `<p>${esc(strings.notesLabel)}</p>` : ''}${'<div></div>'.repeat(writingLines)}</div>` : ''}
  <footer>
    ${model.he.length && model.heVersionTitle ? `<div>${esc(strings.source || 'Source')}: ${esc(model.heVersionTitle)}</div>` : ''}
    ${model.en.length && model.versionTitle ? `<div>${esc(strings.translation || 'Translation')}: ${esc(model.versionTitle)}</div>` : ''}
    ${strings.gradeNote ? `<div class="note">${esc(strings.gradeNote)}</div>` : ''}
    <div>${esc(strings.from || 'From')} ${esc(model.url)}</div>
  </footer>
</article>`;
  if (!full) { return body; }
  return `<!doctype html><html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(model.ref)}</title><style>${HANDOUT_CSS}</style></head><body>${body}</body></html>`;
}

/** The card as Markdown (a blockquote per language, attribution lines at the end). */
export function handoutMarkdown(model, strings = {}) {
  const out = [`## ${model.ref} · ${model.heRef}`, ''];
  if (model.he.length) { out.push(...model.he.map((l, i) => `> ${i + 1}. ${l}`), ''); }
  if (model.en.length) { out.push(...model.en.map((l, i) => `> ${i + 1}. ${l}`), ''); }
  if (model.he.length && model.heVersionTitle) { out.push(`${strings.source || 'Source'}: ${model.heVersionTitle}  `); }
  if (model.en.length && model.versionTitle) { out.push(`${strings.translation || 'Translation'}: ${model.versionTitle}  `); }
  if (strings.gradeNote) { out.push(`_${strings.gradeNote}_  `); }
  out.push(`${strings.from || 'From'} ${model.url}`);
  return out.join('\n').trim() + '\n';
}

/** Open a minimal print page. Returns the window or null when pop-ups are blocked. */
export function openPrintView(html) {
  if (typeof window === 'undefined' || typeof window.open !== 'function') { return null; }
  const w = window.open('', '_blank', 'noopener=no,width=820,height=1000');
  if (!w) { return null; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return w;
}
