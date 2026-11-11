import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// Django's contract (2026-11-10): /api/activity answers 401 to a reader who is not signed in. The revision-history page then sends
// them to log in and back, as Django's login_required page did. The 401 is written into the API cassette (scripts/api-cassette.mjs).
const DIR = new URL("./.cassette/", import.meta.url).pathname;
function cassette(url: string, status: number, body: unknown) {
  mkdirSync(DIR, { recursive: true });
  const key = createHash("sha1").update(`GET ${url}\n`).digest("hex");
  const head = JSON.stringify({ method: "GET", url, status, headers: { "content-type": "application/json" } });
  writeFileSync(`${DIR}${key}.gz`, gzipSync(Buffer.concat([Buffer.from(head + "\n"), Buffer.from(JSON.stringify(body))])));
}

test.beforeAll(() => {
  cassette("/api/activity/Exodus.1.1/en/Signed_Out_Version?page=1", 401, { error: "You must be logged in." });
});

// @feature LEG-019
test("signed out, a text's revision history sends the reader to log in and back", async ({ page }) => {
  const res = await page.request.get("/activity/Exodus.1.1/en/Signed_Out_Version", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toBe(`/login?next=${encodeURIComponent("/activity/Exodus.1.1/en/Signed_Out_Version")}`);
});
