import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { open, wheel } from "./helpers";

/**
 * The replay check (docs/READER_STATE_PLAN.md, task J; docs/READER_STATE_API.md, "Recording and replay"): record a scripted reading
 * session through the real UI, download it, load the file back in a fresh page, seek to each step and compare what the reader shows
 * with what it showed while recording. Then leave the replay and check the person is back where they were before loading.
 *
 * The screenshots are compared with each other, not with stored baselines (toMatchSnapshot would test the page against an old picture
 * of itself; this tests the replay against the session). The diff runs in a blank browser page (createImageBitmap + canvas), so the
 * spec needs no image library.
 */

/** A recorded step: what the reader showed, and the recording's clock while it showed it. */
interface Step {
  name: string;
  shot: Buffer;
  path: string;
  focused: string[];
  /** Recording time (ms) once the step had settled, and when the next action began: the replay must show the step in between. */
  from: number;
  to: number;
}

/** Long enough for the scroll slice's 250 ms sampling to have flushed, and wide enough to hit with a click on the timeline. */
const MIN_STEP_MS = 900;
/** Anti-aliasing can differ between two renders of the same state; neighbouring steps differ by more than five times this (checked below). */
const MAX_DIFF_RATIO = 0.002;

const dock = (page: Page) => page.getByTestId("recording-dock");
const menuButton = (page: Page) => page.getByRole("button", { name: "Text display options" });
/** Close the display menu if it is still open (its session entries close it themselves; Escape on the bare reader would leave the text). */
async function closeMenu(page: Page) {
  if (await page.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** The reader without the floating dock (it shows recording controls in one shot and the timeline in the other). */
async function readerShot(page: Page): Promise<Buffer> {
  await page.mouse.move(2, 2); // no hover highlight on a verse
  return page.locator("main").screenshot({ animations: "disabled", caret: "hide", style: '[data-testid="recording-dock"] { visibility: hidden !important; }' });
}

const inFlight = new WeakMap<Page, Set<object>>();
/** Count the page's data requests (fetch/XHR to this machine: the app and the API cassette), so "settled" can wait for them. */
function trackRequests(page: Page) {
  const pending = new Set<object>();
  inFlight.set(page, pending);
  const local = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  page.on("request", (r) => {
    if ((r.resourceType() === "fetch" || r.resourceType() === "xhr") && local(r.url())) pending.add(r);
  });
  const done = (r: object) => pending.delete(r);
  page.on("requestfinished", done);
  page.on("requestfailed", done);
}

/**
 * Wait until the reader stops changing — no data request in flight, and two identical screenshots in a row — and return the last one.
 * Without the request check a sidebar whose counts are still loading can look still for two frames, and the recorded picture would
 * show a moment the recording itself does not describe (its data is fetched again on replay).
 */
async function settledShot(page: Page): Promise<Buffer> {
  const pending = inFlight.get(page);
  let prev: Buffer | null = null;
  for (let i = 0; i < 60; i++) {
    if (pending?.size) {
      await expect.poll(() => pending.size, { message: "data requests finish", timeout: 20_000 }).toBe(0);
      prev = null;
    }
    const next = await readerShot(page);
    if (prev && next.equals(prev) && !pending?.size) return next;
    prev = next;
  }
  throw new Error("the reader never settled");
}

const focusedRefs = (page: Page) => page.locator('[data-focused="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-ref") ?? ""));
const path = (page: Page) => new URL(page.url()).pathname;
const fontSize = (page: Page) => page.locator("[data-language]").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

/** Recording time now: the page's clock minus the moment "Record session" was clicked (the recorder starts in that click handler). */
const recClock = (page: Page) => page.evaluate(() => performance.now() - (window as unknown as { __recT0: number }).__recT0);

/**
 * Two PNGs compared pixel by pixel: the share that differs noticeably (1 when the sizes differ), and a picture of where (red). A pixel
 * that has its match at most one pixel away counts as the same: a restored scroll anchor can land a fraction of a pixel from where the
 * recording was, which moves every line of text by one device pixel without the reader showing anything different. A different state
 * (another place, size, sidebar or panel) still differs by whole lines and blocks.
 */
async function compareShots(browser: Browser, a: Buffer, b: Buffer): Promise<{ ratio: number; diff: Buffer | null }> {
  const page = await browser.newPage();
  try {
    const { ratio, diff } = await page.evaluate(
      async ([a64, b64]) => {
        const decode = async (s: string) => {
          const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const canvas = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bmp, 0, 0);
          return ctx.getImageData(0, 0, bmp.width, bmp.height);
        };
        const [x, y] = await Promise.all([decode(a64!), decode(b64!)]);
        if (x.width !== y.width || x.height !== y.height) return { ratio: 1, diff: null };
        const w = x.width;
        const h = x.height;
        const out = new ImageData(w, h);
        const close = (p: ImageData, i: number, q: ImageData, j: number) =>
          Math.abs(p.data[i]! - q.data[j]!) <= 48 && Math.abs(p.data[i + 1]! - q.data[j + 1]!) <= 48 && Math.abs(p.data[i + 2]! - q.data[j + 2]!) <= 48;
        /** Does pixel (px, py) of p appear in q at most one pixel away? */
        const near = (p: ImageData, q: ImageData, px: number, py: number) => {
          const i = (py * w + px) * 4;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const qx = px + dx;
              const qy = py + dy;
              if (qx >= 0 && qy >= 0 && qx < w && qy < h && close(p, i, q, (qy * w + qx) * 4)) return true;
            }
          }
          return false;
        };
        let differing = 0;
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const i = (py * w + px) * 4;
            const hit = !close(x, i, y, i) && (!near(x, y, px, py) || !near(y, x, px, py));
            if (hit) differing++;
            // the replay faded, differences in red
            out.data[i] = hit ? 255 : 255 - (255 - y.data[i]!) / 4;
            out.data[i + 1] = hit ? 0 : 255 - (255 - y.data[i + 1]!) / 4;
            out.data[i + 2] = hit ? 0 : 255 - (255 - y.data[i + 2]!) / 4;
            out.data[i + 3] = 255;
          }
        }
        const ratio = differing / (x.width * x.height);
        if (!differing) return { ratio, diff: null };
        const canvas = new OffscreenCanvas(x.width, x.height);
        canvas.getContext("2d")!.putImageData(out, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { ratio, diff: btoa(bin) };
      },
      [a.toString("base64"), b.toString("base64")],
    );
    return { ratio, diff: diff ? Buffer.from(diff, "base64") : null };
  } finally {
    await page.close();
  }
}

