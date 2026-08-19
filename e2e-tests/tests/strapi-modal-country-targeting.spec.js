/**
 * Playwright Tests: Strapi Modal — country targeting
 *
 * The modal document has both locales published with DIFFERENT `countriesToTarget`:
 *   en row → countryMode 'include', countries [GB]
 *   he row → countryMode 'all'
 *
 * RELATIONSHIP TO THE JEST TESTS — these are complementary, not duplicates.
 * `static/js/sefaria/tests/strapiTargeting.test.js` and `countryCandidates.test.js` already cover
 * the pure functions exhaustively: every countryMode, empty/null country lists, and how IP,
 * timezone and locale signals combine into the candidate set. What no unit test covers is the
 * CALL SITE — that Misc.jsx feeds `matchesCountryTarget` the right targeting object for the
 * document actually on screen. That is what these tests exercise, and it is how the merge
 * behaviour described below became visible at all.
 *
 * COUNTRY IS DRIVEN BY THE `cf-ipcountry` HEADER, NOT BY `timezoneId`.
 * candidateCountries() unions three signals — IP country, timezone, navigator.language — but the
 * IP one dominates locally: the middleware falls back to PINNED_IPCOUNTRY (set to "GB" in
 * local_settings.py) whenever the header is absent, so every viewer looks British by default and
 * timezone alone cannot produce a negative case. Sending the header overrides it per test.
 *
 * Varying `timezoneId` instead would break the fixture: the client converts to LOCAL midnight when
 * deriving start_date/end_date, so another timezone yields a different query string and the
 * recorded HAR stops matching. Holding the config's America/New_York default lets ONE recording
 * serve every case here.
 *
 * TARGETING IS PER LOCALE. `countriesToTarget` is in LOCALIZED_FIELDS, so each locale keeps its own
 * value through the per-document merge and `shouldShow()` reads the active locale's entry. That is
 * what makes the last test below meaningful: an English viewer outside the include-list is turned
 * away, while a Hebrew viewer in the same country still sees the modal, because the Hebrew row
 * targets everyone.
 *
 * This suite is what surfaced the original defect here — targeting used to be treated as a shared
 * field, so `rows[0]` (always the English row) governed both locales and the Hebrew value was
 * silently discarded.
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

const scenario = SCENARIOS.modalCountryTargeted;
const expected = scenario.expected.modal;
const { matching, nonMatching } = scenario.viewerCountries;

const modal = (page) => page.locator('#interruptingMessageBox');

/** Load the scenario page in `lang`, having proved this navigation received its HAR payload. */
async function open(page, lang) {
  await useInterfaceLanguage(page, lang);
  const responsesBeforeNavigation = strapiResponseCount(page);
  await page.goto(scenario.pagePath);
  await expectInterfaceLanguage(page, lang);
  await waitForStrapiResponse(page, responsesBeforeNavigation);
}

/** Assert the modal never appears, having first proved data arrived and time moved. */
async function expectModalAbsent(page) {
  await advanceBy(page, expected.showDelaySeconds * 1000 * 5);
  await expect(modal(page)).toHaveCount(0);
}

test.describe(`Strapi Modal — country targeting, viewer in ${matching} (matches include-list)`, () => {
  test.use({ extraHTTPHeaders: { 'cf-ipcountry': matching } });

  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  for (const lang of [LANGUAGES.EN, LANGUAGES.HE]) {
    test(`is shown to a ${lang} viewer`, async ({ page }) => {
      await open(page, lang);

      await advanceUntilVisible(page, modal(page));
      await expect(modal(page)).toContainText(expected.byLocale[lang].bodyText);
    });
  }
});

test.describe(`Strapi Modal — country targeting, viewer in ${nonMatching} (outside include-list)`, () => {
  test.use({ extraHTTPHeaders: { 'cf-ipcountry': nonMatching } });

  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  test('is hidden from an english viewer', async ({ page }) => {
    await open(page, LANGUAGES.EN);

    // The positive control is the matching-country describe above: the same recording DOES render
    // this modal for a GB viewer, so absence here is attributable to the include-list.
    await expectModalAbsent(page);
  });

  test('is still shown to a hebrew viewer, whose locale targets every country', async ({ page }) => {
    // Same viewer country as the test above; only the interface language differs. The Hebrew row
    // declares countryMode 'all', so it is unaffected by the English row's include-list.
    expect(expected.countriesToTargetByLocale.hebrew.countryMode).toBe('all');

    await open(page, LANGUAGES.HE);

    await advanceUntilVisible(page, modal(page));
    await expect(modal(page)).toContainText(expected.byLocale[LANGUAGES.HE].bodyText);
  });
});
