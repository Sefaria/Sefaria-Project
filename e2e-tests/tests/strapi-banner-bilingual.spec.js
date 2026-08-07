/**
 * Playwright Tests: Strapi Banner — both locales published
 *
 * One banner document with BOTH its English and Hebrew locales published. This exercises the merge
 * path the branch is built around: the two per-locale rows arrive as separate GraphQL results and
 * `groupByDocumentId` (static/js/sefaria/strapiLocalization.js) folds them into a single document
 * keyed by `documentId`, which `buildInterfaceTextDoc` reshapes into the {en, he} objects the
 * components read. Each interface language must then surface its own copy — text AND button.
 *
 * Two DOM facts drive the assertions here, and they differ from each other:
 *   - Banner TEXT goes through <InterfaceText>, which renders a SINGLE span for the active
 *     language (Misc.jsx). So the other locale's text is genuinely absent from the DOM and
 *     `toContainText` / `not.toContainText` are meaningful.
 *   - Banner BUTTONS are hardcoded as BOTH an `int-en` and an `int-he` anchor, with CSS hiding the
 *     inactive one. Both are always in the DOM, so those need visibility assertions — a text or
 *     count check would match the hidden anchor and prove nothing.
 *
 * Kept in its own file so it can be re-recorded in isolation: RECORD_HAR=1 rewrites the HAR of
 * every spec in the run, and the other banner scenarios' content is not currently published.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload and marks every modal_/banner_ localStorage key as already-seen — i.e. it suppresses
 *   exactly what these specs assert on (see e2e-tests/CLAUDE.md §3). So they intentionally use a
 *   bare page.goto plus routeFromHAR, keeping Strapi ON. Do NOT route them through PageManager.
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

const scenario = SCENARIOS.publishedBannerBothLocales;
const { byLocale } = scenario.expected.banner;

// The interface language each case runs under, and the locale whose copy must NOT appear.
const CASES = [
  { lang: LANGUAGES.EN, anchor: 'int-en', otherAnchor: 'int-he', other: LANGUAGES.HE },
  { lang: LANGUAGES.HE, anchor: 'int-he', otherAnchor: 'int-en', other: LANGUAGES.EN },
];

test.describe('Strapi Banner — both locales published', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  for (const { lang, anchor, otherAnchor, other } of CASES) {
    test(`${lang} interface shows only its own locale's copy`, async ({ page }) => {
      await useInterfaceLanguage(page, lang);
      await page.goto('/');
      await expectInterfaceLanguage(page, lang);

      const banner = page.locator('#bannerMessage');
      await advanceUntilVisible(page, banner);

      // Text: InterfaceText emits one span, so the other locale's copy is absent, not just hidden.
      await expect(banner).toContainText(byLocale[lang].bodyText);
      await expect(banner).not.toContainText(byLocale[other].bodyText);

      // Button: both anchors exist; only this locale's is visible, and it carries this locale's
      // own href (the two locales point at different donation campaigns).
      const button = page.locator(`#bannerButtonBox a.${anchor}`);
      await expect(button).toBeVisible();
      await expect(button).toHaveText(byLocale[lang].buttonText);
      await expect(button).toHaveAttribute('href', byLocale[lang].buttonURL);

      await expect(page.locator(`#bannerButtonBox a.${otherAnchor}`)).toBeHidden();
    });
  }
});
