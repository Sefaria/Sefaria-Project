/**
 * The Hebrew Tanakh search merge, ported from the old client (static/js/sefaria/search.js: dictaQuery, dictaBooksQuery,
 * mergeQueries). OWNER DECISION 2026-10-06: merge as sefaria.org does.
 *
 * For a Hebrew query with "All Results" (not Exact Phrase), sefaria.org also searches Dicta's Tanakh index
 * (https://sefaria.loadbalancer.dicta.org.il, CORS open to any origin):
 *  - POST /search {query, from, size, limitedToBooks, sort: pagerank | corpus_order_path, smallUnitsOnly: true} → verses;
 *  - POST /books {query, smallUnitsOnly: true} → hits per Tanakh book (3 s timeout).
 * Sefaria's own Tanakh hits are dropped and Dicta's take their place; the filter tree's Tanakh counts are Dicta's; the total is the
 * sum (10,000+ and 182 make "10,182+"). If the books request fails the page falls back to Sefaria's results alone, as the old one did.
 *
 * Relevance order: Sefaria scores are negated (-_score) and Dicta's are -pagerank, rescaled to Sefaria's mean and spread. The old
 * mean divides BOTH sums by the number of Sefaria hits; that quirk is kept on purpose so the order is the same as on sefaria.org.
 * Chronological order puts Dicta's verses first, in their order (comp_date -10000 + i).
 *
 * @feature SRC-082 Dicta Hebrew Tanakh search merge
 */
import { isHebrewText } from "./hebrew";
import type { SearchHit } from "./text-search";

export const DICTA_ORIGIN = "https://sefaria.loadbalancer.dicta.org.il";
export const DICTA_VERSION = "Tanach with Ta'amei Hamikra";

/** A hit with the two sort keys the merge uses. */
export type ScoredHit = SearchHit & { score: number; comp_date: number; cameFrom: "Sefaria" | "dicta" };

export const isDictaQuery = (q: string, exact: boolean) => isHebrewText(q) && !exact;

