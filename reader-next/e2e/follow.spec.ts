import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { open, segmentTop, wheel } from "./helpers";

/**
 * Follow me end to end (docs/READER_STATE_PLAN.md, task K; docs/READER_STATE_API.md, "Follow me"): pages in ONE browser context, so the
 * in-browser room (BroadcastChannel, which only reaches tabs of the same context) carries the session — no room server is needed.
 *
 * The leader starts sharing from Share, a follower opens the link, and the spec walks the follow states as a person meets them: landing
 * where the leader is, moving with the leader (the place and the scroll, not the font size), breaking away by scrolling, "Follow again",
 * the history the follower is left with, the spotlight handed to someone else, and Stop sharing.
 */

const bar = (page: Page) => page.getByRole("region", { name: "Follow", exact: true });
const side = (page: Page) => page.getByRole("complementary");
const menuButton = (page: Page) => page.getByRole("button", { name: "Text display options" });
const address = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const path = (page: Page) => new URL(page.url()).pathname;
const historyLength = (page: Page) => page.evaluate(() => history.length);
const fontSize = (page: Page) => page.locator("[data-language]").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
const verse = (page: Page, ref: string) => page.locator(`[role="group"][data-ref="${ref}"]`);

/**
 * Open a follow link in a page. A follow link is the leader's address, and the leader is on Share, so it always carries `with=Share`; the
 * server renders Share's Facebook, X and email links from a relative address and the browser from an absolute one, a hydration mismatch
 * that predates follow me (src/features/reader/ConnectionsPane.tsx, the Share view's url). Like helpers.ts's open() this fails on a
 * mismatch — every one but that known one, so the follow code itself is still held to a clean hydration.
 */
