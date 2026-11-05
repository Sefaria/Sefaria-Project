/**
 * The library's terms dictionary (English name → Hebrew), which the old client got in `/data.js` as `Sefaria.terms` and used first
 * in `Sefaria._()` / `hebrewTerm` for every category and title written as an interface string — so a German page's Hebrew
 * interface lists "ספר שמות" for Exodus (its term), not the index's "שמות". Server only: `/data.js` is ~9 MB (the catalog, terms,
 * books…), fetched once and shared by every request for a while, like the catalog (toc.ts serverCatalogTree).
 */
import { SEFARIA_API_ORIGIN } from "~/lib/api/client";

export type Terms = Readonly<Record<string, { en?: string; he?: string }>>;

/** The `terms:` line of `/data.js` (one `name: <json>,` per line). Null when it is not there. */
export function parseDataJsTerms(text: string): Terms | null {
  const m = /^\s*terms:\s*(\{.*\}),?\s*$/m.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!) as Terms;
  } catch {
    return null;
  }
}

const TTL_MS = 60 * 60_000;
let shared: { at: number; terms: Promise<Terms | null> } | undefined;
/** The terms, or null when `/data.js` could not be read (the page then falls back to the catalog's Hebrew names). */
export function serverTerms(now = Date.now()): Promise<Terms | null> {
  if (!shared || now - shared.at > TTL_MS) {
    const terms = fetch(`${SEFARIA_API_ORIGIN}/data.js`)
      .then((r) => (r.ok ? r.text() : ""))
      .then(parseDataJsTerms)
      .catch(() => null);
    const entry = { at: now, terms };
    shared = entry;
    // a failure is not kept
    void terms.then((t) => {
      if (!t && shared === entry) shared = undefined;
    });
  }
  return shared.terms;
}
