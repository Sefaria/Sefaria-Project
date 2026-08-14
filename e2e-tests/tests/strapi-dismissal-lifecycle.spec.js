/**
 * Playwright Tests: the dismissal lifecycle across page loads (synthetic payload)
 *
 * Dismissal is state WRITTEN by one component in one page view (the × click in Misc.jsx) and
 * CONSUMED by different components in later ones (the cleanup in context.js, the gate in
 * strapiSelection.js). That makes it a SEAM, and seams are where unit-style tests go blind:
 * any party can break the chain — the writer, a cleanup that wipes the key, the reader, the
 * gate — while every per-component test stays green. When a behavior's definition spans a
 * boundary (page load, session, tab), at least one test should physically cross that boundary
 * the way a user does. These tests reload and re-route rather than seed storage for exactly
 * that reason. The basic drain sequence (winner dismissed → runner-up → quiet) lives in
 * strapi-selection-order.spec.js; this file opens with the BASELINE — an undismissed winner
 * repeats on every load; there is no frequency cap or rotation — and then the lifecycle's edges:
 *
 *   1. SURFACE INDEPENDENCE — banner and modal dismissals must not bleed into each other, even
 *      when the two documents share an internal name. The localStorage keys differ only by the
 *      CONTENT_FIELDS storagePrefix ("banner_" / "modal_"), so this pins that one prefix's
 *      write is invisible to the other's gate.
 *
 *   2. REPUBLICATION FRESH CHANCE — a dismissed campaign that leaves the payload has its key
 *      dropped by removeStaleDismissals (only LIVE documents keep their dismissal keys); when
 *      the campaign is republished later, it gets a fresh showing. This is the editorial
 *      lifecycle of an annual campaign: dismissing it one year must not suppress it forever.
 *
 *   3. IN-APP NAVIGATION — a dismissed banner must stay dismissed while the viewer browses
 *      client-side (TOC → category → book → reader → resource panel), where no reload re-runs
 *      selection and other components mount and unmount around it.
 *
 *   4. SESSION BOUNDARY — the next SESSION (fresh sessionStorage, carried localStorage) is
 *      where a dismissal meets the visitor-kind transition: the same viewer who was "new" is
 *      now "returning", so both the dismissal key AND the audience gate change which document
 *      they see. Playwright's storageState carries cookies and localStorage but never
 *      sessionStorage — exactly a browser restart's semantics.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, banner, modal, strapiPayload, daysFromNow } from '../support/strapi-payload-factory.js';
import {
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
  advanceBy,
  waitForTimerArmed,
  waitForStrapiResponse,
  strapiResponseCount,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const PAGE_PATH = '/texts';
const DELAY_SECONDS = 5;

const modalBox = (page) => page.locator('#interruptingMessageBox');
const bannerBox = (page) => page.locator('#bannerMessage');

async function open(page, context, payload) {
  const strapi = await routeWithStrapiPayload(context, payload);
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, LANGUAGES.EN);
  return strapi;
}

async function elapseShowDelay(page) {
  await waitForTimerArmed(page, DELAY_SECONDS * 1000);
  await advanceBy(page, DELAY_SECONDS * 1000 + 1000);
}

/** Prove the payload arrived, then advance far past the delay without requiring a timer. */
async function elapseWithNothingExpected(page) {
  await waitForStrapiResponse(page, strapiResponseCount(page) - 1);
  await advanceBy(page, DELAY_SECONDS * 1000 * 5);
}

