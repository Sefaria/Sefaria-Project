import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * No way out to the legacy client (T-F01, owner rule 2026-11-05): scripts/exits-crawl.mjs crawls the new reader's pages, desktop and
 * phone, signed out and signed in, and fails on any same-site link Django answers that is not in scripts/exits-allowlist.json.
 *
 * It reads the live site (through its own read-only proxy) and takes several minutes, so it runs only when asked: EXITS_CRAWL=1.
 * EXITS_REPORT_ONLY=1 (CI until wave 2 has ported what the list names) records the list as an annotation instead of failing.
 */
test.describe("ways out to the legacy client", () => {
  test.skip(!process.env.EXITS_CRAWL, "needs EXITS_CRAWL=1: starts its own stand-in Django in front of www.sefaria.org (read only) and a dev server on EXITS_PORT (3366), ~45 min; EXITS_REPORT_ONLY=1 to list instead of fail");
  test.setTimeout(30 * 60_000);

  test("every same-site link Django answers is an accepted exit", async () => {
    const out = join(tmpdir(), `exits-${process.pid}.json`);
    const run = spawnSync("node", ["scripts/exits-crawl.mjs", "--report-only", "--out", out], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env: process.env });
    expect(run.status, run.stdout).toBe(0);
    const report = JSON.parse(readFileSync(out, "utf8")) as { links: number; unlisted: { link: string; exit: string }[] };
    expect(report.links).toBeGreaterThan(100); // the crawl really ran
    const list = report.unlisted.map((u) => `${u.link} (${u.exit})`).join("\n");
    if (process.env.EXITS_REPORT_ONLY) test.info().annotations.push({ type: "exits", description: `${report.unlisted.length} not allowlisted:\n${list}` });
    else expect(report.unlisted, `not in scripts/exits-allowlist.json:\n${list}`).toEqual([]);
  });
});
