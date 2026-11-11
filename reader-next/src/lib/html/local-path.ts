/**
 * Is this a path on this site, safe to use as a link or a redirect target as written? Browsers (and the WHATWG URL parser) read more
 * than `//host` as another site: `/\host` and `\\host` (a backslash is a slash in http(s) URLs), and `/\t/host` (tab and newline are
 * dropped anywhere in an address; leading spaces and control characters are stripped). A router that decodes its path also follows
 * `/%2F%2Fhost` and `/%5Chost`, and a dot segment can collapse into one (`/..//host`). Only an absolute path with none of these, as
 * written and as resolved, passes.
 */

// C0 controls, space, DEL and C1 controls: what the URL parser strips at the edges or drops inside
const CONTROL_OR_SPACE_EDGE = /^[\u0000- \u007f-\u009f]|[\u0000- \u007f-\u009f]$/; // eslint-disable-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/; // eslint-disable-line no-control-regex
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const BASE = "https://local.invalid";

export function isLocalPath(p: unknown): p is string {
  if (typeof p !== "string" || !p || p.length > 8192) return false;
  if (CONTROL.test(p) || CONTROL_OR_SPACE_EDGE.test(p)) return false;
  if (p[0] !== "/" || p.includes("\\")) return false;
  if (LONE_SURROGATE.test(p)) return false;
  // as written, and as the URL parser resolves it ("/..//evil.org" and "/.%2e//evil.org" are the path "//evil.org"): never a second
  // slash (or an encoded slash or backslash) right after the first, nor an encoded backslash anywhere in the path
  const offSite = (path: string) => /^\/(?:\/|%2f|%5c)/i.test(path) || /%5c/i.test(path);
  if (offSite(p.split(/[?#]/, 1)[0]!)) return false;
  let resolved: URL;
  try {
    resolved = new URL(p, BASE);
  } catch {
    return false;
  }
  return resolved.origin === BASE && !offSite(resolved.pathname);
}
