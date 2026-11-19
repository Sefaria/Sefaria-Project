// The URL line's pieces: literal path text and `{placeholder}` chips.

/** Splits `/api/v3/texts/{tref}` into literal text and placeholders. */
export function pathParts(path: string): { text: string; param: string | null }[] {
  const parts: { text: string; param: string | null }[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0;
  for (let m = re.exec(path); m !== null; m = re.exec(path)) {
    if (m.index > last) parts.push({ text: path.slice(last, m.index), param: null });
    parts.push({ text: m[0], param: m[1] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < path.length) parts.push({ text: path.slice(last), param: null });
  return parts;
}
