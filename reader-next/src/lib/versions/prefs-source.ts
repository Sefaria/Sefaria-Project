/**
 * Version preferences from wherever the cookies are: the request on the server, `document.cookie` in the
 * browser (no round trip). Writing is browser-only.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { parseCookieHeader } from "~/lib/reader/settings";
import { CORPUS_COOKIE, formatCorpusCookie, parseVersionPrefs, withVersionPreference, type VersionPrefs } from "./preferences";

const readOnServer = createServerFn({ method: "GET" }).handler(async (): Promise<VersionPrefs> => parseVersionPrefs(parseCookieHeader(getRequestHeader("cookie") ?? "")));

export async function readVersionPrefs(): Promise<VersionPrefs> {
  if (typeof document !== "undefined") return parseVersionPrefs(parseCookieHeader(document.cookie));
  return readOnServer();
}

/**
 * Remember a chosen translation for the text's corpus. The old site wrote a session cookie; this one lasts a
 * year (a preference that vanishes when the browser closes is not a preference).
 */
export function rememberTranslation(corpus: string | undefined, versionTitle: string): void {
  if (!corpus || typeof document === "undefined") return;
  const next = withVersionPreference(parseVersionPrefs(parseCookieHeader(document.cookie)), corpus, versionTitle);
  document.cookie = `${CORPUS_COOKIE}=${formatCorpusCookie(next)}; path=/; max-age=31536000; samesite=lax`;
}