/**
 * Wait until the reader looks like `expected` (the replay's applies are asynchronous: navigation, then text, then scroll). On a timeout,
 * attach the expected, actual and diff pictures to the report.
 */
async function expectLooksLike(page: Page, browser: Browser, expected: Buffer, name: string) {
  let last: { shot: Buffer; ratio: number; diff: Buffer | null } | null = null;
  try {
    await expect
      .poll(
        async () => {
          const shot = await settledShot(page);
          const { ratio, diff } = await compareShots(browser, expected, shot);
          last = { shot, ratio, diff };
          return ratio;
        },
        { message: `the replay looks like the recording at "${name}"`, timeout: 15_000 },
      )
      .toBeLessThan(MAX_DIFF_RATIO);
  } catch (e) {
    const l = last as { shot: Buffer; diff: Buffer | null } | null;
    const pictures: [string, Buffer | null | undefined][] = [["recorded", expected], ["replayed", l?.shot], ["diff", l?.diff]];
    for (const [kind, body] of pictures) if (body) await test.info().attach(`${name}-${kind}.png`, { body, contentType: "image/png" });
    throw e;
  }
}

// @feature reader-state Recording and replay
test.describe("recording and replay", () => {
  test.use({ viewport: { width: 1440, height: 900 } }); // wide enough for a text and its sidebar, or two texts

  test("a recorded session replays as it looked, step by step, and leaving the replay restores the reader", async ({ page, browser, context }) => {
    test.setTimeout(150_000);
    trackRequests(page);
    await open(page, "/Genesis.1?lang=en");
    await expect(page.locator('[role="group"][data-ref="Genesis 1:1"]')).toBeVisible();

    // ── Record ────────────────────────────────────────────────────────────────────────────────────────────────
    await menuButton(page).click();
    const record = page.getByRole("button", { name: "Record session" });
    await record.evaluate((el) => el.addEventListener("click", () => ((window as unknown as { __recT0: number }).__recT0 = performance.now()), { capture: true, once: true }));
    await record.click();
    await expect(dock(page).getByRole("timer", { name: "Elapsed time" })).toBeVisible();
    await closeMenu(page);

    const steps: Step[] = [];
    let pending: Omit<Step, "to"> | null = null;
    /** Close the previous step (its window ends now) before the next action. */
    const beginAction = async () => {
      if (!pending) return;
      const now = await recClock(page);
      if (now - pending.from < MIN_STEP_MS) await page.waitForTimeout(MIN_STEP_MS - (now - pending.from));
      steps.push({ ...pending, to: await recClock(page) });
      pending = null;
    };
    const capture = async (name: string) => {
      const shot = await settledShot(page);
      pending = { name, shot, path: path(page), focused: await focusedRefs(page), from: await recClock(page) };
    };

    await capture("start");

    // A verse opens the connections sidebar
    await beginAction();
    await page.locator('[role="group"][data-ref="Genesis 1:1"]').click();
    await expect(page).toHaveURL(/\/Genesis\.1\.1\?.*with=all/);
    const resources = page.getByRole("complementary");
    await expect(resources.getByRole("heading", { name: "Related Texts" })).toBeVisible();
    // Its counts arrive in separate requests, some started after the first paint: wait for the last ones so the picture is complete
    await expect(resources.getByText(/^Translations\s*\(\d+\)/)).toBeVisible();
    await expect(resources.getByText(/^Sheets\s*\(\d+\)/)).toBeVisible();
    await expect(resources.getByText(/^Manuscripts\s*\(\d+\)/)).toBeVisible();
    await capture("sidebar");

    // Another chapter, from the sidebar's table of contents
    await beginAction();
    await page.getByRole("complementary").getByRole("link", { name: "Table of Contents" }).click();
    const toc = page.getByRole("complementary", { name: "Table of Contents" });
    await toc.getByRole("link", { name: "3", exact: true }).first().click();
    await expect(page).toHaveURL(/\/Genesis\.3\b/);
    await expect(page.locator('[role="group"][data-ref="Genesis 3:1"]')).toBeVisible();
    await capture("chapter");

    // Larger text
    await beginAction();
    const sizeBefore = await fontSize(page);
    await menuButton(page).click();
    await page.getByRole("button", { name: "Larger text" }).click();
    await expect.poll(() => fontSize(page)).toBeGreaterThan(sizeBefore);
    await closeMenu(page);
    await capture("font");

    // Scroll to a verse, as a reader does (the URL follows)
    await beginAction();
    const target = page.locator('section[data-panel-id="p1"] [role="group"][data-ref="Genesis 3:8"]');
    for (let i = 0; i < 12 && !(await target.evaluate((el) => el.getBoundingClientRect().top < 400)); i++) await wheel(page, 200);
    await expect.poll(() => path(page)).toMatch(/^\/Genesis\.3\.\d+$/);
    await capture("scroll");

    // A second text beside the first: the verse's Rashi, opened from the sidebar
    await beginAction();
    await target.click({ position: { x: 60, y: 10 } });
    await expect(page).toHaveURL(/\/Genesis\.3\.8\?/);
    const side = page.getByRole("complementary");
    await side.getByRole("link", { name: "Resources" }).click(); // the sidebar stayed on the table of contents
    await side.getByRole("link", { name: /^Commentary/ }).click();
    await side.getByRole("link", { name: /^Rashi/ }).first().click();
    const item = side.locator("li[data-ref]").first();
    await expect(item).toHaveAttribute("data-ref", /^Rashi on Genesis 3:8/, { timeout: 30_000 });
    await item.getByRole("link", { name: "Open" }).click();
    await expect(page.locator("section[data-panel-id]")).toHaveCount(2);
    await expect(page.locator('section[data-panel-id="p2"] [role="group"][data-ref^="Rashi on Genesis 3:8"]').first()).toBeVisible();
    await capture("second panel");
    await beginAction();

    await dock(page).getByRole("button", { name: "Stop" }).click();

    // Every step changed what the reader shows, so matching a step below cannot be matching its neighbour
    for (let i = 1; i < steps.length; i++) {
      const { ratio } = await compareShots(browser, steps[i - 1]!.shot, steps[i]!.shot);
      expect(ratio, `"${steps[i]!.name}" looks different from "${steps[i - 1]!.name}"`).toBeGreaterThan(MAX_DIFF_RATIO * 5);
    }

    // ── Download ──────────────────────────────────────────────────────────────────────────────────────────────
    const [download] = await Promise.all([page.waitForEvent("download"), dock(page).getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const file = await download.path();
    const rec = JSON.parse(await readFile(file, "utf8")) as { v: number; duration: number; messages: { type: string; t: number; snapshot?: { url: string } }[] };
    expect(rec.v).toBe(1);
    expect(rec.messages[0]?.type).toBe("keyframe");
    expect(rec.messages[0]?.snapshot?.url).toMatch(/^\/Genesis\.1\?/);
    expect(rec.duration).toBeGreaterThanOrEqual(steps.at(-1)!.to);

    await dock(page).getByRole("button", { name: "Discard" }).click();
    await expect(dock(page)).toHaveCount(0);

    // ── Somewhere else, at the default size: where the replay must bring the reader back to ──────────────────
    await context.clearCookies({ name: "fontSize" });
    await open(page, "/Exodus.2?lang=en");
    await expect(page.locator('[role="group"][data-ref="Exodus 2:1"]')).toBeVisible();
    const homePath = path(page);
    const homeSize = await fontSize(page);
    const homeShot = await settledShot(page);
    const historyLength = await page.evaluate(() => history.length);

    // ── Load the file through the menu ────────────────────────────────────────────────────────────────────────
    await menuButton(page).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Load recording…" }).click()]);
    await chooser.setFiles(file);
    await closeMenu(page);
    const slider = dock(page).getByRole("slider", { name: "Replay position" });
    await expect(slider).toBeVisible();
    await dock(page).getByRole("button", { name: "Pause", exact: true }).click();
    await expect(dock(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
    const duration = Number(await slider.getAttribute("aria-valuemax"));

    // ── Seek to each step and compare ────────────────────────────────────────────────────────────────────────
    for (const step of steps) {
      await test.step(`replay shows "${step.name}"`, async () => {
        const at = (step.from + step.to) / 2;
        const box = (await slider.boundingBox())!;
        await page.mouse.click(box.x + (box.width * at) / duration, box.y + box.height / 2);
        const now = Number(await slider.getAttribute("aria-valuenow"));
        expect(now, "the click landed inside the step").toBeGreaterThanOrEqual(step.from);
        expect(now).toBeLessThan(step.to);
        await expect.poll(() => path(page)).toBe(step.path);
        await expectLooksLike(page, browser, step.shot, step.name);
        expect(await focusedRefs(page)).toEqual(step.focused);
        await expect(dock(page).getByRole("button", { name: "Resume", exact: true })).toHaveCount(0); // the timeline is not the person taking over
      });
    }

    // ── Leave the replay ─────────────────────────────────────────────────────────────────────────────────────
    await dock(page).getByRole("button", { name: "Exit replay" }).click();
    await expect(dock(page).getByRole("button", { name: "Replay", exact: true })).toBeVisible();
    await expect.poll(() => path(page)).toBe(homePath);
    await expect.poll(() => fontSize(page)).toBeCloseTo(homeSize, 1);
    await expectLooksLike(page, browser, homeShot, "back home");
    expect(await page.evaluate(() => history.length)).toBe(historyLength); // watching never pushed an entry
    expect((await context.cookies()).find((c) => c.name === "fontSize")).toBeUndefined(); // nor wrote the viewer's settings
  });
});
