/**
 * Playwright Tests: Strapi Sidebar Ad — both locales published
 *
 * The same sidebar-ad document with both locales published, completing the surface × locale grid.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE BILINGUAL BANNER AND MODAL SPECS:
 * those merge their two per-locale rows into ONE document that the component reads per locale.
 * Sidebar ads fan out — buildInAppAdsFromSidebarAds produces TWO in-app ads, one per locale, and
 * Promotions filters them at match time on `trigger.interfaceLang`. Both carry the SAME
 * `internalCampaignId`, which Promotions passes as the React `key`, so a filter that stopped
 * discriminating would render two elements sharing a key rather than simply showing the wrong
 * text. That is why each test below asserts exactly ONE ad is present, not just that the right
 * title appears.
 *
 * Unlike banner buttons — which are hardcoded as both an int-en and an int-he anchor and hidden by
 * CSS — only the matching ad is rendered at all here, so the other locale's copy is genuinely
 * absent from the DOM and count assertions are meaningful.
 *
 * See strapi-sidebar-ad.spec.js for the properties shared across this surface: no showDelay (so
 * these tests never advance the clock, keeping the co-published modal invisible), keyword
 * targeting, the /topics/category/<slug> route, and the DEBUG=True requirement.
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
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.publishedSidebarAdBothLocales;
const expected = scenario.expected.sidebarAd;
const { byLocale } = expected;

const CASES = [
  { lang: LANGUAGES.EN, other: LANGUAGES.HE },
  { lang: LANGUAGES.HE, other: LANGUAGES.EN },
];

const topic = expected.showsOnTopicCategories[0];

test.describe('Strapi Sidebar Ad — both locales published', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  for (const { lang, other } of CASES) {
    test(`${lang} interface renders only its own locale's ad`, async ({ page }) => {
      await useInterfaceLanguage(page, lang);
      await page.goto(`/topics/category/${topic}`);
      await expectInterfaceLanguage(page, lang);

      const ad = page.locator('.sidebarPromo');
      await expect(ad).toBeVisible();

      // Exactly one — both locales' ads exist in Sefaria._inAppAds and share a campaignId, so a
      // filter that stopped discriminating would render two.
      await expect(ad).toHaveCount(1);

      await expect(ad.locator('h3')).toHaveText(byLocale[lang].title);
      await expect(ad).toContainText(byLocale[lang].buttonText);

      // Only the matching ad is rendered, so the other locale's copy is absent, not merely hidden.
      await expect(page.getByText(byLocale[other].title)).toHaveCount(0);
    });
  }
});
