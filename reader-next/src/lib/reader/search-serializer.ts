/**
 * Query strings as the old site wrote them. TanStack Router's default serializer JSON-encodes values (a "1"
 * becomes %221%22), which would break every old link; this one is plain `key=value`:
 *  - values are strings (numbers are written as-is); nothing is JSON-quoted;
 *  - `+` is a space, as the old server (Django) reads it — `with=Commentary+ConnectionsList` is
 *    "Commentary ConnectionsList"; spaces are written as `+` and a literal plus as %2B;
 *  - `|`, `,` and `:` stay readable (version params, ref ranges).
 *
 * @feature RTE-043 @feature RTE-044 @feature SHL-066
 */
export function parseSearch(searchStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const s = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  if (!s) return out;
  for (const part of s.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = safeDecode((i < 0 ? part : part.slice(0, i)).replace(/\+/g, " "));
    const v = i < 0 ? "" : safeDecode(part.slice(i + 1).replace(/\+/g, " "));
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

export function stringifySearch(search: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(search)) {
    if (v === undefined || v === null) continue;
    const value = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
    parts.push(`${encode(k)}=${encode(value)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

const encode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+").replace(/%7C/gi, "|").replace(/%2C/gi, ",").replace(/%3A/gi, ":");

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
