/**
 * Dictionary lookups through the data layer (`Sefaria.getLexiconWords` → `/api/words/<word>
 * ?always_consonants=1&never_split=1&lookup_ref=<ref>`, the same call the classic LexiconBox
 * makes), shaped into plain `{ headword, lexicon, morphology, transliteration, senses[] }`
 * entries. Candidate for a shared `tools/lexiconApi.js` once the research tools land theirs.
 */
import Sefaria from '../../../sefaria/sefaria';
import { plainText, stripHebrewMarks } from '../../reader/textData';

const strip = html => plainText(String(html || '')).replace(/\s+/g, ' ').trim();

/** Flatten nested `senses` into plain definition strings, in order. */
export function flattenSenses(content) {
  const out = [];
  const walk = (sense) => {
    if (!sense) { return; }
    const def = strip(sense.definition);
    if (def && def !== ',' && !/^[,;\s]*v\.\s/.test(def)) { out.push(def.replace(/^[,;.\s]+/, '')); }
    (sense.senses || []).forEach(walk);
  };
  ((content && content.senses) || []).forEach(walk);
  return Array.from(new Set(out.filter(Boolean)));
}

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

/** Dictionary entries for one Hebrew word (cantillation removed, vowels kept). */
export function lookupWord(word, ref) {
  const clean = stripHebrewMarks(String(word || ''), { cantillation: false }).replace(/[^א-תְ-ׇ]/g, '');
  if (!clean) { return Promise.resolve([]); }
  return Promise.resolve(Sefaria.getLexiconWords(clean, ref || null)).then(shapeEntries).catch(() => []);
}

/** Distinct Hebrew words of a segment's HTML (display form keeps vowels), by consonantal form. */
export function hebrewWords(html) {
  const text = plainText(html);
  const seen = new Set();
  const out = [];
  for (const raw of text.split(/[\s־־]+/)) {
    const word = raw.replace(/^[^א-ת]+|[^א-תְ-ׇ]+$/g, '');
    const key = word.replace(/[֑-ׇ]/g, '');
    if (key.length < 2 || seen.has(key)) { continue; }
    seen.add(key);
    out.push(word);
  }
  return out;
}
