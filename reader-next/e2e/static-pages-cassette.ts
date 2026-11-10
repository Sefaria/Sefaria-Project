import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * The static pages' content answers (`/<page>?format=json&lang=en|he`, reader/static_content.py) for the e2e suite. www.sefaria.org
 * does not serve the content mode yet (it answers the page's HTML), so the cassette cannot record them: the specs write Django's
 * answers — rendered by Django from this branch's templates (e2e/fixtures/static-pages/<page>.<lang>.json, with the production
 * domains) — into the cassette in its own recording format (scripts/api-cassette.mjs: sha1 of "GET <url>\n", gzip of the entry's JSON
 * line and the body). The proxy reads its recordings from disk on every request, so they answer in auto and replay mode alike.
 * (`E2E_API_MODE=record` asks the live site instead: there these pages fall back to Django's own page, a 404 locally.)
 */
const FIXTURES = new URL("./fixtures/static-pages/", import.meta.url).pathname;
const CASSETTE = process.env.E2E_CASSETTE_DIR || new URL("./.cassette/", import.meta.url).pathname;

export const staticContentUrl = (page: string, lang: "en" | "he") => `/${page}?format=json&lang=${lang}`;

/** Write one answer into the cassette as Django's (a JSON body with the status given). */
export function recordStaticAnswer(url: string, body: string, status = 200, dir = CASSETTE) {
  mkdirSync(dir, { recursive: true });
  const key = createHash("sha1").update(`GET ${url}\n`).digest("hex");
  const entry = { method: "GET", url, status, headers: { "content-type": "application/json" } };
  writeFileSync(join(dir, `${key}.gz`), gzipSync(Buffer.concat([Buffer.from(JSON.stringify(entry) + "\n"), Buffer.from(body)])));
}

/** Every fixture of e2e/fixtures/static-pages (or of `from`) into the cassette. */
export function seedStaticPages(from = FIXTURES, dir = CASSETTE): string[] {
  const seeded: string[] = [];
  for (const file of readdirSync(from)) {
    const m = /^(.+)\.(en|he)\.json$/.exec(file);
    if (!m) continue;
    const body = readFileSync(join(from, file), "utf8");
    const url = staticContentUrl(m[1]!, m[2] as "en" | "he");
    recordStaticAnswer(url, body, JSON.parse(body).standalone ? 404 : 200, dir);
    seeded.push(url);
  }
  return seeded;
}
