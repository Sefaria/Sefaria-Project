#!/usr/bin/env node
// Records real search-wrapper responses (POST) for the sidebar "Search in this text", trimmed to a few hits.
// Output: fixtures/api/search/*.json and fixtures/api/search-requests.json (key: "<query>|<filters>|<start>").
// Usage: node scripts/record-search-fixtures.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.SEFARIA_API ?? "https://www.sefaria.org";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "api");
const body = (query, filters, start) => ({ aggs: [], field: "naive_lemmatizer", filter_fields: ["path"], filters, query, size: 100, slop: 10, sort_fields: ["comp_date", "order"], sort_method: "sort", sort_reverse: false, source_proj: true, type: "text", ...(start ? { start } : {}) });
const CASES = [
  { file: "search/genesis-light.json", query: "light", filters: ["Tanakh/Torah/Genesis"], keep: 40 },
  { file: "search/genesis-hebrew-or.json", query: "אור", filters: ["Tanakh/Torah/Genesis"], keep: 12 },
  { file: "search/genesis-none.json", query: "zzzxqkw", filters: ["Tanakh/Torah/Genesis"], keep: 0 },
];
await mkdir(join(OUT, "search"), { recursive: true });
const index = {};
for (const c of CASES) {
  const r = await fetch(`${API}/api/search-wrapper/es8`, { method: "POST", headers: { "content-type": "application/json", "user-agent": "sefaria-reader-dev-fixtures" }, body: JSON.stringify(body(c.query, c.filters)) });
  const d = await r.json();
  d.hits.hits = d.hits.hits.slice(0, c.keep); // total stays the real total
  await writeFile(join(OUT, c.file), JSON.stringify(d, null, 1));
  index[`${c.query}|${c.filters.join(",")}|0`] = c.file;
  console.log(c.file, d.hits.total, d.hits.hits.length);
}
await writeFile(join(OUT, "search-requests.json"), JSON.stringify(index, null, 1));
