/**
 * Playwright Tests: Strapi Sidebar Ad — keyword targeting
 *
 * A single English sidebar ad whose Strapi `keywords` field is 'prayer, beliefs, !social-issues'.
 * buildInAppAdsFromSidebarAds splits that into keywordTargets ['prayer', 'beliefs'] and
 * excludeKeywordTargets ['social-issues']; Promotions.jsx matches those against
 * `context.keywordTargets`, which ReaderApp.getUserContext derives from the panel's topic or
 * topic category, lowercased. So the ad appears on the prayer and beliefs topic categories and is
 * suppressed on social-issues.
 *
 * WHY /topics/category/<slug> AND NOT /topics/<slug>:
 *   reader_views.topic_page 404s unless the topic is in the active module's pool, and pool
 *   membership lives in Postgres (django_topics) whose tables are empty on a stock local sandbox —
 *   so every individual topic page 404s locally. The category route has no such gate. Its main
 *   content is empty without pool data, but the sidebar still renders, which is all this spec
 *   needs: NavSidebar includes `{type: "Promo"}` unconditionally, and that is what hosts the ad.
 *
 * HOW SIDEBAR ADS DIFFER FROM BANNERS AND MODALS — three things shape these tests:
 *   1. No showDelay. Promotions renders as soon as the payload arrives, so these tests never
 *      advance the clock. That also keeps the co-published modal in the recording invisible, since
 *      its timer never fires — do not add advanceUntilVisible here without expecting it to appear.
 *   2. Promotions renders ALL matching ads, not just the first (unlike banners/modals, where
 *      context.js surfaces only one), so no isolation concerns between ads.
 *   3. On a topic category page the ad lives in NavSidebar's Promo module, so a "not shown"
 *      assertion must first wait for that sidebar to exist — otherwise it only means "the page
 *      had not rendered yet".
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

const scenario = SCENARIOS.publishedSidebarAd;
const expected = scenario.expected.sidebarAd;

const sidebarAd = (page) => page.locator('.sidebarPromo', { hasText: expected.title });

test.describe('Strapi Sidebar Ad — keyword targeting', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
    // The ad's locale is 'en', and Promotions requires trigger.interfaceLang === context
    // .interfaceLang. Set it explicitly so that dependency is visible rather than inherited.
    await useInterfaceLanguage(page, LANGUAGES.EN);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  for (const topic of expected.showsOnTopicCategories) {
    test(`shows on the ${topic} topic category page`, async ({ page }) => {
      await page.goto(`/topics/category/${topic}`);
      await expectInterfaceLanguage(page, LANGUAGES.EN);

      await expect(sidebarAd(page)).toBeVisible();
      await expect(sidebarAd(page).locator('h3')).toHaveText(expected.title);
    });
  }

  test(`does not show on the ${expected.hiddenOnTopicCategory} topic category page`, async ({ page }) => {
    await page.goto(`/topics/category/${expected.hiddenOnTopicCategory}`);
    await expectInterfaceLanguage(page, LANGUAGES.EN);

    // Prove the payload arrived — otherwise "no ad" could just mean "no data".
    await waitForStrapiResponse(page, strapiResponseCount(page) - 1);

    // Prove the sidebar that hosts the ad actually rendered — otherwise "no ad" would just mean
    // "no sidebar yet". The main content of this page is empty without topic-pool data; the
    // sidebar is unaffected.
    await expect(page.locator('.navSidebar')).toBeVisible();

    // The positive controls are the tests above: the same recording renders this ad on other
    // topics, so absence here is attributable to the '!social-issues' exclusion.
    await expect(page.locator('.sidebarPromo')).toHaveCount(0);
  });
});
