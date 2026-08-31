/**
 * Playwright Tests: Strapi Sidebar Ad — Hebrew-only locale separation
 *
 * The same sidebar-ad document as strapi-sidebar-ad.spec.js, with only its Hebrew locale
 * published. It covers two things at once: that keyword targeting still behaves under a Hebrew
 * interface, and that an ad published in one locale does not leak into the other.
 *
 * LOCALE FILTERING WORKS DIFFERENTLY HERE THAN FOR BANNERS AND MODALS.
 * Those merge their per-locale rows into a single document and gate on
 * `locales.includes(activeLocale)` inside the component. Sidebar ads fan out instead:
 * buildInAppAdsFromSidebarAds emits ONE in-app ad per published locale, each carrying
 * `trigger.interfaceLang`, and Promotions filters with
 * `ad.trigger.interfaceLang === context.interfaceLang`. Same outcome for a reader, different code
 * path — so it needs its own coverage rather than being assumed from the banner/modal specs.
 *
 * Also see strapi-sidebar-ad.spec.js for the properties this surface shares: no showDelay (so
 * these tests never advance the clock, which keeps the co-published modal invisible), Promotions
 * rendering all matches rather than the first, and the /topics/category/<slug> route being used
 * because /topics/<slug> 404s without topic-pool data.
 *
 * REQUIRES A SANDBOX WITH DEBUG=True: this ad has `debug: true`, and showGivenDebugMode() hides
 * such ads unless context.isDebug, which comes from the server's Django DEBUG setting.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what these specs assert on (see e2e-tests/CLAUDE.md §3).
 *   So they intentionally use a bare page.goto plus routeFromHAR, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiHarFixture, expectStrapiServedFromHar } from '../support/strapi-har-fixture.js';
import {
  SCENARIOS,
  prepareStrapiPage,
  strapiResponseCount,
  waitForStrapiResponse,
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.publishedSidebarAdHebrewOnly;
const expected = scenario.expected.sidebarAd;

const sidebarAd = (page) => page.locator('.sidebarPromo', { hasText: expected.title });

test.describe('Strapi Sidebar Ad — Hebrew-only', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  for (const topic of expected.showsOnTopicCategories) {
    test(`shows on the ${topic} topic category page under Hebrew interface`, async ({ page }) => {
      await useInterfaceLanguage(page, LANGUAGES.HE);
      await page.goto(`/topics/category/${topic}`);
      await expectInterfaceLanguage(page, LANGUAGES.HE);

      await expect(sidebarAd(page)).toBeVisible();
      await expect(sidebarAd(page).locator('h3')).toHaveText(expected.title);
    });
  }

  test(`does not show on the ${expected.hiddenOnTopicCategory} topic category page`, async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.HE);
    const responsesBeforeNavigation = strapiResponseCount(page);
    await page.goto(`/topics/category/${expected.hiddenOnTopicCategory}`);
    await expectInterfaceLanguage(page, LANGUAGES.HE);

    // Prove the payload arrived and the hosting sidebar rendered, so "no ad" is attributable to
    // the '!social-issues' exclusion rather than to missing data or an unrendered page.
    await waitForStrapiResponse(page, responsesBeforeNavigation);
    await expect(page.locator('.navSidebar')).toBeVisible();

    await expect(page.locator('.sidebarPromo')).toHaveCount(0);
  });

  test('does not show under English interface on a matching topic', async ({ page }) => {
    // Same topic that renders the ad in Hebrew above, so the only difference is the interface
    // language — isolating trigger.interfaceLang as the reason for absence.
    await useInterfaceLanguage(page, LANGUAGES.EN);
    const responsesBeforeNavigation = strapiResponseCount(page);
    await page.goto(`/topics/category/${expected.showsOnTopicCategories[0]}`);
    await expectInterfaceLanguage(page, LANGUAGES.EN);

    await waitForStrapiResponse(page, responsesBeforeNavigation);
    await expect(page.locator('.navSidebar')).toBeVisible();

    await expect(page.locator('.sidebarPromo')).toHaveCount(0);
  });
});
