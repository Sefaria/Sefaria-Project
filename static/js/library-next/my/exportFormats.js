/**
 * Text exports for the hub: notes + highlights as Markdown, the notebook as BibTeX / CSV / JSON,
 * and a `download()` helper that saves a string as a file.
 */
import { bookOf } from './collections';

const byBook = (rows) => {
  const groups = new Map();
  rows.forEach(row => {
    const book = row.book || bookOf(row.ref);
    if (!groups.has(book)) { groups.set(book, []); }
    groups.get(book).push(row);
  });
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
};

const refUrl = (ref) => `https://www.sefaria.org/${String(ref).replace(/ /g, '_').replace(/:/g, '.')}`;
const isoDay = (ts) => new Date(ts || 0).toISOString().slice(0, 10);

/** Notes and highlights grouped by book, one heading per book. */
export function notesToMarkdown({ notes = [], highlights = [] } = {}, { title = 'My notes' } = {}) {
  const lines = [`# ${title}`, ''];
  byBook([...notes.map(n => ({ ...n, _kind: 'note' })), ...highlights.map(h => ({ ...h, _kind: 'highlight' }))]).forEach(([book, rows]) => {
    lines.push(`## ${book}`, '');
    rows.sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach(row => {
      if (row._kind === 'note') {
        lines.push(`### [${row.ref}](${refUrl(row.ref)})`, '', row.text.trim(), '', `_${isoDay(row.ts)}_`, '');
      } else {
        lines.push(`- **Highlight** ([${row.ref}](${refUrl(row.ref)}), ${row.color})${row.text ? `: ${row.text.trim()}` : ''}`);
      }
    });
    lines.push('');
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const bibKey = (entry, i) => `${bookOf(entry.ref).replace(/[^A-Za-z0-9]/g, '')}${isoDay(entry.ts).slice(0, 4)}_${i + 1}`;
const bibEscape = (s) => String(s || '').replace(/([{}])/g, '\\$1');

export function notebookToBibTeX(entries = []) {
  return entries.map((e, i) => [
    `@misc{${bibKey(e, i)},`,
    `  title = {${bibEscape(e.ref)}},`,
    `  howpublished = {\\url{${refUrl(e.ref)}}},`,
    `  publisher = {Sefaria},`,
    e.versions && e.versions.length ? `  note = {Versions compared: ${bibEscape(e.versions.join('; '))}},` : null,
    `  year = {${isoDay(e.ts).slice(0, 4)}},`,
    `  urldate = {${isoDay(e.ts)}}`,
    '}',
  ].filter(Boolean).join('\n')).join('\n\n') + (entries.length ? '\n' : '');
}

export function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function notebookToCSV(entries = []) {
  const header = ['ref', 'title', 'heTitle', 'note', 'versions', 'citation', 'date'];
  const rows = entries.map(e => [e.ref, e.title, e.heTitle, e.text, (e.versions || []).join(' | '), e.citation, isoDay(e.ts)].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n') + '\n';
}

export function notebookToJSON(entries = []) {
  return JSON.stringify({ format: 'sefaria.libnext.notebook', exportedAt: new Date().toISOString(), entries }, null, 2);
}

/** Save `text` as `filename` in the browser. No-op outside a browser or where object URLs are unavailable. */
export function download(filename, text, mime = 'text/plain') {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') { return false; }
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
