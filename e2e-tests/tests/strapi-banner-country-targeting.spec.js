/**
 * Playwright Tests: Strapi Banner — per-locale country targeting
 *
 * The banner document has both locales published with DIFFERENT targeting:
 *   en row → countryMode 'exclude', countries [US]
 *   he row → countryMode 'include', countries [IL]
 *
 * This covers the banner half of the localized-targeting change. `Banner.shouldShow()` is a
 * separate call site from `InterruptingMessage.shouldShow()`, and both read
 * `countriesToTarget?.[activeLocale]`; strapi-modal-country-targeting.spec.js covers the modal
 * path. It is also the only integration test exercising `exclude` mode.
 *
 * THE FIRST TWO TESTS ARE THE POINT. They use ONE viewer country (IL) for which the two locales
 * disagree — English hides it, Hebrew shows it. Under the pre-fix code, where the English row's
 * targeting governed every locale, both interfaces would have hidden the banner, so these two
 * assertions together are what distinguishes the fixed implementation from the broken one. A
 * viewer country for which the locales happen to agree could not tell them apart.
 *
 * INCLUDE AND EXCLUDE USE THE SAME PLAUSIBILITY RULE. One matching candidate is enough to include
 * a viewer in a targeted campaign and to withhold them from a campaign excluding that country.
 * The config's America/New_York timezone contributes 'us', while the header contributes 'il', so
 * this viewer has candidates {il, us}: the English exclude-US rule withholds the banner and the
 * Hebrew include-IL rule admits it.
 *
 * COUNTRY COMES FROM THE `cf-ipcountry` HEADER — see strapi-modal-country-targeting.spec.js for
 * why (PINNED_IPCOUNTRY makes every local viewer look British by default, and varying `timezoneId`
 * would change the derived date params and invalidate the recording).
 *
 * The recorded window also contains the modal and sidebar ad; both render alongside the banner and
 * are simply not asserted on here.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload and marks every modal_/banner_ localStorage key as already-seen — i.e. it suppresses
 *   exactly what these specs assert on (see e2e-tests/CLAUDE.md §3). So they intentionally use a
 *   bare page.goto plus routeFromHAR, keeping Strapi ON.
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
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.bannerCountryTargeted;
const expected = scenario.expected.banner;
const { discriminating, englishExcluded } = scenario.viewerCountries;

const banner = (page) => page.locator('#bannerMessage');

/** Load the library home in `lang`, having confirmed the interface actually applied. */
async function open(page, lang) {
  await useInterfaceLanguage(page, lang);
  const responsesBeforeNavigation = strapiResponseCount(page);
  await page.goto('/');
  await expectInterfaceLanguage(page, lang);
  await waitForStrapiResponse(page, responsesBeforeNavigation);
}

/** Assert the banner never appears, having first proved data arrived and time moved. */
async function expectBannerAbsent(page) {
  await advanceBy(page, expected.showDelaySeconds * 1000 * 5);
  await expect(banner(page)).toHaveCount(0);
}

/** Each block fixes the viewer's country; the tests inside vary only the interface language. */
function describeViewerIn(country, title, body) {
  test.describe(`Strapi Banner — per-locale targeting, viewer in ${country} (${title})`, () => {
    test.use({ extraHTTPHeaders: { 'cf-ipcountry': country } });

    let har;

    test.beforeEach(async ({ page, context }) => {
      har = await routeWithStrapiHarFixture(context, scenario.har);
      await prepareStrapiPage(page, scenario);
    });

    test.afterEach(() => {
      expectStrapiServedFromHar(har);
    });

    body();
  });
}

describeViewerIn(discriminating, 'the two locales disagree', () => {
  test('is hidden from an english viewer, who has a plausible country on the exclude-list', async ({ page }) => {
    await open(page, LANGUAGES.EN);
    await expectBannerAbsent(page);
  });

  test('is shown to a hebrew viewer, who has a plausible country on the include-list', async ({ page }) => {
    // Same viewer country as above; only the interface differs. This pair is what proves targeting
    // is read per locale rather than taken from the English row.
    await open(page, LANGUAGES.HE);
    await advanceUntilVisible(page, banner(page));
    await expect(banner(page)).toContainText(expected.byLocale[LANGUAGES.HE].bodyText);
  });
});

describeViewerIn(englishExcluded, "on the english locale's exclude-list", () => {
  test('is hidden from an english viewer', async ({ page }) => {
    // Every candidate signal for this viewer says US, so the exclude-list withholds the banner.
    await open(page, LANGUAGES.EN);
    await expectBannerAbsent(page);
  });
});
