/**
 * One vocabulary for "what kind of page is this", shared by error reports, server logs and web vitals (TARGET_ARCHITECTURE §6.5:
 * scripts and analytics name pages the same way). Pure: works from a pathname on the server and in the browser.
 *
 * The analytics dimension5 page type is a different, older vocabulary (the legacy ReaderApp's `menuOpen || mode`): see
 * src/lib/analytics/page-dimensions.ts, which maps onto it.
 */
import { isReaderPath } from "~/lib/reader/paths";

export type RouteKind =
  | "reader"
  | "texts"
  | "topics"
  | "search"
  | "calendars"
  | "translations"
  | "compare"
  | "user"
  | "auth"
  | "activity"
  | "interface"
  | "api"
  | "health"
  | "static"
  | "other";

const KINDS: [RegExp, RouteKind][] = [
  [/^\/healthz/, "health"],
  [/^\/api\//, "api"],
  [/^\/(?:static|fonts|icons|brand|assets|_build|favicon)/, "static"],
  [/^\/texts\/notes(?:\/|$)/, "user"],
  [/^\/(?:$|texts(?:\/|$))/, "texts"],
  [/^\/topics(?:\/|$)/, "topics"],
  [/^\/search(?:\/|$)/, "search"],
  [/^\/(?:calendars|parashat-hashavua|todays-daf-yomi)(?:\/|$)/, "calendars"],
  [/^\/translations(?:\/|$)/, "translations"],
  [/^\/compare(?:\/|$)/, "compare"],
  [/^\/(?:saved|history|notes|settings|profile|my\/)/, "user"],
  [/^\/(?:login|register|logout|password)(?:\/|$)/, "auth"],
  [/^\/activity(?:\/|$)/, "activity"],
  [/^\/interface\//, "interface"],
];

/** The kind of page a path is. Every path the app does not name is a ref, so a reader page. */
export function routeKind(pathname: string): RouteKind {
  for (const [re, kind] of KINDS) if (re.test(pathname)) return kind;
  return isReaderPath(pathname) ? "reader" : "other";
}