test.describe('Strapi dismissal lifecycle — repeat exposure is the baseline', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('an undismissed winner shows again on the next load — same document, not the runner-up', async ({
    page,
    context,
  }) => {
    // The exposure policy, stated as a test: there is NO frequency cap, rotation, or
    // per-session variety. The ranking winner repeats on every load until the viewer dismisses
    // it or its window ends — dismissal is the only thing that changes what a viewer sees.
    // Every fallthrough test in this suite implicitly assumes this baseline; this one pins it,
    // so a future "rotate campaigns per visit" change has to come here and say so.
    const WEEKLY = 'Synthetic repeat-exposure weekly banner';
    const DAILY = 'Synthetic repeat-exposure daily banner';
    strapi = await open(
      page,
      context,
      strapiPayload({
        banners: [
          banner({
            window: { start: daysFromNow(-3), end: daysFromNow(4) },
            shared: { showDelay: DELAY_SECONDS, internalBannerName: 'repeat-weekly' },
            locales: { en: { bannerText: WEEKLY } },
          }),
          banner({
            window: { start: daysFromNow(-0.5), end: daysFromNow(0.5) },
            shared: { showDelay: DELAY_SECONDS, internalBannerName: 'repeat-daily' },
            locales: { en: { bannerText: DAILY } },
          }),
        ],
      }),
    );

    // Load 1: the daily wins the ranking (shorter window; the weekly is listed first).
    await elapseShowDelay(page);
    await expect(bannerBox(page)).toContainText(DAILY);

    // No dismissal — just another visit.
    await page.reload();
    await elapseShowDelay(page);
    await expect(bannerBox(page)).toContainText(DAILY);
    await expect(bannerBox(page)).not.toContainText(WEEKLY);

    // The positive anchor: neither document was silently marked dismissed along the way —
    // showing a banner must never write its own dismissal key.
    const keys = await page.evaluate(() => [
      localStorage.getItem('banner_repeat-daily'),
      localStorage.getItem('banner_repeat-weekly'),
    ]);
    expect(keys).toEqual([null, null]);
  });
});

test.describe('Strapi dismissal lifecycle — the button click dismisses like the ×', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test("clicking the banner's button counts as dismissal — the runner-up shows next load", async ({
    page,
    context,
  }) => {
    // Misc.jsx wires BOTH exits through closeBanner: the × ("close_clicked") and the CTA button
    // ("banner_button_clicked"). The × path is covered elsewhere; this pins the button path —
    // engaging with a campaign retires it exactly like closing it, so the next load belongs to
    // the runner-up. The button is a real <a href> to an external campaign page, so the
    // navigation is aborted at the network layer; the onClick (which writes the dismissal key)
    // fires before the navigation dies.
    const WINNER = 'Synthetic banner retired by its own button';
    const RUNNER_UP = 'Synthetic runner-up after button click';
    await context.route('https://example.org/**', (route) => route.abort());

    strapi = await open(
      page,
      context,
      strapiPayload({
        banners: [
          banner({
            window: { start: daysFromNow(-3), end: daysFromNow(4) },
            shared: { showDelay: DELAY_SECONDS, internalBannerName: 'button-runner-up' },
            locales: { en: { bannerText: RUNNER_UP } },
          }),
          banner({
            window: { start: daysFromNow(-0.5), end: daysFromNow(0.5) },
            shared: {
              showDelay: DELAY_SECONDS,
              internalBannerName: 'button-clicked-winner',
              buttonURL: 'https://example.org/external-campaign',
            },
            locales: { en: { bannerText: WINNER } },
          }),
        ],
      }),
    );

    await elapseShowDelay(page);
    await expect(bannerBox(page)).toContainText(WINNER);

    await page.locator('#bannerButtonBox a.int-en').click();
    await expect(bannerBox(page)).toHaveCount(0);

    // Explicit goto rather than reload(): the aborted CTA navigation left the browser's current
    // navigation entry pointing at the dead external URL, so reload() would retry THAT and fail
    // with net::ERR_FAILED. Going back to the page is also truer to "the next visit".
    await page.goto(PAGE_PATH);
    await elapseShowDelay(page);
    await expect(bannerBox(page)).toContainText(RUNNER_UP);
    await expect(bannerBox(page)).not.toContainText(WINNER);
  });
});

