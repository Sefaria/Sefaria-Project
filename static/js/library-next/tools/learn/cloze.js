/**
 * Deterministic cloze cards from a passage: the N longest content words (ties by position),
 * each blanked out in its own copy of the text. No randomness, so the same selection always
 * yields the same cards.
 */
const STOP = new Set(('the and that with from this which there their they them then than when were was are for not but his her him you your our ' +
  'all any has have had been will would shall should into unto upon over under about after before because these those what where who whom whose ' +
  'said says say also very more most such only even each every other some same both while through again against among between').split(' '));
const HE_STOP = new Set(['אשר', 'אותו', 'אותה', 'אותם', 'הזה', 'הזאת', 'האלה', 'אלא', 'אבל', 'כאשר', 'ואת']);

export const BLANK = '＿＿＿';

/** `[{ word, index }]` for every word, with `index` into the original text. */
export function tokenize(text) {
  const re = /[A-Za-zא-ת][A-Za-zא-ת֑-ׇ'’]*/g;
  const out = []; let m;
  while ((m = re.exec(text))) { out.push({ word: m[0], index: m.index }); }
  return out;
}

const bare = w => w.replace(/[֑-ׇ'’]/g, '').toLowerCase();

export function clozeCards(text, { count = 3 } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const tokens = tokenize(clean).filter(t => { const b = bare(t.word); return b.length >= 4 && !STOP.has(b) && !HE_STOP.has(b); });
  const seen = new Set();
  const distinct = tokens.filter(t => { const b = bare(t.word); if (seen.has(b)) { return false; } seen.add(b); return true; });
  const picked = distinct
    .slice()
    .sort((a, b) => bare(b.word).length - bare(a.word).length || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index);
  return picked.map(t => ({
    front: clean.slice(0, t.index) + BLANK + clean.slice(t.index + t.word.length),
    back: t.word,
  }));
}
