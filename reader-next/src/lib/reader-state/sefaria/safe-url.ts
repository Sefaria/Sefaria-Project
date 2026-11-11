/**
 * Which urls the reader state API may navigate to. A snapshot's url comes from outside — a recording file someone sent, a leader in a
 * follow room, an embedding page — so it is untrusted input that ends up in router.navigate({ href }). Only a same-site relative path
 * to a page of this client passes: no other origin (`//evil.com`, `/\evil.com`, which browsers read as protocol-relative), no scheme
 * (`javascript:`), nothing hidden behind percent-encoding or control characters, and no page Django serves (navigating the app there
 * would render this client's 404, and a full page load is not the API's to make).
 */
import { PUBLIC_CONFIG } from "~/lib/config";
import { browserHost, leavesClient } from "~/lib/routing/django-paths";

const BASE = "https://x.invalid";
// C0 controls, DEL and C1 controls: the URL parser strips some (tab, newline) silently, so "/\t/evil.com" would become "//evil.com"
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/; // eslint-disable-line no-control-regex -- looks for control characters on purpose

/** The path part of a url: before its query or fragment. */
const pathPart = (url: string) => url.split(/[?#]/, 1)[0]!;

/** A path that is unsafe as written: protocol-relative, a backslash, a scheme, or a control character. */
const unsafePath = (path: string) => !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("://") || CONTROL.test(path);

/** Will the host navigate to this url? (same-site, relative, a page of this client) */
export function acceptsUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url || url.length > 4096) return false;
  if (CONTROL.test(url)) return false;
  const path = pathPart(url);
  if (unsafePath(path)) return false;
  // the same checks on the decoded path: "/%2F%2Fevil.com" and "/%5Cevil.com" are what a router that decodes its path would follow
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (unsafePath(decoded)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url, BASE);
  } catch {
    return false;
  }
  if (parsed.origin !== BASE) return false;
  // the parser resolves dot segments ("/a/../api/x" is "/api/x"): judge the path that would be requested, and as written
  const host = browserHost();
  return !leavesClient(parsed.pathname, host, PUBLIC_CONFIG.voicesOrigin) && !leavesClient(path, host, PUBLIC_CONFIG.voicesOrigin);
}
