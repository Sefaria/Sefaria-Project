/**
 * Lesson sharing without a server: the lesson is serialised to compact JSON, LZW-compressed and
 * base64url-encoded into the URL hash of `/my/lessons/shared#<data>`. Decoding needs nothing but
 * the page, so a shared link works offline and on any Library Next host.
 *
 *   const url = lessonShareUrl(lesson);           // https://…/my/lessons/shared#1XQAAAA…
 *   const lesson = shareToLesson(decodeShare(location.hash.slice(1)));
 */
const VERSION = '1';
const MAX_CODE = 65536;

const toBinary = (str) => unescape(encodeURIComponent(str));     // UTF-8 bytes as a binary string
const fromBinary = (bin) => decodeURIComponent(escape(bin));

function b64url(bin) {
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return atob(padded);
}

/** LZW over bytes with variable code width (9–16 bits), packed MSB first. */
export function lzwCompress(bin) {
  const dict = new Map();
  let size = 256, width = 9, w = '';
  const bytes = [];
  let acc = 0, bits = 0;
  const emit = (code) => {
    acc = (acc * (1 << width)) + code;
    bits += width;
    while (bits >= 8) { bytes.push(Math.floor(acc / 2 ** (bits - 8)) & 255); bits -= 8; acc %= 2 ** bits; }
  };
  for (const ch of bin) {
    if (ch.charCodeAt(0) > 255) { throw new TypeError('lzwCompress takes a binary string (use encodeShare for text)'); }
    const wc = w + ch;
    if (wc.length === 1 || dict.has(wc)) { w = wc; continue; }
    emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
    if (size < MAX_CODE) { dict.set(wc, size++); if (size > (1 << width) && width < 16) { width++; } }
    w = ch;
  }
  if (w) { emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w)); }
  if (bits > 0) { bytes.push((acc * 2 ** (8 - bits)) & 255); }
  return String.fromCharCode(...bytes);
}

export function lzwDecompress(packed) {
  const dict = new Map();
  let size = 256, width = 9, pos = 0, acc = 0, bits = 0;
  const read = () => {
    while (bits < width) {
      if (pos >= packed.length) { return -1; }
      acc = acc * 256 + packed.charCodeAt(pos++);
      bits += 8;
    }
    const code = Math.floor(acc / 2 ** (bits - width));
    bits -= width;
    acc %= 2 ** bits;
    return code;
  };
  let code = read();
  if (code < 0) { return ''; }
  let w = String.fromCharCode(code);
  const out = [w];
  for (;;) {
    if (size + 1 > (1 << width) && width < 16) { width++; }
    code = read();
    if (code < 0) { break; }
    let entry;
    if (code < 256) { entry = String.fromCharCode(code); } else if (dict.has(code)) { entry = dict.get(code); } else if (code === size) { entry = w + w[0]; } else { throw new Error('Bad LZW code'); }
    out.push(entry);
    if (size < MAX_CODE) { dict.set(size++, w + entry[0]); }
    w = entry;
  }
  return out.join('');
}

/** Any JSON-able value → a URL-safe string (prefixed with a format version). */
export function encodeShare(value) {
  return VERSION + b64url(lzwCompress(toBinary(JSON.stringify(value))));
}

/** The value back, or null when the string is not ours or is damaged. */
export function decodeShare(str) {
  if (typeof str !== 'string' || str[0] !== VERSION || str.length < 2) { return null; }
  try {
    return JSON.parse(fromBinary(lzwDecompress(unb64url(str.slice(1)))));
  } catch (e) {
    return null;
  }
}

/** The compact wire form of a lesson (short keys; ids dropped). */
export function lessonToShare(lesson) {
  return {
    v: 1,
    t: lesson.title || '',
    s: (lesson.sources || []).map(s => ({ r: s.ref, t: s.title || '', h: s.heTitle || '', he: s.he || '', en: s.en || '', n: s.note || '' })),
    q: (lesson.questions || []).map(q => ({ en: q.en || '', he: q.he || '' })),
    n: lesson.handoutNotes || '',
  };
}

/** A lesson-shaped object (for `createLesson` or the shared view) from the wire form; null when it is not a lesson. */
export function shareToLesson(data) {
  if (!data || data.v !== 1 || typeof data.t !== 'string') { return null; }
  return {
    title: data.t,
    sources: (Array.isArray(data.s) ? data.s : []).filter(s => s && typeof s.r === 'string').map((s, i) => ({ id: `s${i}`, ref: s.r, title: s.t || s.r, heTitle: s.h || '', he: s.he || '', en: s.en || '', note: s.n || '' })),
    questions: (Array.isArray(data.q) ? data.q : []).filter(q => q && (q.en || q.he)).map((q, i) => ({ id: `q${i}`, en: q.en || q.he, he: q.he || q.en })),
    handoutNotes: typeof data.n === 'string' ? data.n : '',
  };
}

export function lessonShareUrl(lesson, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}/my/lessons/shared#${encodeShare(lessonToShare(lesson))}`;
}