/** "תנ"ך/נביאים/ספר זכריה/פרק א/פסוק א" → "זכריה א׳:א׳" in Sefaria's Hebrew ref style (single letters get a geresh-quote, longer ones a gershayim). */
export function reformatDictaRef(path: string): string {
  const m = path.match(/תנ"ך\/.*\/ספר (.*)\/פרק (.*)\/פסוק (.*)/);
  if (!m) return path;
  const num = (s: string) => (s.length === 1 ? `${s}'` : s.split("").join('"'));
  return `${m[1]} ${num(m[2]!)}:${num(m[3]!)}`;
}

export interface DictaApiHit { xmlId: string; hebrewPath: string; pagerank?: number; highlight: { text: string }[] }

export function dictaSearchBody(q: string, opts: { from: number; size: number; filters: readonly string[]; sort: "relevance" | "chronological" }) {
  return {
    query: q,
    from: opts.from,
    size: opts.size,
    limitedToBooks: opts.filters.length ? opts.filters.map((f) => f.replace(/\//g, ".").replace(/ /g, "_")) : false,
    sort: opts.sort === "relevance" ? "pagerank" : "corpus_order_path",
    smallUnitsOnly: true,
  };
}

/** Dicta verses as search hits (the old adapter, including its _id). `offset` keeps comp_date increasing across pages. */
export function adaptDictaHits(hits: readonly DictaApiHit[], offset = 0): ScoredHit[] {
  return hits.map((h, i) => {
    const parts = h.xmlId.split(".");
    const book = parts[2]!.replace(/_/g, " ");
    const loc = parts.slice(3, 5).join(":");
    return {
      _id: `${book} ${loc} (${DICTA_VERSION} [he])`,
      _source: {
        ref: `${book} ${loc}`,
        heRef: reformatDictaRef(h.hebrewPath),
        version: DICTA_VERSION,
        lang: "he",
        languageFamilyName: "hebrew",
        isPrimary: true,
        categories: parts.slice(0, 2),
        path: parts.slice(0, 2).join("/"),
      },
      highlight: { naive_lemmatizer: [h.highlight[0]?.text ?? ""] },
      score: h.pagerank ? -h.pagerank : 0,
      comp_date: -10000 + offset + i,
      cameFrom: "dicta",
    };
  });
}

export async function fetchDictaSearch(body: object, signal?: AbortSignal): Promise<{ total: number; hits: DictaApiHit[] }> {
  const r = await fetch(`${DICTA_ORIGIN}/search`, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error(`Dicta search: HTTP ${r.status}`);
  return (await r.json()) as { total: number; hits: DictaApiHit[] };
}

/** Per-book counts as path buckets ("Tanakh/Torah/Genesis": 12). Times out after 3 s, like the old request. */
export async function fetchDictaBooks(q: string, signal?: AbortSignal): Promise<{ key: string; doc_count: number }[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  signal?.addEventListener("abort", () => ctl.abort());
  try {
    const r = await fetch(`${DICTA_ORIGIN}/books`, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify({ query: q, smallUnitsOnly: true }), signal: ctl.signal });
    if (!r.ok) throw new Error(`Dicta books: HTTP ${r.status}`);
    const d = (await r.json()) as { englishBookName: string[]; count: number }[];
    return d.map((b) => ({ key: b.englishBookName.map((s) => s.replace(/_/g, " ")).join("/"), doc_count: b.count }));
  } finally {
    clearTimeout(t);
  }
}

/** Sefaria's buckets without Tanakh, plus Dicta's book counts. */
export const mergeBuckets = (sefaria: readonly { key: string; doc_count: number }[], dicta: readonly { key: string; doc_count: number }[]) => [
  ...sefaria.filter((b) => !/^Tanakh\//.test(b.key)),
  ...dicta,
];

/** Sefaria's hits with the sort keys the merge uses. */
export const scoreSefariaHits = (hits: readonly (SearchHit & { _score?: number; _source: SearchHit["_source"] & { comp_date?: number } })[]): ScoredHit[] =>
  hits.map((h) => ({ ...h, score: -(h._score ?? 0), comp_date: h._source.comp_date ?? 0, cameFrom: "Sefaria" }));

/**
 * One list from both sources (the old mergeQueries): Sefaria's Tanakh hits removed, Dicta's rescaled for relevance, then sorted
 * ascending on `score` (relevance) or `comp_date` (chronological).
 */
export function mergeHits(sefaria: readonly ScoredHit[], dicta: readonly ScoredHit[], sort: "relevance" | "chronological"): ScoredHit[] {
  const key = sort === "relevance" ? "score" : "comp_date";
  const s = sefaria.filter((h) => !(h._source.categories ?? []).includes("Tanakh"));
  let d = dicta.map((h) => ({ ...h }));
  if (d.length && s.length && key === "score") {
    const n = s.length; // the old code divides both means by the Sefaria count (kept: same order as sefaria.org)
    const sMean = s.reduce((t, h) => t + h.score / n, 0);
    let dMean = d.reduce((t, h) => t + h.score / n, 0);
    const sStd = Math.sqrt(s.reduce((t, h) => t + (h.score - sMean) ** 2, 0));
    const dStd = Math.sqrt(d.reduce((t, h) => t + (h.score - dMean) ** 2, 0));
    const factor = dStd !== 0 ? sStd / dStd : 1;
    d = d.map((h) => ({ ...h, score: h.score * factor }));
    dMean = d.reduce((t, h) => t + h.score / n, 0);
    const delta = sMean - dMean;
    d = d.map((h) => ({ ...h, score: h.score + delta }));
  }
  return [...d, ...s].sort((a, b) => a[key] - b[key]);
}

/** Total of the hits under the applied filters, from the merged buckets (the old client's figure when filters are on). */
export const filteredTotal = (buckets: readonly { key: string; doc_count: number }[], filters: readonly string[]) => {
  const re = new RegExp(`^(${filters.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(/.*|$)`);
  return buckets.reduce((t, b) => (re.test(b.key) ? t + b.doc_count : t), 0);
};
