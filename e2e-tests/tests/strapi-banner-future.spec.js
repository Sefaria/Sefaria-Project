/**
 * Playwright Tests: Strapi Banner — future date window
 *
 * A banner whose start date has not arrived yet. As with strapi-banner-expired.spec.js, the point
 * is that it IS delivered — the server only filters to content whose whole window fits inside
 * now ± 14 days, which this banner does — and that the client declines to render it.
 *
 * WHY THIS IS NOT A DUPLICATE OF THE EXPIRED SPEC. context.js selects a banner with
 *     currentDate >= new Date(b.bannerStartDate) && currentDate <= new Date(b.bannerEndDate)
 * Two comparisons. The expired scenario exercises only the second one; if the first were inverted,
 * every expired test would still pass. This covers the other half of the conjunction. Both specs
 * pin the SAME instant, so the pair differs only in where the content's window sits relative to it.
 *
 * COUNTRY IS NOT A VARIABLE FOR THE SUBJECT. This banner targets `countryMode: all`, so no viewer
 * can be excluded by country and the start date is the only thing that can withhold it. The
 * `cf-ipcountry` header below exists solely to keep the CONTROL modal eligible — that modal
 * include-targets GB — and is set explicitly rather than relying on the server's PINNED_IPCOUNTRY
 * default, so the dependency is visible instead of ambient.
 *
 * THE POSITIVE CONTROL IS A REAL RENDER: the co-published modal is still active at the pinned
 * clock, and the test waits for it. That establishes the payload arrived, the clock advanced past
 * showDelay, and rendering works — only then is "no banner" meaningful.
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

const scenario = SCENARIOS.bannerNotYetStarted;
const expected = scenario.expected;

test.describe('Strapi Banner — future date window', () => {
  test.use({ extraHTTPHeaders: { 'cf-ipcountry': scenario.viewerCountry } });

  let har;
  /** The Strapi payload as the page actually received it. */
  let payload;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);

    payload = null;
    page.on('response', async (response) => {
      if (!response.url().includes('/api/strapi/')) return;
      payload = await response.json().catch(() => null);
    });
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  test('is delivered in the payload but not yet displayed', async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.EN);
    await page.goto('/');
    await expectInterfaceLanguage(page, LANGUAGES.EN);

    // Control: a co-published modal that IS active renders. Waiting for it also advances the clock
    // past the showDelay this banner would have used, had it armed a timer at all.
    await advanceUntilVisible(page, page.locator('#interruptingMessageBox'));

    // Half one: the banner really was delivered — the server's ±14-day filter kept it.
    const delivered = payload?.data?.en_banners ?? [];
    expect(delivered).toHaveLength(1);
    expect(delivered[0].internalBannerName).toBe(expected.banner.internalBannerName);
    expect(delivered[0].bannerStartDate).toBe(expected.banner.startDate);

    // Half two: and the client declined to render it, because that start date is still ahead.
    await expect(page.locator('#bannerMessage')).toHaveCount(0);
  });
});
