#!/usr/bin/env node
// The replay check (docs/READER_STATE_API.md, "Keeping it complete"): drive a scripted reading session, take the reader state API's
// snapshot and a screenshot at each keyframe, then start a second page somewhere else, apply each snapshot in turn and compare its
// screenshot with the one taken while reading. A keyframe whose pixels differ beyond the threshold fails the check and is named: some
// state on screen is neither in the URL nor in a slice (the drift the check exists to catch).
//
//   node scripts/replay-check.mjs [--base http://localhost:3100] [--threshold 0.002] [--out test-results/replay-check]
//
// Needs a running dev server (npm run dev, or the e2e one) with its API reachable; writes the screenshots of a failing keyframe
// (recorded, replayed, diff) to --out. Exit 0: every keyframe matched; 1: a keyframe differed; 2: the session could not be run.
//
// What this first version covers, and what it does not yet (TODO, in this order):
//   [x] open a text, scroll, choose a verse (the sidebar opens), open a second panel from the sidebar, close the sidebar
//   [x] replay each keyframe on a page that started elsewhere, with applySnapshot (origin "playback"), and compare
//   [ ] change display settings (font size, layout) between keyframes: personal slices, applied only by playback, never by follow
//   [ ] open a menu (the reader's display menu) and check the "Not captured" list in docs/READER_STATE_API.md stays true
//   [ ] record through the recording lab's own recorder (src/features/reader-state/recording) instead of getSnapshot per keyframe,
//       and seek the player to each keyframe, so the stream format is covered too
//   [ ] the follow check: two pages joined by BroadcastChannelTransport, the follower's screenshots compared at the same moments,
//       breaking away and "Follow again", one history entry for the whole session (an e2e spec rather than this script)
//   [ ] run in CI against the e2e cassette (a job, or a Playwright project), once it is stable on CI's fonts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("--base", process.env.REPLAY_BASE_URL || "http://localhost:3100");
const THRESHOLD = Number(arg("--threshold", "0.002"));
const OUT = arg("--out", "test-results/replay-check");
const VIEWPORT = { width: 1280, height: 900 };

/**
 * Share of pixels that differ (any channel by more than 8 of 255) between two same-size PNGs, 1 when the sizes differ, and a diff image
 * (differing pixels red). Computed in a blank browser page with a canvas, so the check needs no image library.
 */
export async function diffRatio(browser, a, b) {
  const page = await browser.newPage();
  try {
    const { ratio, diff } = await page.evaluate(
      async ([a64, b64]) => {
        const load = async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const [ia, ib] = await Promise.all([load(a64), load(b64)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1, diff: null };
        const pixels = (img) => {
          const c = new OffscreenCanvas(img.width, img.height);
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, img.width, img.height);
        };
        const pa = pixels(ia), pb = pixels(ib);
        const out = new ImageData(ia.width, ia.height);
        let n = 0;
        for (let i = 0; i < pa.data.length; i += 4) {
          const d = Math.max(Math.abs(pa.data[i] - pb.data[i]), Math.abs(pa.data[i + 1] - pb.data[i + 1]), Math.abs(pa.data[i + 2] - pb.data[i + 2]));
          const hit = d > 8;
          if (hit) n++;
          out.data.set(hit ? [255, 0, 0, 255] : [pa.data[i] / 3, pa.data[i + 1] / 3, pa.data[i + 2] / 3, 255], i);
        }
        const c = new OffscreenCanvas(ia.width, ia.height);
        c.getContext("2d").putImageData(out, 0, 0);
        const blob = await c.convertToBlob({ type: "image/png" });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (const x of bytes) bin += String.fromCharCode(x);
        return { ratio: n / (ia.width * ia.height), diff: btoa(bin) };
      },
      [a.toString("base64"), b.toString("base64")],
    );
    return { ratio, diff: diff ? Buffer.from(diff, "base64") : null };
  } finally {
    await page.close();
  }
}

async function ready(page) {
  await page.waitForSelector("html[data-hydrated='true']");
  // the reader has settled: no apply running, the route idle, two frames for layout
  await page.waitForFunction(() => window.sefariaReaderState && !window.sefariaReaderState.applying);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const keyframe = async (page, name) => {
  await ready(page);
  return { name, snapshot: await page.evaluate(() => window.sefariaReaderState.getSnapshot()), png: await page.screenshot() };
};

async function wheel(page, dy, steps) {
  const box = await page.locator("[data-reader-scroller]").first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(400, box.height / 2));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(120);
  }
}

/** The scripted session: each step leaves the reader somewhere worth replaying. */
async function record(page) {
  const frames = [];
  await page.context().addCookies([{ name: "cookiesNotificationAccepted", value: "1", url: BASE }]);
  await page.goto(`${BASE}/Genesis.1?lang=bi`);
  frames.push(await keyframe(page, "open Genesis 1"));
  await wheel(page, 300, 3);
  frames.push(await keyframe(page, "scrolled"));
  const ref = await page.locator('[data-focused="true"]').first().getAttribute("data-ref");
  const box = await page.locator(`[role="group"][data-ref="${ref}"]`).first().boundingBox();
  await page.mouse.click(box.x + 80, box.y + 10);
  await page.waitForURL(/with=all/);
  frames.push(await keyframe(page, `chose ${ref}`));
  const commentary = page.getByRole("complementary").getByRole("link", { name: /^Commentary/ }).first();
  if (await commentary.count()) {
    await commentary.click();
    frames.push(await keyframe(page, "sidebar: Commentary"));
  }
  await page.keyboard.press("Escape");
  frames.push(await keyframe(page, "sidebar closed"));
  return frames;
}

async function main() {
  const browser = await chromium.launch();
  const failures = [];
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const frames = await record(await ctx.newPage());
    const replayCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await replayCtx.newPage();
    await page.context().addCookies([{ name: "cookiesNotificationAccepted", value: "1", url: BASE }]);
    await page.goto(`${BASE}/Exodus.3?lang=en`); // somewhere else entirely
    await ready(page);
    for (const [i, f] of frames.entries()) {
      const result = await page.evaluate((s) => window.sefariaReaderState.applySnapshot(s, { origin: "playback", persist: false }), f.snapshot);
      await ready(page);
      const png = await page.screenshot();
      const { ratio, diff } = await diffRatio(browser, f.png, png);
      const ok = ratio <= THRESHOLD;
      console.log(`${ok ? "ok  " : "FAIL"} keyframe ${i} (${f.name}): ${(ratio * 100).toFixed(3)}% of pixels differ${result.warnings.length ? `, warnings ${result.warnings.map((w) => w.code).join(",")}` : ""}`);
      if (!ok) {
        failures.push(f.name);
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `${i}-recorded.png`), f.png);
        writeFileSync(join(OUT, `${i}-replayed.png`), png);
        if (diff) writeFileSync(join(OUT, `${i}-diff.png`), diff);
      }
    }
  } catch (e) {
    console.error(`replay-check: could not run the session against ${BASE}: ${e instanceof Error ? e.message : e}`);
    await browser.close();
    process.exit(2);
  }
  await browser.close();
  if (failures.length) {
    console.error(`replay-check: ${failures.length} keyframe(s) did not replay: ${failures.join("; ")} (screenshots in ${OUT})`);
    process.exit(1);
  }
  console.log("replay-check: every keyframe replayed");
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) await main();
