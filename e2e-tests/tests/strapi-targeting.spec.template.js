/**
 * Playwright Tests: Strapi Targeting & Date States
 *
 * Two orthogonal gates, driven without any mocking of application code:
 *   - Country targeting: getViewerCountryCandidates() derives the viewer's plausible countries
 *     from Intl.DateTimeFormat().resolvedOptions().timeZone (countryCandidates.js). So Playwright's
 *     `timezoneId` context option IS the country lever. A modal that INCLUDE-targets the US shows
 *     for a US timezone and is hidden for a non-US timezone.
 *   - Date window: content whose [start, end] window does not contain the pinned "now" is fetched
 *     but not rendered. Asserted on sidebar ads (Promotions renders all matches, then filters by
 *     context.dt ∈ [start, end]) so an active ad and an expired ad can be checked in one fixture.
 *
 * See ./strapi.fixtures.js for the recording workflow and the values to fill in. Like the
 * localization spec, these deliberately bypass goToPageWithLang (which suppresses Strapi — see
 * e2e-tests/CLAUDE.md §3) and drive Strapi ON via routeFromHAR.
 *
 * Prerequisite for the modal to be eligible at all: record it as showTo "logged_out_only" (or
 * "both..."), with a date window containing PINNED_NOW and an `en` locale (these specs run English UI).
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiHarFixture } from '../support/strapi-har-fixture.js';
import {
  STRAPI_HAR,
  EXPECTED,
  prepareStrapiPage,
  setInterfaceLanguage,
} from './strapi.fixtures.js';

test.describe('Strapi targeting — country (via timezone)', () => {
  test.beforeEach(async ({ page, context }) => {
    await routeWithStrapiHarFixture(context, STRAPI_HAR);
    await prepareStrapiPage(page);
  });

  test.describe('US viewer (matching timezone)', () => {
    test.use({ timezoneId: EXPECTED.usTargetedModal.matchingTimezone });

    test('US-targeted modal is shown', async ({ page }) => {
      await setInterfaceLanguage(page, 'english');
      await expect(
        page.locator('#interruptingMessageBox h1.int-en', {
          hasText: EXPECTED.usTargetedModal.enHeader,
        }),
      ).toBeVisible();
    });
  });

  test.describe('non-US viewer (non-matching timezone)', () => {
    test.use({ timezoneId: EXPECTED.usTargetedModal.nonMatchingTimezone });

    test('US-targeted modal is hidden', async ({ page }) => {
      await setInterfaceLanguage(page, 'english');
      // Give the modal's showDelay timer a chance to fire; assert it never appears.
      await expect(page.locator('#interruptingMessageBox')).toHaveCount(0);
    });
  });
});

test.describe('Strapi date states — sidebar ads', () => {
  test.beforeEach(async ({ page, context }) => {
    await routeWithStrapiHarFixture(context, STRAPI_HAR);
    await prepareStrapiPage(page);
  });

  test('active ad renders and expired ad does not', async ({ page }) => {
    const activeAd = page.locator('.sidebarPromo h3', { hasText: EXPECTED.datedAds.active.enTitle });
    const expiredAd = page.locator('.sidebarPromo h3', { hasText: EXPECTED.datedAds.expired.enTitle });

    await setInterfaceLanguage(page, 'english');
    await page.goto(EXPECTED.datedAds.pagePath);

    await expect(activeAd).toBeVisible();
    await expect(expiredAd).toHaveCount(0);
  });
});
