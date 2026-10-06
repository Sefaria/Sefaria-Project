import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../fixtures/api");
let index: Record<string, string> | null = null;

function loadIndex(): Record<string, string> {
  if (index) return index;
  const file = path.join(ROOT, "requests.json");
  index = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>) : {};
  return index;
}

/** Normalise query ordering/encoding so lookups don't depend on parameter order. */
export function normaliseRequestKey(pathAndQuery: string): string {
  const url = new URL(pathAndQuery, "https://x");
  const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => (a + av).localeCompare(b + bv));
  const qs = new URLSearchParams(params).toString();
  return decodeURIComponent(url.pathname).replace(/_/g, " ") + (qs ? `?${qs}` : "");
}

let normalised: Map<string, string> | null = null;

export function lookupFixture(pathAndQuery: string): unknown {
  if (!normalised) {
    normalised = new Map(Object.entries(loadIndex()).map(([k, v]) => [normaliseRequestKey(k), v]));
  }
  const file = normalised.get(normaliseRequestKey(pathAndQuery));
  if (!file) return undefined;
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

export function readFixture<T = unknown>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

/** A recorded search-wrapper response (scripts/record-search-fixtures.mjs), by query, path filters and offset. */
export function lookupSearchFixture(query: string, filters: string[], start: number): unknown {
  const file = path.join(ROOT, "search-requests.json");
  if (!existsSync(file)) return undefined;
  const name = (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>)[`${query}|${filters.join(",")}|${start}`];
  return name ? JSON.parse(readFileSync(path.join(ROOT, name), "utf8")) : undefined;
}
