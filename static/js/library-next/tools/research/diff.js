/**
 * Word-level diff for the Versions compare tool: tokens of two texts aligned with a plain LCS,
 * so insertions and deletions can be highlighted. Hebrew marks (vowels, cantillation) are
 * ignored for matching by default while the displayed tokens keep them. Pure; jest-covered.
 */
import { plainText, NIKKUD_RE, CANTILLATION_RE } from '../../reader/textData';

const PUNCT_RE = /[־׀׃.,;:!?()[\]"'«»“”‘’…\-–—]/g;   // maqaf, paseq, sof pasuq and Latin punctuation

/** Split (HTML or plain) text into displayable word tokens; a maqaf joins words, so it splits them here. */
export function tokenize(text) {
  return plainText(text || '').replace(/־/g, '־ ').split(/\s+/).map(s => s.trim()).filter(Boolean);
}

/** The comparison key of a token: no marks, no punctuation, lower-cased. */
export function normalizeToken(token, { ignoreMarks = true } = {}) {
  let s = token;
  if (ignoreMarks) { s = s.replace(NIKKUD_RE, '').replace(CANTILLATION_RE, ''); }
  return s.replace(PUNCT_RE, '').toLowerCase();
}

const MAX_TOKENS = 600;   // beyond this an LCS table gets heavy; longer texts are compared in a window

/**
 * `[{ type: 'same' | 'del' | 'ins', text }]` from text `a` to text `b`: `del` tokens exist only in
 * `a`, `ins` tokens only in `b`. Tokens whose keys are empty (pure punctuation) count as equal.
 */
export function diffTokens(a, b, { ignoreMarks = true } = {}) {
  const ta = tokenize(a).slice(0, MAX_TOKENS);
  const tb = tokenize(b).slice(0, MAX_TOKENS);
  const ka = ta.map(t => normalizeToken(t, { ignoreMarks }));
  const kb = tb.map(t => normalizeToken(t, { ignoreMarks }));
  const n = ka.length, m = kb.length;
  // LCS lengths, (n+1) x (m+1), filled from the end so the walk is forward.
  const L = new Array((n + 1) * (m + 1)).fill(0);
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[at(i, j)] = ka[i] === kb[j] ? L[at(i + 1, j + 1)] + 1 : Math.max(L[at(i + 1, j)], L[at(i, j + 1)]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) { ops.push({ type: 'same', text: ta[i], other: tb[j] }); i++; j++; }
    else if (L[at(i + 1, j)] >= L[at(i, j + 1)]) { ops.push({ type: 'del', text: ta[i] }); i++; }
    else { ops.push({ type: 'ins', text: tb[j] }); j++; }
  }
  while (i < n) { ops.push({ type: 'del', text: ta[i++] }); }
  while (j < m) { ops.push({ type: 'ins', text: tb[j++] }); }
  return ops;
}

/** `{ same, insertions, deletions, changed }` — `changed` is the share of tokens that differ (0–1). */
export function diffSummary(ops) {
  const out = { same: 0, insertions: 0, deletions: 0, changed: 0 };
  ops.forEach(op => { if (op.type === 'same') { out.same++; } else if (op.type === 'ins') { out.insertions++; } else { out.deletions++; } });
  const total = out.same + out.insertions + out.deletions;
  out.changed = total ? (out.insertions + out.deletions) / total : 0;
  return out;
}

/** The two sides for rendering: side A shows same + del tokens, side B same + ins tokens. */
export function splitSides(ops) {
  return {
    a: ops.filter(op => op.type !== 'ins').map(op => ({ text: op.text, changed: op.type === 'del' })),
    b: ops.filter(op => op.type !== 'del').map(op => ({ text: op.type === 'same' ? op.other : op.text, changed: op.type === 'ins' })),
  };
}
