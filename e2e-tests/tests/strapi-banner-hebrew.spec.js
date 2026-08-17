/**
 * Playwright Tests: Strapi Banner — Hebrew-only locale separation
 *
 * The banner document has ONLY its Hebrew locale published. This is the behavior this branch
 * exists for: single-locale content reaches the client on its own, rather than being discoverable
 * only when an English version also exists — and it renders only under the matching interface
 * language.
 *
 * Both directions come from ONE recording. The GraphQL query always requests every locale, so the
 * request is byte-identical regardless of interface language; only the client-side locale gate
 * (`banner.locales.includes(...)` in Misc.jsx) differs.
 *
 * Kept in its own file rather than added to strapi-banner.spec.js so it can be re-recorded in
 * isolation: RECORD_HAR=1 rewrites the HAR of every spec in the run, and the English-only banner
 * is no longer published in Strapi — re-recording that spec today would overwrite its fixture with
 * an empty payload.
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
  advanceBy,
  strapiResponseCount,
  waitForStrapiResponse,
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.publishedBannerHebrewOnly;

test.describe('Strapi Banner — Hebrew-only', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  test('renders under Hebrew interface', async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.HE);
    await page.goto('/');
    await expectInterfaceLanguage(page, LANGUAGES.HE);

    const banner = page.locator('#bannerMessage');
    await advanceUntilVisible(page, banner);

    await expect(banner).toContainText(scenario.expected.banner.bodyText);
  });

  test('renders the Hebrew locale button', async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.HE);
    await page.goto('/');
    await expectInterfaceLanguage(page, LANGUAGES.HE);

    await advanceUntilVisible(page, page.locator('#bannerMessage'));

    // The component always renders both an int-en and an int-he anchor and lets CSS show the one
    // matching the interface. Target int-he explicitly: this document has no English locale, so
    // the int-en anchor is present but empty and hrefless.
    const button = page.locator('#bannerButtonBox a.int-he');
    await expect(button).toHaveText(scenario.expected.banner.buttonText);
    await expect(button).toHaveAttribute('href', scenario.expected.banner.buttonURL);
  });

  test('does not render under English interface', async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.EN);
    const responsesBeforeNavigation = strapiResponseCount(page);
    await page.goto('/');
    // Assert the interface really is English — otherwise the absence below proves nothing.
    await expectInterfaceLanguage(page, LANGUAGES.EN);

    // Prove the Hebrew-only payload was delivered, so "no banner" means the locale gate rejected
    // it rather than that no data arrived.
    await waitForStrapiResponse(page, responsesBeforeNavigation);

    // Advance well past the showDelay. The positive control for this assertion is the sibling
    // test above: the same recording DOES render this banner under Hebrew, so absence here is
    // attributable to the locale gate and not to a broken fixture or a stalled clock.
    await advanceBy(page, scenario.expected.banner.showDelaySeconds * 1000 * 5);
    await expect(page.locator('#bannerMessage')).toHaveCount(0);
  });
});