async function openLink(page: Page, link: string) {
  await page.context().addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
  const seen: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat/i.test(m.text())) seen.push(m.text());
  });
  await page.goto(link);
  await page.waitForSelector("html[data-hydrated='true']");
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // React prints each differing attribute as a "+ client" and a "- server" line (`+   href="…"`): known when every one of them is a Share
  // target's href. (The message's own bullet list also starts with "- ", but has no attribute in it.)
  const knownShareHrefs = (t: string) => {
    const diffs = t.split("\n").filter((l) => /^\s*[+-]\s+[\w-]+=/.test(l));
    return t.includes('<ConnectionsPanel label="Share"') && diffs.length > 0 && diffs.every((l) => /href=\{?"(https:\/\/www\.facebook\.com\/sharer|https:\/\/twitter\.com\/share|mailto:)/.test(l));
  };
  const unexpected = seen.filter((t) => !knownShareHrefs(t));
  if (unexpected.length) throw new Error(`hydration mismatch on ${link}:\n${unexpected.map((t) => t.slice(0, 1500)).join("\n---\n")}`);
}

/** Open a text and start sharing from its Share view; returns the follow link. */
async function startSharing(page: Page): Promise<string> {
  await open(page, "/Genesis.1?lang=en");
  await verse(page, "Genesis 1:1").click();
  await expect(page).toHaveURL(/\/Genesis\.1\.1\?.*with=all/);
  await side(page).getByRole("link", { name: "Share", exact: true }).click();
  const followMe = side(page).getByRole("region", { name: "Follow Me" });
  await followMe.getByRole("button", { name: "Start sharing" }).click();
  const linkBox = followMe.getByRole("textbox", { name: "Follow link" });
  await expect(linkBox).toHaveValue(/[?&]follow=[0-9A-Za-z]+/);
  return linkBox.inputValue();
}

/** A verse's distance from the top of the scrolling column: where the reader sees it, whatever the page's scroll. */
async function lineOffset(page: Page, ref: string): Promise<number> {
  const column = await page.locator("[data-reader-scroller]").boundingBox();
  return (await segmentTop(page, ref)) - column!.y;
}

/** The address's path once it has stopped changing (the reader settles its place shortly after scrolling stops). */
async function settledPath(page: Page): Promise<string> {
  let prev = path(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const next = path(page);
    if (next === prev) return next;
    prev = next;
  }
  throw new Error("the address never settled");
}

/** The name a guest goes by: "Guest" and the last 3 characters of the participant id this tab keeps in sessionStorage (follow/params.ts). */
async function guestName(page: Page): Promise<string> {
  const id = await page.evaluate(() => (JSON.parse(sessionStorage.getItem("sefaria-follow") ?? "null") as { participantId?: string } | null)?.participantId ?? "");
  expect(id, "the tab keeps its participant id").not.toBe("");
  return `Guest ${id.slice(-3).toUpperCase()}`;
}

/** Go to a text from the header search, as a person does (an in-app navigation: the leader's tab is the room and must not reload). */
async function goTo(page: Page, ref: string, expected: RegExp) {
  const box = page.getByRole("combobox").first();
  await box.fill(ref);
  await box.press("Enter");
  await expect(page).toHaveURL(expected, { timeout: 20_000 });
}

/** Wheel the text down in small steps until the address names verse `n` (the address follows the verse at the reading line). */
async function scrollToVerse(page: Page, book: string, chapter: number, n: number) {
  const at = () => {
    const m = path(page).match(new RegExp(`^/${book}\\.${chapter}\\.(\\d+)$`));
    return m ? Number(m[1]) : 0;
  };
  for (let i = 0; i < 40 && at() < n; i++) {
    await wheel(page, 80);
    await page.waitForTimeout(120);
  }
  await expect.poll(at, { message: `the leader reached ${book} ${chapter}:${n}` }).toBe(n);
}

// @feature reader-state Follow me
test.describe("follow me", () => {
  test("a follower moves with the leader, breaks away, follows again, and is told when sharing stops", async ({ context }) => {
    test.setTimeout(180_000);
    const leader = await context.newPage();
    const follower = await context.newPage();

    // ── The leader starts sharing ─────────────────────────────────────────────────────────────────────────────────
    const link = await startSharing(leader);
    const followMe = side(leader).getByRole("region", { name: "Follow Me" });
    expect(new URL(link).pathname).toBe(path(leader));
    await expect(bar(leader)).toHaveAttribute("data-status", "leading");
    const leaderName = await guestName(leader);

    // ── The follower opens the link: lands where the leader is, and the parameter is gone ──────────────────────────
    await openLink(follower, link);
    await expect.poll(() => follower.url()).not.toMatch(/[?&]follow=/);
    await expect(bar(follower)).toHaveAttribute("data-status", "live");
    await expect(bar(follower).getByRole("status")).toHaveText(`Following ${leaderName}`);
    await expect.poll(() => address(follower)).toBe(address(leader));
    const followerStart = await historyLength(follower);
    await expect(followMe.getByText("1 following")).toBeVisible();

    // ── The leader goes to Exodus 2 and reads down to verse 10: the follower is there, verse 10 on its reading line ─
    await goTo(leader, "Exodus 2", /\/Exodus\.2\b/);
    await expect(verse(follower, "Exodus 2:1")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => path(follower)).toBe(path(leader));
    await scrollToVerse(leader, "Exodus", 2, 10);
    await leader.waitForTimeout(400); // scrolling has stopped: the last scroll sample has gone out
    const leaderLine = await lineOffset(leader, "Exodus 2:10");
    await expect.poll(() => path(follower), { message: "the follower's address follows the verse" }).toBe("/Exodus.2.10");
    await expect.poll(async () => Math.abs((await lineOffset(follower, "Exodus 2:10")) - leaderLine), { message: "verse 10 sits where the leader sees it" }).toBeLessThan(24);
    await expect(bar(follower)).toHaveAttribute("data-status", "live");

    // ── The leader makes the text larger: the follower keeps its own size ─────────────────────────────────────────
    const followerSize = await fontSize(follower);
    const leaderSize = await fontSize(leader);
    await menuButton(leader).click();
    await leader.getByRole("button", { name: "Larger text" }).click();
    await expect.poll(() => fontSize(leader)).toBeGreaterThan(leaderSize);
    await leader.keyboard.press("Escape");
    await follower.waitForTimeout(1_000);
    expect(await fontSize(follower)).toBeCloseTo(followerSize, 1);
    await expect(bar(follower)).toHaveAttribute("data-status", "live");

    // ── The follower scrolls on its own: following pauses, with "Follow again" ────────────────────────────────────
    await follower.bringToFront();
    await wheel(follower, -300, 2);
    await expect(bar(follower)).toHaveAttribute("data-status", "paused");
    const followAgain = bar(follower).getByRole("button", { name: "Follow again" });
    await expect(followAgain).toBeVisible();
    const pausedAt = await settledPath(follower); // the address follows the follower's own scroll once it stops

    // ── The leader moves on; the follower stays where it is, and is told where the leader is ──────────────────────
    await leader.bringToFront();
    await goTo(leader, "Exodus 3", /\/Exodus\.3\b/);
    await expect(bar(follower).getByRole("status")).toHaveText(`${leaderName} is reading Exodus 3`);
    await follower.waitForTimeout(1_000);
    expect(path(follower)).toBe(pausedAt);
    await expect(bar(follower)).toHaveAttribute("data-status", "paused");

    // ── Follow again: the follower jumps to the leader ────────────────────────────────────────────────────────────
    await follower.bringToFront();
    await followAgain.click();
    await expect(bar(follower)).toHaveAttribute("data-status", "live");
    await expect(verse(follower, "Exodus 3:1")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => path(follower)).toBe(path(leader));
    expect(await historyLength(follower) - followerStart, "following adds at most one history entry").toBeLessThanOrEqual(1);

    // ── Stop sharing: the follower is told the session ended ──────────────────────────────────────────────────────
    await leader.bringToFront();
    await bar(leader).getByRole("button", { name: "Stop sharing" }).click();
    await expect(bar(follower)).toHaveAttribute("data-status", "ended");
    await expect(bar(follower).getByRole("status")).toHaveText(`${leaderName} stopped sharing`);
    await expect(bar(leader)).toHaveCount(0);
    const followerPlace = path(follower);
    await bar(follower).getByRole("button", { name: "Close" }).click();
    await expect(bar(follower)).toHaveCount(0);
    expect(path(follower), "the reader stays where it is").toBe(followerPlace);
  });

  test("the host hands the spotlight to a guest, and everyone else follows the guest", async ({ context }) => {
    test.setTimeout(120_000);
    const { host, guestA, guestB, aName } = await spotlightOnGuest(context);

    // Guest A's face is now marked as the leader for everyone
    await expect(bar(guestB).getByRole("button", { name: new RegExp(`^Follow ${aName} · leading`) })).toBeVisible();

    // Guest A moves; the host and guest B go with them
    await guestA.bringToFront();
    await goTo(guestA, "Exodus 2", /\/Exodus\.2\b/);
    await expect(verse(guestB, "Exodus 2:1")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => path(guestB)).toBe(path(guestA));
    await expect.poll(() => path(host)).toBe(path(guestA));
    await expect(bar(guestB)).toHaveAttribute("data-status", "live");
    await expect(bar(host)).toHaveAttribute("data-status", "live");
  });

  test("the host takes the spotlight back from its own face, without first breaking away from the guest it follows", async ({ context }) => {
    // Clicks inside the follow bar are the bar's, not the person moving the reader (host.ts ignores [data-reader-state-ui]), so opening
    // a face's menu keeps following and the first click lands.
    test.setTimeout(120_000);
    const { host, guestB, hostName } = await spotlightOnGuest(context);

    await host.bringToFront();
    await bar(host).getByRole("button", { name: new RegExp(`^${hostName} \\(you\\)`) }).click();
    await expect(host.getByRole("menuitem", { name: "Lead again" })).toBeVisible({ timeout: 3_000 });
    await expect(bar(host), "opening the menu is not a move of one's own").toHaveAttribute("data-status", "live");
    await host.getByRole("menuitem", { name: "Lead again" }).click();
    await expect(bar(host)).toHaveAttribute("data-status", "leading");
    await expect(bar(guestB).getByRole("status")).toHaveText(new RegExp(`(Now f|F)ollowing ${hostName}`));
  });
});

/**
 * A host and two guests, and the host's face menu "Make leader" handing guest A the spotlight. Checks the hand-over as each tab sees it:
 * guest A leads, guest B is told "Now following A", and the host follows A too.
 */
async function spotlightOnGuest(context: BrowserContext) {
  const host = await context.newPage();
  const guestA = await context.newPage();
  const guestB = await context.newPage();

  const link = await startSharing(host);
  const followMe = side(host).getByRole("region", { name: "Follow Me" });
  const hostName = await guestName(host);
  await openLink(guestA, link);
  await expect(bar(guestA)).toHaveAttribute("data-status", "live");
  await openLink(guestB, link);
  await expect(bar(guestB)).toHaveAttribute("data-status", "live");
  await expect(followMe.getByText("2 following")).toBeVisible();
  const aName = await guestName(guestA);

  await host.bringToFront();
  await bar(host).getByRole("button", { name: new RegExp(`^${aName}\\b`) }).click();
  await host.getByRole("menuitem", { name: "Make leader" }).click();

  await expect(bar(guestA)).toHaveAttribute("data-status", "leading");
  await expect(bar(guestA).getByRole("status")).toHaveText(/You are leading|Sharing · \d following/);
  await expect(bar(guestB).getByRole("status")).toHaveText(`Now following ${aName}`);
  await expect(bar(guestB)).toHaveAttribute("data-status", "live");
  await expect(bar(guestB).getByRole("status")).toHaveText(`Following ${aName}`, { timeout: 10_000 });
  await expect(bar(host)).toHaveAttribute("data-status", "live");
  await expect(bar(host).getByRole("status")).toHaveText(new RegExp(`(Now f|F)ollowing ${aName}`));
  return { host, guestA, guestB, hostName, aName };
}
