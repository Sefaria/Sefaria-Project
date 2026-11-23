/**
 * The reserved `ctx` query parameter: an opaque context a surface loaded into the reader puts on a reader address ("this reader is
 * showing room X"), so that a refresh, a shared link or Back reopens the reader in that context. The value is a surface namespace,
 * a dot and an opaque rest (`social.room.abc123`); the reader checks only that shape.
 *
 * The reader keeps it through its own address rewrites (validateReaderSearch, the workspace codec, canonicalize, a scroll's or a
 * panel's replace) and otherwise ignores it. It is not part of what the page is: it is left out of `rel=canonical` and og:url, out of
 * the reader state API's snapshot `url`, and out of the share links the reader writes.
 *
 * @feature RTE-066 Reserved ctx parameter
 */

export const CTX_PARAM = "ctx";

/** A surface namespace (lowercase letters and digits, starting with a letter), a dot, then 1–160 of `A-Za-z0-9_.-`. */
export const CTX_RE = /^[a-z][a-z0-9]*\.[A-Za-z0-9_.-]{1,160}$/;

/** The value when it is a well-formed context, else undefined. */
export function parseCtx(v: unknown): string | undefined {
  return typeof v === "string" && CTX_RE.test(v) ? v : undefined;
}

/** Split an address into what comes before its query, the query's parts (without "?"), and its fragment (with "#"). */
function splitHref(href: string): { base: string; parts: string[]; hash: string } {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const q = noHash.indexOf("?");
  if (q < 0) return { base: noHash, parts: [], hash };
  return { base: noHash.slice(0, q), parts: noHash.slice(q + 1).split("&").filter(Boolean), hash };
}

const isCtxPart = (part: string) => {
  const key = part.split("=", 1)[0]!;
  return key === CTX_PARAM || key === encodeURIComponent(CTX_PARAM);
};

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};

/** The well-formed context an address (or a bare query string, "?a=b") carries, else null. */
export function ctxOf(href: string): string | null {
  const { parts } = splitHref(href.startsWith("?") ? href : href.includes("?") ? href : `?${href}`);
  for (const p of parts) if (isCtxPart(p)) return parseCtx(decode(p.slice(p.indexOf("=") + 1))) ?? null;
  return null;
}

/** The address without any `ctx` parameter; every other byte (other parameters' encoding, their order, the fragment) is kept. */
export function withoutCtx(href: string): string {
  const { base, parts, hash } = splitHref(href);
  if (!parts.some(isCtxPart)) return href;
  const kept = parts.filter((p) => !isCtxPart(p));
  return `${base}${kept.length ? `?${kept.join("&")}` : ""}${hash}`;
}

/** The address with `ctx=<value>` last (replacing any it had); a malformed value leaves the address without one. */
export function withCtx(href: string, ctx: string | null | undefined): string {
  const bare = withoutCtx(href);
  const value = parseCtx(ctx);
  if (!value) return bare;
  const { base, parts, hash } = splitHref(bare);
  return `${base}?${[...parts, `${CTX_PARAM}=${value}`].join("&")}${hash}`;
}
