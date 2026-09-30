/**
 * Playwright Test: Strapi Banner — a published banner is displayed
 *
 * Scope: this spec verifies ONLY that a banner published in Strapi reaches the client and renders.
 * It makes no assertions about modals or sidebar ads — those surfaces have their own specs, so a
 * failure here always points at the banner path.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload and marks every modal_/banner_ localStorage key as already-seen — i.e. it suppresses
 *   exactly what this spec asserts on (see e2e-tests/CLAUDE.md §3). So this spec intentionally uses
 *   a bare page.goto plus routeFromHAR, keeping Strapi ON. Do NOT route it through PageManager.
 *
 * Replayed from the scenario's recorded .har; see ./strapi.fixtures.js for the recording workflow.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiHarFixture, expectStrapiServedFromHar } from '../support/strapi-har-fixture.js';
import {
  SCENARIOS,
  prepareStrapiPage,
  advanceUntilVisible,
  advanceBy,
  strapiResponseCount,
  waitForStrapiResponse,
} from './strapi.fixtures.js';

const scenario = SCENARIOS.publishedBanner;

test.describe('Strapi Banner', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  // A HAR miss is blocked rather than forwarded to live Strapi, which would otherwise surface only
  // as a generic "not visible". This reports the real cause instead.
  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  test('a published banner is displayed', async ({ page }) => {
    await page.goto('/');

    // The banner mounts inside StrapiDataProvider on every ReaderApp page (ReaderApp.jsx) but
    // stays hidden until its showDelay timer elapses. The clock is installed (fake timers), so
    // that only happens when the test advances it.
    const banner = page.locator('#bannerMessage');
    await advanceUntilVisible(page, banner);

    await expect(banner).toContainText(scenario.expected.banner.bodyText);
  });

  test('dismissing the banner keeps it hidden after a reload', async ({ page }) => {
    const { internalBannerName, showDelaySeconds } = scenario.expected.banner;
    const storageKey = `banner_${internalBannerName}`;

    await page.goto('/');
    const banner = page.locator('#bannerMessage');

    // Positive control first: the banner genuinely renders under these conditions. Without this
    // the "stays hidden" assertion below could pass for the wrong reason.
    await advanceUntilVisible(page, banner);
    expect(await page.evaluate((k) => localStorage.getItem(k), storageKey)).toBeNull();

    await page.locator('#bannerMessageClose').click();
    await expect(banner).toBeHidden();
    // Dismissal is persisted client-side; shouldShow() reads this key on the next page load.
    expect(await page.evaluate((k) => localStorage.getItem(k), storageKey)).toBe('true');

    const hitsBeforeReload = strapiResponseCount(page);
    await page.reload();

    // Prove the payload was delivered again — otherwise "banner absent" would just mean "no data",
    // which is not what this test is about.
    await waitForStrapiResponse(page, hitsBeforeReload);

    // Advance well past the showDelay. Because the clock is faked, this is a real elapse of app
    // time rather than a wall-clock guess: if the banner were going to arm and fire, it would have.
    await advanceBy(page, showDelaySeconds * 1000 * 5);
    await expect(banner).toBeHidden();
  });
});
