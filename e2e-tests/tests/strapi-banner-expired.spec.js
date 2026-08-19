/**
 * Playwright Tests: Strapi Banner — expired date window
 *
 * A banner whose end date has passed. The point is that it is still DELIVERED — the server only
 * filters to content whose whole window fits inside now ± 14 days, which this banner does — and
 * that the client declines to render it.
 *
 * That client-side date check had no coverage before this. Every other scenario pins a clock
 * inside its content's window, so the gate always said yes and would have gone on saying yes even
 * if it had been deleted.
 *
 * The spec asserts both halves separately:
 *   1. the payload the page received really does contain the banner (captured from the response,
 *      so it is what the app saw, not what a fixture file claims);
 *   2. nothing renders for it.
 *
 * VIEWER CANDIDATES ARE PINNED TO {GB} ON PURPOSE. The banner targets `exclude [US]`, which that
 * viewer passes, so expiry is the ONLY gate it fails. The test overrides only the signals consumed
 * by countryCandidates; it leaves Date and the browser timezone itself alone so the HAR request's
 * recorded date range still matches.
 *
 * THE POSITIVE CONTROL IS A REAL RENDER. A modal published in the same payload is still active at
 * the pinned clock, and the test waits for it to appear. That single step establishes three things
 * the assertion depends on: the payload arrived, the clock advanced past showDelay, and rendering
 * works at all. Only then is "no banner" meaningful.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload and marks every modal_/banner_ localStorage key as already-seen — i.e. it suppresses
 *   exactly what this spec asserts on (see e2e-tests/CLAUDE.md §3). So it intentionally uses a
 *   bare page.goto plus routeFromHAR, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiHarFixture, expectStrapiServedFromHar } from '../support/strapi-har-fixture.js';
import {
  SCENARIOS,
  prepareStrapiPage,
  advanceUntilVisible,
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.bannerExpired;
const expected = scenario.expected;

test.describe('Strapi Banner — expired date window', () => {
  test.use({ extraHTTPHeaders: { 'cf-ipcountry': scenario.viewerCountry } });

  let har;
  /** The Strapi payload as the page actually received it. */
  let payload;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);

    // The shared Playwright config uses America/New_York and an en-US browser locale, either of
    // which would add US to the plausible-country set. Under conservative exclusion that would
    // make this expired exclude-[US] banner fail two gates. Pin the targeting signals to GB while
    // preserving the real timezone used by Date, because changing that would invalidate the HAR's
    // date-derived query and POST body.
    await page.addInitScript(() => {
      const nativeResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
      Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptionsWithoutCountryHint() {
        return { ...nativeResolvedOptions.call(this), timeZone: 'Etc/Unknown' };
      };
      Object.defineProperty(window.navigator, 'language', {
        value: 'en-GB',
        configurable: true,
      });
    });

    payload = null;
    page.on('response', async (response) => {
      if (!response.url().includes('/api/strapi/')) return;
      payload = await response.json().catch(() => null);
    });
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  test('is delivered in the payload but not displayed', async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.EN);
    await page.goto('/');
    await expectInterfaceLanguage(page, LANGUAGES.EN);

    // Control: a co-published modal that is still active renders. Waiting for it also advances the
    // clock past the showDelay that the banner would have used, had it armed a timer at all.
    await advanceUntilVisible(page, page.locator('#interruptingMessageBox'));

    // Half one: the banner really was delivered — the server's ±14-day filter did not remove it.
    const delivered = payload?.data?.en_banners ?? [];
    expect(delivered).toHaveLength(1);
    expect(delivered[0].internalBannerName).toBe(expected.banner.internalBannerName);
    expect(delivered[0].bannerEndDate).toBe(expected.banner.endDate);

    // Half two: and the client declined to render it, because that end date has passed.
    await expect(page.locator('#bannerMessage')).toHaveCount(0);
  });
});