test.describe('Strapi dismissal lifecycle — surfaces are independent', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('dismissing the banner does not dismiss a modal with the SAME internal name', async ({
    page,
    context,
  }) => {
    // The deliberately nasty shape: one campaign published as both a banner and a modal under
    // one internal name. Their dismissal keys differ only by prefix — banner_shared-campaign
    // vs. modal_shared-campaign — so this fails if the prefix is dropped, unified, or applied
    // to the wrong surface.
    //
    // STAGGERED DELAYS, NOT EQUAL ONES: the modal renders a full-page overlay
    // (#interruptingMessageOverlay) that sits on top of the banner and intercepts its × click.
    // The banner gets the shorter delay so it can be dismissed before the modal mounts; the
    // distinct values also keep waitForTimerArmed unambiguous about whose timer it saw.
    const BANNER_DELAY = 5;
    const MODAL_DELAY = 9;
    const BANNER_TEXT = 'Synthetic shared-name banner';
    const MODAL_TEXT = 'Synthetic shared-name modal';
    strapi = await open(
      page,
      context,
      strapiPayload({
        banners: [
          banner({
            shared: { showDelay: BANNER_DELAY, internalBannerName: 'shared-campaign' },
            locales: { en: { bannerText: BANNER_TEXT } },
          }),
        ],
        modals: [
          modal({
            shared: { showDelay: MODAL_DELAY, internalModalName: 'shared-campaign' },
            locales: { en: { modalText: MODAL_TEXT } },
          }),
        ],
      }),
    );

    // Load 1: the banner appears first (its delay elapses; the modal's has 3s left)...
    await waitForTimerArmed(page, BANNER_DELAY * 1000);
    await advanceBy(page, BANNER_DELAY * 1000 + 1000);
    await expect(bannerBox(page)).toContainText(BANNER_TEXT);
    await expect(modalBox(page)).toHaveCount(0);

    // ...and is dismissed with nothing covering it.
    await page.locator('#bannerMessageClose').click();
    await expect(bannerBox(page)).toHaveCount(0);

    // The like-named modal still mounts in the same page view once ITS delay elapses.
    await waitForTimerArmed(page, MODAL_DELAY * 1000);
    await advanceBy(page, (MODAL_DELAY - BANNER_DELAY) * 1000 + 1000);
    await expect(modalBox(page)).toContainText(MODAL_TEXT);

    // And — the part a same-view assertion cannot prove — across the NEXT load: the banner's
    // key gates only the banner, and the like-named modal is selected and shown again.
    await page.reload();
    await waitForTimerArmed(page, MODAL_DELAY * 1000);
    await advanceBy(page, MODAL_DELAY * 1000 + 1000);
    await expect(modalBox(page)).toContainText(MODAL_TEXT);
    await expect(bannerBox(page)).toHaveCount(0);
  });
});

test.describe('Strapi dismissal lifecycle — a republished campaign gets a fresh chance', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('dismissed, unpublished, republished: the campaign shows again', async ({ page, context }) => {
    // Three eras of one campaign, using re-routing (later context.route registrations win) to
    // change what "Strapi" returns between reloads:
    //   era 1: live      — shows; the viewer dismisses it (key written);
    //   era 2: unpublished — payload no longer carries it; removeStaleDismissals drops its key,
    //          because only LIVE documents keep dismissal state; nothing renders;
    //   era 3: republished — the key is long gone, so the campaign earns a fresh showing.
    const CAMPAIGN = 'Synthetic comeback campaign modal';
    const campaignModal = () =>
      modal({
        shared: { showDelay: DELAY_SECONDS, internalModalName: 'comeback-campaign' },
        locales: { en: { modalText: CAMPAIGN } },
      });

    // Era 1: live, shown, dismissed.
    strapi = await open(page, context, strapiPayload({ modals: [campaignModal()] }));
    await elapseShowDelay(page);
    await expect(modalBox(page)).toContainText(CAMPAIGN);
    await page.locator('#interruptingMessageClose').click();
    await expect(modalBox(page)).toHaveCount(0);

    // Era 2: unpublished. The cleanup runs on this load and forgets the dismissal.
    strapi = await routeWithStrapiPayload(context, strapiPayload({}));
    await page.reload();
    await elapseWithNothingExpected(page);
    await expect(modalBox(page)).toHaveCount(0);
    // The observable half of the cleanup contract, asserted directly so era 3 cannot pass for
    // some unrelated reason (e.g. dismissal reads breaking entirely).
    const keyAfterUnpublish = await page.evaluate(() => localStorage.getItem('modal_comeback-campaign'));
    expect(keyAfterUnpublish).toBe(null);

    // Era 3: republished — a fresh chance, exactly as if it were a brand-new campaign.
    strapi = await routeWithStrapiPayload(context, strapiPayload({ modals: [campaignModal()] }));
    await page.reload();
    await elapseShowDelay(page);
    await expect(modalBox(page)).toContainText(CAMPAIGN);
  });
});

