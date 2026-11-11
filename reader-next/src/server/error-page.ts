/**
 * The page a reader gets when the library behind this server is not answering: status 503 with Retry-After (the truth for
 * crawlers, and the signal a proxy can fall back on) and a real page instead of a line of plain text.
 *
 * It is a fixed document, not a render of the app: the app's render needs the API that just failed (the signed-in reader, the
 * remote config, the catalog). It carries the site's logo linking home, the message in the interface language (the `interfaceLang`
 * cookie, as the app reads it), a "Try again" link to the same address and the old site's contact line (templates/500.html), with
 * the site's colours in light and dark. noindex: never a page to keep.
 *
 * @feature RTE-040 404 and error pages
 */
import { PUBLIC_CONFIG } from "~/lib/config";
import { isVoicesHost } from "~/lib/routing/django-paths";

const TEXT = {
  english: {
    title: "The library is not answering right now",
    body: "Please try again in a moment. If the problem continues, please email",
    us: "us",
    retry: "Try again",
    home: "Sefaria home",
  },
  hebrew: {
    title: "הספרייה אינה זמינה כרגע",
    body: "אנא נסו שוב בעוד רגע. אם התקלה נמשכת,",
    us: "נשמח לשמוע",
    retry: "נסו שוב",
    home: "דף הבית של ספריא",
  },
} as const;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The interface language from a Cookie header (only the cookie: this page never asks anything upstream). */
export function errorPageLang(cookieHeader: string | null | undefined): "english" | "hebrew" {
  return /(?:^|;\s*)interfaceLang=hebrew(?:;|$)/.test(cookieHeader ?? "") ? "hebrew" : "english";
}

export function unavailableHtml(lang: "english" | "hebrew", retryHref = ""): string {
  const t = TEXT[lang];
  const he = lang === "hebrew";
  return `<!DOCTYPE html>
<html lang="${he ? "he" : "en"}" dir="${he ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(t.title)} | ${he ? "ספריא" : "Sefaria"}</title>
<style>
:root { color-scheme: light dark; --bg: #ffffff; --text: #121212; --muted: #707070; --line: #e6e5e6; --link: #18345d; }
@media (prefers-color-scheme: dark) { :root { --bg: #161616; --text: #ededec; --muted: #a3a3a0; --line: #333333; --link: #9fb7da; } }
body { margin: 0; background: var(--bg); color: var(--text); font-family: ${he ? '"Heebo", ' : ""}"Roboto", "Helvetica Neue", Helvetica, sans-serif; }
header { height: 60px; display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--line); }
header a { color: var(--link); font-size: 22px; text-decoration: none; font-family: ${he ? '"Taamey Frank", ' : ""}Georgia, "Times New Roman", serif; }
main { max-width: 760px; margin: 0 auto; padding: 60px 16px; }
h1 { margin: 0 0 20px; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 30px; }
p { margin: 0 0 24px; font-size: 18px; line-height: 1.5; color: var(--muted); }
a.button { display: inline-block; padding: 10px 20px; border-radius: 6px; background: var(--link); color: var(--bg); text-decoration: none; }
p a { color: var(--link); }
</style>
</head>
<body>
<header><a href="/texts" aria-label="${escapeHtml(t.home)}">${he ? "ספריא" : "Sefaria"}</a></header>
<main data-reader-unavailable="">
<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.body)} <a href="mailto:hello@sefaria.org">${escapeHtml(t.us)}</a>.</p>
<a class="button" href="${escapeHtml(retryHref)}">${escapeHtml(t.retry)}</a>
</main>
</body>
</html>`;
}

/** The plain-text answer this server gave before T-F28: kept on the Voices host (Voices is out of scope: nothing new there). */
const plainUnavailable = () =>
  new Response("The library is not answering right now. Please try again in a moment.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "5", "cache-control": "no-store" },
  });

/** The same address, as a link: leading slashes (and backslashes) collapsed to one, so "//evil.com" can never leave the site. */
export const retryHref = (u: URL): string => `/${u.pathname.replace(/^[/\\]+/, "")}${u.search}`;

/** What a page answers when what it needs upstream is down or too slow: 503 (try again), never a 500 (a bug) or a hang. */
export function unavailableResponse(request?: Request, voicesOrigin: string | undefined = PUBLIC_CONFIG.voicesOrigin): Response {
  let retry = "";
  if (request) {
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || new URL(request.url).host;
    if (isVoicesHost(host, voicesOrigin)) return plainUnavailable();
    try {
      retry = retryHref(new URL(request.url));
    } catch {
      /* the page itself, by an empty href */
    }
  }
  const body = request?.method === "HEAD" ? null : unavailableHtml(errorPageLang(request?.headers.get("cookie")), retry);
  return new Response(body, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "retry-after": "5", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
