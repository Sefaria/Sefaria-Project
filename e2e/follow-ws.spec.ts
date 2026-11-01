import { execSync, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Follow me across two devices, through the dev WebSocket room server (scripts/dev-room-server.mjs) — the stand-in for the Cloudflare
 * relay: the same room (src/lib/session/room.ts) behind a WebSocket. Unlike e2e/follow.spec.ts, the leader and the follower are separate
 * browser contexts (nothing shared: no BroadcastChannel, no storage), and the follower is a phone, so every message goes over the network.
 *
 * Skipped unless FOLLOW_WS_BASE names a reader started with PUBLIC_ROOM_URL pointing at a running room server, e.g.
 *   npm run room:dev
 *   PUBLIC_LABS=follow_me,recording PUBLIC_ROOM_URL=ws://<lan-ip>:3199 npm run dev -- --host
 *   FOLLOW_WS_BASE=http://<lan-ip>:3100 npx playwright test e2e/follow-ws.spec.ts --project=desktop
 * Using the LAN address (not localhost) also checks what a real second device needs: the reader reachable on the network and the room
 * server accepting that origin.
 */
const BASE = process.env.FOLLOW_WS_BASE;
test.skip(!BASE, "set FOLLOW_WS_BASE to a reader running with PUBLIC_ROOM_URL (see the comment above)");

const bar = (page: Page) => page.getByRole("region", { name: "Follow", exact: true });
const side = (page: Page) => page.getByRole("complementary");
const path = (page: Page) => new URL(page.url()).pathname;
const verse = (page: Page, ref: string) => page.locator(`[role="group"][data-ref="${ref}"]`);

async function device(browser: Browser, kind: "laptop" | "phone"): Promise<BrowserContext> {
  const ctx = await browser.newContext(kind === "phone" ? { ...devices["Pixel 7"], baseURL: BASE } : { viewport: { width: 1280, height: 900 }, baseURL: BASE });
  await ctx.addCookies([{ name: "cookiesNotificationAccepted", value: "1", url: BASE! }]);
  return ctx;
}

async function load(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector("html[data-hydrated='true']");
}

/** Which socket the page's follow session uses, read from the browser's own view of its WebSocket traffic. */
function watchSockets(page: Page): string[] {
  const urls: string[] = [];
  page.on("websocket", (ws) => urls.push(ws.url()));
  return urls;
}

const ROOM_PORT = Number(process.env.ROOM_PORT || 3199);
const portOpen = () => new Promise<boolean>((resolve) => {
  const sock = createConnection(ROOM_PORT, "127.0.0.1", () => (sock.end(), resolve(true)));
  sock.on("error", () => resolve(false));
});

/**
 * Kill the room server and start a new one: a real outage (open sockets close, the room's memory is gone), unlike the browser's offline
 * emulation, which leaves an open WebSocket alone. The new server is left running for the next run, as the old one was.
 */
async function stopRoomServer() {
  execSync(`lsof -ti tcp:${ROOM_PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" });
  await expect.poll(portOpen, { message: "the room server stopped" }).toBe(false);
}
async function startRoomServer() {
  spawn(process.execPath, ["scripts/dev-room-server.mjs"], { detached: true, stdio: "ignore", env: process.env }).unref();
  await expect.poll(portOpen, { message: "the room server is back", timeout: 20_000 }).toBe(true);
}

async function goTo(page: Page, ref: string, expected: RegExp) {
  const box = page.getByRole("combobox").first();
  await box.fill(ref);
  await box.press("Enter");
  await expect(page).toHaveURL(expected, { timeout: 20_000 });
}

async function wheelDown(page: Page, until: (p: string) => boolean) {
  const box = await page.locator("[data-reader-scroller]:visible").first().boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(400, box!.height / 2));
  for (let i = 0; i < 40 && !until(path(page)); i++) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(120);
  }
}

// @feature reader-state Follow me
test("a phone follows a laptop through the WebSocket room server, survives a dropped connection, and is told when sharing stops", async ({ browser }) => {
  test.setTimeout(180_000);
  const laptopCtx = await device(browser, "laptop");
  const phoneCtx = await device(browser, "phone");
  const laptop = await laptopCtx.newPage();
  const phone = await phoneCtx.newPage();
  const laptopSockets = watchSockets(laptop);
  const phoneSockets = watchSockets(phone);

  // ── The laptop starts sharing ───────────────────────────────────────────────────────────────────────────────────
  await load(laptop, "/Genesis.1?lang=en");
  await verse(laptop, "Genesis 1:1").click();
  await side(laptop).getByRole("link", { name: "Share", exact: true }).click();
  const followMe = side(laptop).getByRole("region", { name: "Follow Me" });
  await followMe.getByRole("button", { name: "Start sharing" }).click();
  const link = await followMe.getByRole("textbox", { name: "Follow link" }).inputValue();
  expect(link).toMatch(/[?&]follow=[0-9A-Za-z]+/);
  await expect(bar(laptop)).toHaveAttribute("data-status", "leading");
  const sessionId = new URL(link).searchParams.get("follow")!;
  await expect.poll(() => laptopSockets.some((u) => u.endsWith(`/r/${sessionId}`)), { message: "the laptop talks to the room server" }).toBe(true);

  // ── The phone opens the link: it joins over its own socket and lands where the laptop is ─────────────────────────
  await load(phone, link);
  await expect.poll(() => phone.url()).not.toMatch(/[?&]follow=/);
  await expect(bar(phone)).toHaveAttribute("data-status", "live", { timeout: 15_000 });
  await expect.poll(() => phoneSockets.some((u) => u.endsWith(`/r/${sessionId}`)), { message: "the phone talks to the room server" }).toBe(true);
  await expect.poll(() => path(phone)).toBe(path(laptop));
  await expect(followMe.getByText("1 following")).toBeVisible();

  // ── The laptop goes to Exodus 2 and reads down: the phone follows the place and the verse ────────────────────────
  await goTo(laptop, "Exodus 2", /\/Exodus\.2\b/);
  await expect(verse(phone, "Exodus 2:1")).toBeVisible({ timeout: 20_000 });
  await wheelDown(laptop, (p) => /^\/Exodus\.2\.(\d+)$/.test(p) && Number(p.split(".")[2]) >= 8);
  await laptop.waitForTimeout(600);
  const laptopVerse = path(laptop);
  expect(laptopVerse).toMatch(/^\/Exodus\.2\.\d+$/);
  const ref = `Exodus 2:${laptopVerse.split(".")[2]}`;
  // the verse the laptop reads is on the phone's screen (in view, not just below it)
  const inView = async () => {
    const box = await verse(phone, ref).boundingBox();
    const height = phone.viewportSize()!.height;
    return !!box && box.y >= 0 && box.y < height * 0.75;
  };
  await expect.poll(inView, { message: `${ref} is on the phone's screen`, timeout: 15_000 }).toBe(true);
  await expect(bar(phone)).toHaveAttribute("data-status", "live");
  // FOLLOW_WS_SHOTS=<dir>: keep a picture of both screens at this moment
  if (process.env.FOLLOW_WS_SHOTS) {
    await laptop.screenshot({ path: `${process.env.FOLLOW_WS_SHOTS}/follow-ws-laptop.png` });
    await phone.screenshot({ path: `${process.env.FOLLOW_WS_SHOTS}/follow-ws-phone.png` });
  }

  // ── The room server goes down; the laptop moves on meanwhile; the server comes back empty, both devices reconnect, the laptop
  //    takes the spotlight again, and the phone catches up ────────────────────────────────────────────────────────────
  await stopRoomServer();
  await expect(bar(phone)).toHaveAttribute("data-status", /reconnecting|connecting/, { timeout: 20_000 });
  await goTo(laptop, "Exodus 4", /\/Exodus\.4\b/);
  await phone.waitForTimeout(1_000);
  expect(path(phone), "while the room is down, the phone stays where it was").toMatch(/^\/Exodus\.2/);
  await startRoomServer();
  await expect(bar(phone)).toHaveAttribute("data-status", "live", { timeout: 30_000 });
  await expect(verse(phone, "Exodus 4:1")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => path(phone)).toMatch(/^\/Exodus\.4/);

  // ── Stop sharing: the phone is told ──────────────────────────────────────────────────────────────────────────────
  await bar(laptop).getByRole("button", { name: "Stop sharing" }).click();
  await expect(bar(phone)).toHaveAttribute("data-status", "ended", { timeout: 15_000 });

  await laptopCtx.close();
  await phoneCtx.close();
});
