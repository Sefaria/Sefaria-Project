/**
 * What a session client publishes (docs/READER_STATE_API.md, "What the leader must not leak"): only the moment slices and the URL — and
 * not every URL. Text typed into search, sign-in and password pages stay home, so the stream writer reads the API through this view:
 *
 *  - On a private page (search results, sign-in, register, password reset — whose URL may hold a reset token) the view shows the last
 *    public state instead, so nothing at all goes out while the person is there, and followers stay on the last text.
 *  - The search words a "go" carries in its history state (`nav.terms`, to highlight the match) are dropped everywhere.
 *
 * Only getSnapshot and subscribe are filtered (the writer's whole use of the API); everything else is the API itself.
 */
import { diff, isEmptyChange } from "~/lib/reader-state/core/diff";
import type { ReaderSnapshot, ReaderStateApi } from "~/lib/reader-state/core/types";

/** Pages of this client whose address or state is the person's own business. */
const PRIVATE_PATH = /^\/(?:search|login|logout|register|password)(?:[/?#]|$)/i;

/** Is this URL a page whose address must not leave the person's tab? */
export function isPrivateUrl(url: string): boolean {
  let path = url;
  try {
    path = decodeURIComponent(url);
  } catch {
    /* judge it as written */
  }
  return PRIVATE_PATH.test(url) || PRIVATE_PATH.test(path);
}

/** History state without the search words. */
function publicNav(nav: unknown): unknown {
  if (!nav || typeof nav !== "object" || Array.isArray(nav) || !("terms" in nav)) return nav;
  const { terms: _terms, ...rest } = nav as Record<string, unknown>;
  return rest;
}

/** Shown in place of a private page when nothing public was seen yet (the session started on one). */
const NEUTRAL: ReaderSnapshot = { v: 1, url: "/", nav: undefined, slices: {} };

export function publicView(api: ReaderStateApi): ReaderStateApi {
  let lastPublic: ReaderSnapshot | null = null;

  const toPublic = (s: ReaderSnapshot): ReaderSnapshot => {
    if (isPrivateUrl(s.url)) return lastPublic ?? NEUTRAL;
    const out: ReaderSnapshot = { ...s, nav: publicNav(s.nav) };
    lastPublic = out;
    return out;
  };

  return {
    getSnapshot: (filter) => toPublic(api.getSnapshot(filter)),
    applySnapshot: (snapshot, ctx) => api.applySnapshot(snapshot, ctx),
    subscribe(onChange, filter) {
      let last = toPublic(api.getSnapshot(filter));
      return api.subscribe((_change, snapshot) => {
        const now = toPublic(snapshot);
        const change = diff(last, now);
        last = now;
        if (!isEmptyChange(change)) onChange(change, now);
      }, filter);
    },
    onLocalInput: (cb) => api.onLocalInput(cb),
    get applying() {
      return api.applying;
    },
  };
}