test.describe('Strapi dismissal lifecycle — a dismissal survives in-app navigation', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a dismissed banner stays gone through TOC → book → reader → resource panel', async ({
    page,
    context,
  }) => {
    // Banner and InterruptingMessage mount at the TOP of ReaderApp (ReaderApp.jsx:2461), above
    // the panel tree, so client-side navigation swaps everything around them while they stay
    // put. Two independent defenses keep a dismissed banner gone within one page view — the
    // component's local hasInteractedWithBanner state, and the shouldShow dismissal re-check if
    // anything remounts it — and this test pins the INVARIANT rather than either mechanism.
    //
    // REMOUNT NOTE: a true in-page remount of these components is not reachable by any real
    // flow today — they are key-less and unconditional at the root, so the only remount is a
    // full page load, where selection re-runs with the dismissal gate anyway. The re-check
    // defense is therefore only directly testable at the component level, which Misc.jsx's
    // import graph (CSS imports, heavy transitive deps) currently prevents under Jest. If these
    // components ever gain a key, a conditional wrapper, or move into the panel tree, that is
    // the moment to add a component-level remount test.
    //
    // TWO NON-VACUITY ANCHORS, because "it never came back" is cheap to pass by accident:
    //   * the timer-capture array from prepareStrapiPage survives to the end — init scripts
    //     only re-run on real navigations, so a surviving array proves every hop stayed
    //     client-side and selection was never simply re-run with the dismissal key;
    //   * the banner's showDelay is a value nothing else on the page uses (7s, per the
    //     waitForTimerArmed guidance), so "exactly one 7000ms timer was ever armed" proves no
    //     component re-armed the banner after dismissal.
    const NAV_DELAY = 7;
    const BANNER_TEXT = 'Synthetic banner dismissed before browsing';
    strapi = await open(
      page,
      context,
      strapiPayload({
        banners: [
          banner({
            shared: { showDelay: NAV_DELAY, internalBannerName: 'browse-away-banner' },
            locales: { en: { bannerText: BANNER_TEXT } },
          }),
        ],
      }),
    );

    await waitForTimerArmed(page, NAV_DELAY * 1000);
    await advanceBy(page, NAV_DELAY * 1000 + 1000);
    await expect(bannerBox(page)).toContainText(BANNER_TEXT);
    await page.locator('#bannerMessageClose').click();
    await expect(bannerBox(page)).toHaveCount(0);

    // Browse client-side: TOC category → book → reader. Each hop asserts arrival, and the
    // banner is checked absent at every stop.
    await page.locator('a[href="/texts/Tanakh"]').first().click();
    await expect(page).toHaveURL(/texts\/Tanakh/);
    await expect(bannerBox(page)).toHaveCount(0);

    await page.getByRole('link', { name: 'Genesis', exact: true }).first().click();
    await expect(page).toHaveURL(/Genesis/);
    await expect(bannerBox(page)).toHaveCount(0);

    // Into the reader, then open the resource panel (ConnectionsPanel) by clicking a segment —
    // a large component mounting alongside the banner's slot.
    await page.getByRole('link', { name: '1', exact: true }).first().click();
    await expect(page.locator('.segment').first()).toBeVisible();
    await page.locator('.segment').first().click();
    await expect(page.locator('.readerPanelBox.sidebar')).toBeVisible();
    await expect(bannerBox(page)).toHaveCount(0);

    // Time passing after all that mounting must not resurrect the banner either.
    await advanceBy(page, NAV_DELAY * 1000 * 3);
    await expect(bannerBox(page)).toHaveCount(0);

    // The non-vacuity anchors: same JS context all along (array survived), one arm ever.
    const bannerTimerArms = await page.evaluate(
      (delayMs) => (window.__armedTimerDelays || []).filter((delay) => delay === delayMs).length,
      NAV_DELAY * 1000,
    );
    expect(bannerTimerArms).toBe(1);
  });
});

