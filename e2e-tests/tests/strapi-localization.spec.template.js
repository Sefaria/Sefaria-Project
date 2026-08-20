/**
 * Playwright Tests: Strapi Localization — Locale Separation
 *
 * Exercises this branch's headline behavior: Strapi content authored in a single locale now
 * flows to the client independently and renders only under the matching interface language.
 *   - A Hebrew-only banner renders under Hebrew UI and is absent under English UI.
 *   - A Hebrew-only sidebar ad renders under Hebrew UI only; an English-only ad under English only.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which deliberately short-circuits /api/strapi/graphql-cache with
 *   an empty payload and marks every modal_/banner_ localStorage key as seen — i.e. it KILLS the
 *   very content under test here (see e2e-tests/CLAUDE.md §3). So these specs intentionally use
 *   bare page.goto + routeFromHAR to keep Strapi ON, mirroring the newsletter suite's HAR specs.
 *   Do NOT route these through PageManager / goToPageWithLang.
 *
 * The responses are replayed from e2e-tests/fixtures/strapi-content.har; fill in the expected
 * content in ./strapi.fixtures.js to match what you recorded. See that file for the record command.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiHarFixture } from '../support/strapi-har-fixture.js';
import {
  STRAPI_HAR,
  EXPECTED,
  prepareStrapiPage,
  setInterfaceLanguage,
} from './strapi.fixtures.js';

test.describe('Strapi Localization — locale separation', () => {
  test.beforeEach(async ({ page, context }) => {
    await routeWithStrapiHarFixture(context, STRAPI_HAR);
    await prepareStrapiPage(page);
  });

  test('Hebrew-only banner renders under Hebrew UI and is absent under English UI', async ({ page }) => {
    const heBanner = page.locator('#bannerMessage', { hasText: EXPECTED.hebrewOnlyBanner.heText });

    // Hebrew UI: the Hebrew-only banner appears (after its showDelay timer elapses).
    await setInterfaceLanguage(page, 'hebrew');
    await expect(heBanner).toBeVisible();

    // English UI: the same Hebrew-only banner must NOT appear — locale filter excludes it.
    await setInterfaceLanguage(page, 'english');
    await expect(page.locator('#bannerMessage')).toHaveCount(0);
  });

  test('sidebar ads render only under their own locale', async ({ page }) => {
    const heAd = page.locator('.sidebarPromo h3', { hasText: EXPECTED.sidebarAds.hebrewOnly.heTitle });
    const enAd = page.locator('.sidebarPromo h3', { hasText: EXPECTED.sidebarAds.englishOnly.enTitle });

    // English UI: only the English-only ad shows.
    await setInterfaceLanguage(page, 'english');
    await page.goto(EXPECTED.sidebarAds.adPagePath);
    await expect(enAd).toBeVisible();
    await expect(heAd).toHaveCount(0);

    // Hebrew UI: only the Hebrew-only ad shows.
    await setInterfaceLanguage(page, 'hebrew');
    await page.goto(EXPECTED.sidebarAds.adPagePath);
    await expect(heAd).toBeVisible();
    await expect(enAd).toHaveCount(0);
  });
});
