/**
 * Playwright Tests: showDelay boundaries (synthetic payload)
 *
 * Each banner and modal waits `showDelay` seconds before rendering, via a setTimeout armed in a
 * useEffect (Misc.jsx). Nothing covered that until now: every recorded scenario publishes
 * showDelay 1 and asserts only that the surface eventually appears, which would pass just as well
 * if the delay were ignored entirely.
 *
 * WHY THIS SPEC IS SYNTHETIC RATHER THAN RECORDED. It needs two surfaces with DIFFERENT, unusual
 * delays in one payload — a state nobody would publish, and one that would have to be re-published
 * and re-recorded to change a single number. In the factory it is two fields.
 *
 * THE VACUOUS-PASS TRAP THIS SPEC IS BUILT AROUND (see advanceBy in strapi.fixtures.js). The timer
 * is armed several async hops after the Strapi response lands: the app awaits response.json(), runs
 * the .then() that sets React state, and re-renders so the useEffect can schedule it. Advance the
 * clock before that happens and it moves past nothing — so "still hidden before the delay" passes
 * WITHOUT TESTING ANYTHING, and would keep passing if showDelay were broken. `waitForTimerArmed`
 * removes the race at its source by waiting for the timer itself.
 *
 * That wait is doing double duty: `useEffect` only arms the timer when `shouldShow()` returns true,
 * so a timer of exactly this delay existing also proves every gate — locale, country, showTo,
 * excludedPaths — already passed.
 *
 * DELIBERATELY ODD DELAYS. waitForTimerArmed matches on the delay value, and a page arms plenty of
 * timers of its own; 7s and 11s are values nothing else is likely to use, whereas a round 1s could
 * match a third-party timer and resolve before the surface's own timer existed.
 *
 * THE TWO TESTS ARE EACH OTHER'S POSITIVE CONTROL. Both surfaces come from ONE payload with
 * different delays, so the modal test asserts the modal is still hidden at a moment the banner has
 * already appeared. That single frame proves the payload arrived, the clock is moving, and
 * rendering works — so the modal's absence is its own delay and nothing else.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, banner, modal, strapiPayload } from '../support/strapi-payload-factory.js';
import {
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
  advanceBy,
  waitForTimerArmed,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const PAGE_PATH = '/texts';

const BANNER_DELAY_SECONDS = 7;
const MODAL_DELAY_SECONDS = 11;

const BANNER_TEXT = 'Synthetic banner on a seven second delay';
const MODAL_TEXT = 'Synthetic modal on an eleven second delay';

/** One payload, one banner and one modal, each with its own delay. */
const payload = () =>
  strapiPayload({
    banners: [
      banner({
        shared: { showDelay: BANNER_DELAY_SECONDS },
        locales: { en: { bannerText: BANNER_TEXT } },
      }),
    ],
    modals: [
      modal({
        shared: { showDelay: MODAL_DELAY_SECONDS },
        locales: { en: { modalText: MODAL_TEXT } },
      }),
    ],
  });

const bannerBox = (page) => page.locator('#bannerMessage');
const modalBox = (page) => page.locator('#interruptingMessageBox');

test.describe('Strapi showDelay — a surface waits exactly its own delay', () => {
  let strapi;

  test.beforeEach(async ({ page, context }) => {
    strapi = await routeWithStrapiPayload(context, payload());
    await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
    await useInterfaceLanguage(page, LANGUAGES.EN);
    await page.goto(PAGE_PATH);
    await expectInterfaceLanguage(page, LANGUAGES.EN);
  });

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('the banner is hidden one second before its delay and visible one second after', async ({ page }) => {
    await waitForTimerArmed(page, BANNER_DELAY_SECONDS * 1000);

    await advanceBy(page, (BANNER_DELAY_SECONDS - 1) * 1000);
    await expect(bannerBox(page)).toHaveCount(0);

    await advanceBy(page, 2000);
    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(BANNER_TEXT);
  });

  test('the modal keeps its own longer delay while the banner has already appeared', async ({ page }) => {
    await waitForTimerArmed(page, MODAL_DELAY_SECONDS * 1000);

    // Past the banner's delay, short of the modal's.
    await advanceBy(page, (MODAL_DELAY_SECONDS - 1) * 1000);

    // The positive control, in the same frame as the assertion it protects: the banner rendering
    // proves the payload arrived, the clock moved, and surfaces render — so the modal being absent
    // is about its own delay, not about nothing having happened yet.
    await expect(bannerBox(page)).toBeVisible();
    await expect(modalBox(page)).toHaveCount(0);

    await advanceBy(page, 2000);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(MODAL_TEXT);
  });
});