test.describe('Strapi dismissal lifecycle — the next session crosses the visitor-kind transition', () => {
  const strapiHandles = [];

  test.afterEach(() => {
    strapiHandles.splice(0).forEach(expectStrapiServed);
  });

  test('a new visitor dismisses their banner; next session they are returning and get the other one', async ({
    page,
    context,
    browser,
  }) => {
    // Session 1: a fresh context IS a new visitor. ReaderApp marks them (sessionStorage
    // isNewVisitor=true keeps the session "new"; localStorage isReturningVisitor=true makes the
    // NEXT session returning). They see the new-visitors-only banner and dismiss it.
    // Session 2: a new context built from storageState — cookies and localStorage carried,
    // sessionStorage gone, which is precisely what closing and reopening the browser does. The
    // same viewer is now a returning visitor, so BOTH doors have changed: the dismissed
    // new-visitors banner is out on two gates, and the returning-visitors banner is finally in.
    const NEW_BANNER = 'Synthetic banner for new visitors';
    const RETURNING_BANNER = 'Synthetic banner for returning visitors';
    const kindBanner = (name, kindOverrides, text) =>
      banner({
        shared: {
          showDelay: DELAY_SECONDS,
          internalBannerName: name,
          showToNewVisitors: false,
          showToReturningVisitors: false,
          showToSustainers: false,
          showToNonSustainers: false,
          ...kindOverrides,
        },
        locales: { en: { bannerText: text } },
      });
    const payload = () =>
      strapiPayload({
        banners: [
          kindBanner('for-new-visitors', { showToNewVisitors: true }, NEW_BANNER),
          kindBanner('for-returning-visitors', { showToReturningVisitors: true }, RETURNING_BANNER),
        ],
      });

    // ── Session 1 ──
    strapiHandles.push(await open(page, context, payload()));
    await elapseShowDelay(page);
    await expect(bannerBox(page)).toContainText(NEW_BANNER);
    await page.locator('#bannerMessageClose').click();
    await expect(bannerBox(page)).toHaveCount(0);

    // ── Session 2 ──
    const sessionTwo = await browser.newContext({ storageState: await context.storageState() });
    try {
      strapiHandles.push(await routeWithStrapiPayload(sessionTwo, payload()));
      const pageTwo = await sessionTwo.newPage();
      await prepareStrapiPage(pageTwo, { pinnedNow: SYNTHETIC_NOW });
      await pageTwo.goto(PAGE_PATH);
      await expectInterfaceLanguage(pageTwo, LANGUAGES.EN);

      await waitForTimerArmed(pageTwo, DELAY_SECONDS * 1000);
      await advanceBy(pageTwo, DELAY_SECONDS * 1000 + 1000);
      await expect(bannerBox(pageTwo)).toBeVisible();
      await expect(bannerBox(pageTwo)).toContainText(RETURNING_BANNER);
      await expect(bannerBox(pageTwo)).not.toContainText(NEW_BANNER);
    } finally {
      await sessionTwo.close();
    }
  });
});
