/**
 * Split a bulk-upload CSV into one single-index CSV Blob per book.
 *
 * The bulk-upload endpoint (`/api/text-upload`) accepts two CSV layouts
 * (see `_import_versions_from_csv` in `sefaria/export.py`):
 *
 *   "single" - 5 header rows in column 1
 *      [Index Title, Version Title, Language, Version Source, Version Notes]
 *      followed by data rows of `[ref, text]`.
 *
 *   "multi"  - 4 header rows in column 1
 *      [Version Title, Language, Version Source, Version Notes]
 *      followed by data rows of `[ref, text]` that may span many books.
 *
 * Historically the backend fanned the multi-format file out into per-book
 * jobs in a single long-running request. We now do that fan-out in the
 * browser using `Sefaria.parseRef` and rebuild each group as a proper
 * single-index CSV so every POST hits the fast single-index path.
 */
import Papa from 'papaparse';
import Sefaria from '../../sefaria/sefaria';

const MULTI_HEADER_ROWS = 4;
const SINGLE_HEADER_ROWS = 5;
const REF_COL = 0;
const VALUE_COL = 1;

const isMultiFormat = (rows) =>
  rows.length > 0 &&
  rows[0].length > 0 &&
  String(rows[0][REF_COL] || '').trim().toLowerCase() === 'version title';

const buildSingleIndexCsv = (idxTitle, vt, lang, src, notes, dataRows) => {
  const allRows = [
    ['Index Title', idxTitle],
    ['Version Title', vt],
    ['Language', lang],
    ['Version Source', src],
    ['Version Notes', notes],
    ...dataRows,
  ];
  const csv = Papa.unparse(allRows);
  return new Blob([csv], { type: 'text/csv' });
};

const sanitizeForFilename = (s) =>
  String(s || 'upload').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);

/**
 * Parse a CSV string and produce an array of upload jobs, one per index.
 *
 * @param {string} text - Raw CSV file contents.
 * @param {string} [sourceName] - Original filename, used for non-multi jobs.
 * @returns {{
 *   jobs: Array<{ idxTitle: string, csvBlob: Blob, filename: string, rowCount: number }>,
 *   unresolvedRefs: Array<{ ref: string, reason: string }>,
 *   error: string | null,
 * }}
 */
const splitCsvByIndex = (text, sourceName = 'upload.csv') => {
  const result = { jobs: [], unresolvedRefs: [], error: null };

  const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
  const rows = parsed.data || [];

  if (rows.length === 0) {
    result.error = 'CSV is empty';
    return result;
  }

  if (!isMultiFormat(rows)) {
    if (rows.length < SINGLE_HEADER_ROWS) {
      result.error = 'Single-index CSV is missing header rows';
      return result;
    }
    const idxTitle = String(rows[0][VALUE_COL] || '').trim() || 'upload';
    const dataRowCount = Math.max(0, rows.length - SINGLE_HEADER_ROWS);
    result.jobs.push({
      idxTitle,
      csvBlob: new Blob([text], { type: 'text/csv' }),
      filename: sourceName,
      rowCount: dataRowCount,
    });
    return result;
  }

  if (rows.length < MULTI_HEADER_ROWS) {
    result.error = 'Multi-format CSV is missing header rows';
    return result;
  }

  const vt = String(rows[0][VALUE_COL] || '');
  const lang = String(rows[1][VALUE_COL] || '');
  const src = String(rows[2][VALUE_COL] || '');
  const notes = String(rows[3][VALUE_COL] || '');

  const groups = new Map(); // idxTitle -> dataRows[]
  for (let i = MULTI_HEADER_ROWS; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length <= VALUE_COL) continue;
    const ref = String(row[REF_COL] || '').trim();
    if (!ref) continue;

    let parsed;
    try {
      parsed = Sefaria.parseRef(ref);
    } catch (e) {
      result.unresolvedRefs.push({ ref, reason: e?.message || 'parse error' });
      continue;
    }
    if (!parsed || parsed.error || !parsed.index) {
      result.unresolvedRefs.push({
        ref,
        reason: parsed?.error || 'unknown book',
      });
      continue;
    }

    const idxTitle = parsed.index;
    if (!groups.has(idxTitle)) groups.set(idxTitle, []);
    groups.get(idxTitle).push([ref, row[VALUE_COL]]);
  }

  for (const [idxTitle, dataRows] of groups) {
    result.jobs.push({
      idxTitle,
      csvBlob: buildSingleIndexCsv(idxTitle, vt, lang, src, notes, dataRows),
      filename: `${sanitizeForFilename(idxTitle)}.csv`,
      rowCount: dataRows.length,
    });
  }

  return result;
};

export default splitCsvByIndex;
