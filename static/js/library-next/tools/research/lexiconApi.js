/**
 * Dictionary lookups for the scholar Lexicon tool, over the existing `Sefaria.getLexiconWords`
 * (`/api/words/<word>?always_consonants=1&never_split=1&lookup_ref=<ref>`). Also the pure
 * helpers that turn a segment's Hebrew into tappable words and flatten API entries for display.
 *
 * NOTE for the orchestrator: the learner tools (`tools/learn/lexiconApi.js`) wrap the same API for
 * their vocabulary tool; the two modules were written in parallel and should be merged into one.
 */
import Sefaria from '../../../sefaria/sefaria';
import { plainText, CANTILLATION_RE, NIKKUD_RE } from '../../reader/textData';

const HEBREW_WORD_RE = /[\u05D0-\u05EA\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05F3\u05F4"']+/g;   // letters, vowels, geresh/gershayim; no maqaf, paseq or sof pasuq

/** The dictionary form of a tapped word: cantillation and punctuation removed, vowels kept (the API adds a consonantal lookup). */
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

function flattenSenses(senses, depth = 0, out = []) {
  (senses || []).forEach(sense => {
    if (sense.definition) { out.push({ text: sense.definition, number: sense.number || '', depth }); }
    if (sense.senses) { flattenSenses(sense.senses, depth + 1, out); }
  });
  return out;
}

/** Entries as the panel shows them: `{ headword, lexicon, morphology, senses: [{ text, number, depth }], refs, transliteration, pronunciation, strong, source }`. */
export function normalizeEntries(raw) {
  if (!Array.isArray(raw)) { return []; }
  return raw.map((e, i) => ({
    id: `${e.parent_lexicon || 'lexicon'}:${e.headword || i}:${e.rid || i}`,
    headword: e.headword || '',
    lexicon: e.parent_lexicon || '',
    morphology: (e.content && e.content.morphology) || '',
    senses: flattenSenses(e.content && e.content.senses),
    refs: Array.from(new Set(e.refs || [])).slice(0, 8),
    transliteration: e.transliteration || '',
    pronunciation: e.pronunciation || '',
    strong: e.strong_number || '',
    source: (e.parent_lexicon_details && e.parent_lexicon_details.source) || '',
  })).filter(e => e.headword || e.senses.length);
}

/** Look a word up, optionally in the context of `ref`. Resolves to normalized entries ([] when none). */
export function lookupWord(word, ref) {
  const clean = cleanWord(word);
  if (!clean) { return Promise.resolve([]); }
  return Promise.resolve(Sefaria.getLexiconWords(clean, ref || undefined)).then(normalizeEntries).catch(() => []);
}
