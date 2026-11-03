/**
 * Dictionary lookups shared by the reader tools (learner Vocabulary, scholar Lexicon), over the
 * existing `Sefaria.getLexiconWords(word, ref)` (`/api/words/<word>?always_consonants=1&never_split=1
 * &lookup_ref=<ref>`, the same call the classic LexiconBox makes), plus the pure helpers that turn a
 * segment's Hebrew into words and flatten API entries for display.
 *
 *   wordsOf(html)        → [{ display, lookup, key }]   every word, maqaf halves split, in text order
 *   hebrewWords(html)    → [display]                    distinct by consonants, 2+ letters (vocabulary chips)
 *   lookupEntries(w, r)  → normalized entries with nested senses `{ text, number, depth }`, refs, source
 *   lookupWord(w, r)     → flat entries with sense strings (and the lexicon's language)
 *
 * `Sefaria.getLexiconWords` resolves through a native Promise (`_cachedApiPromise`), but every
 * call is wrapped in `Promise.resolve()` anyway so a jQuery deferred could never reach `.catch`.
 */
import Sefaria from '../../sefaria/sefaria';
import { plainText, CANTILLATION_RE, NIKKUD_RE } from '../reader/textData';

const HEBREW_WORD_RE = /[א-תְ-ׇֽֿׁׂׅׄ׳״"']+/g;   // letters, vowels, geresh/gershayim; no maqaf, paseq or sof pasuq

const strip = html => plainText(String(html || '')).replace(/\s+/g, ' ').trim();

/** The dictionary form of a word: cantillation and punctuation removed, vowels kept (the API adds a consonantal lookup). */
export function cleanWord(word) {
  const m = String(word || '').replace(CANTILLATION_RE, '').match(HEBREW_WORD_RE);
  return m ? m.join('').replace(/["'׳״]+$/g, '') : '';
}

/** Consonants only, for matching equal words across segments. */
export function consonants(word) {
  return cleanWord(word).replace(NIKKUD_RE, '').replace(/["'׳״]/g, '');
}

/**
 * Tappable words of a Hebrew HTML segment: `[{ display, lookup, key }]`. A maqaf joins two
 * words in print but each half is its own dictionary entry, so it splits them.
 */
export function wordsOf(html) {
  return plainText(html || '')
    .replace(CANTILLATION_RE, '')
    .split(/[\s־]+/)
    .map(raw => ({ display: raw, lookup: cleanWord(raw) }))
    .filter(w => w.lookup)
    .map(w => ({ ...w, key: consonants(w.lookup) }));
}

/** Distinct Hebrew words of a segment (display form keeps vowels), one per consonantal form, 2+ letters. */
export function hebrewWords(html) {
  const seen = new Set();
  const out = [];
  for (const w of wordsOf(html)) {
    if (w.key.length < 2 || seen.has(w.key)) { continue; }
    seen.add(w.key);
    out.push(w.lookup);
  }
  return out;
}

function senseTree(senses, depth = 0, out = []) {
  (senses || []).forEach(sense => {
    if (sense.definition) { out.push({ text: sense.definition, number: sense.number || '', depth }); }
    if (sense.senses) { senseTree(sense.senses, depth + 1, out); }
  });
  return out;
}

/** Flatten an entry's nested `content.senses` into plain definition strings, in order (cross-references dropped). */
export function flattenSenses(content) {
  const out = [];
  for (const sense of senseTree(content && content.senses)) {
    const def = strip(sense.text);
    if (def && def !== ',' && !/^[,;\s]*v\.\s/.test(def)) { out.push(def.replace(/^[,;.\s]+/, '')); }
  }
  return Array.from(new Set(out.filter(Boolean)));
}

/** Entries as the Lexicon panel shows them: `{ id, headword, lexicon, morphology, senses: [{ text, number, depth }], refs, transliteration, pronunciation, strong, source }`. */
export function normalizeEntries(raw) {
  if (!Array.isArray(raw)) { return []; }
  return raw.map((e, i) => ({
    id: `${e.parent_lexicon || 'lexicon'}:${e.headword || i}:${e.rid || i}`,
    headword: e.headword || '',
    lexicon: e.parent_lexicon || '',
    morphology: (e.content && e.content.morphology) || '',
    senses: senseTree(e.content && e.content.senses),
    refs: Array.from(new Set(e.refs || [])).slice(0, 8),
    transliteration: e.transliteration || '',
    pronunciation: e.pronunciation || '',
    strong: e.strong_number || '',
    source: (e.parent_lexicon_details && e.parent_lexicon_details.source) || '',
  })).filter(e => e.headword || e.senses.length);
}

/** Entries as the Vocabulary panel shows them: `{ headword, lexicon, language, morphology, transliteration, senses: [string] }`. */
export function shapeEntries(raw) {
  return (Array.isArray(raw) ? raw : []).map(e => ({
    headword: e.headword || '',
    lexicon: e.parent_lexicon || '',
    language: (e.parent_lexicon_details && e.parent_lexicon_details.language) || e.language_code || '',
    morphology: (e.content && e.content.morphology) || '',
    transliteration: e.transliteration || '',
    senses: flattenSenses(e.content),
  })).filter(e => e.headword && e.senses.length);
}

function fetchEntries(word, ref) {
  const clean = cleanWord(word);
  if (!clean) { return Promise.resolve([]); }
  return Promise.resolve(Sefaria.getLexiconWords(clean, ref || null)).catch(() => []);
}

/** Look a word up, optionally in the context of `ref`: normalized (nested) entries, `[]` when none or on error. */
export function lookupEntries(word, ref) {
  return fetchEntries(word, ref).then(normalizeEntries).catch(() => []);
}

/** Look a word up: flat entries with sense strings, `[]` when none or on error. */
export function lookupWord(word, ref) {
  return fetchEntries(word, ref).then(shapeEntries).catch(() => []);
}
