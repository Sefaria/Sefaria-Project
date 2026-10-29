/**
 * Playwright Tests: Strapi Sidebar Ad — background color
 *
 * `sidebarAdBackgroundColor` replaced the old hasBlueBackground boolean (2026-09-15). It mirrors
 * the banner's bannerBackgroundColor — a hex string applied as an inline background — with one
 * sidebar-specific rule: the "colored treatment" (padding, white title/body, white button with
 * text in the ad's color) applies only when the color is DARK. A WHITISH color keeps the ad's
 * default styling, so a light tint reads exactly like an uncolored ad. Each test pins one of the
 * three states; the dark case uses #004E5F — the old blue — so entering that value reproduces
 * the retired hasBlueBackground look.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it): bare page.goto
 * plus a synthetic Strapi route, on purpose — see e2e-tests/CLAUDE.md §3, §22.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { strapiPayload, sidebarAd, SYNTHETIC_NOW } from '../support/strapi-payload-factory.js';
import { prepareStrapiPage } from './strapi.fixtures.js';

const scenario = { pinnedNow: SYNTHETIC_NOW };

const adWithBackground = (title, sidebarAdBackgroundColor) =>
  sidebarAd({ shared: { title, sidebarAdBackgroundColor } });

test.describe('Strapi Sidebar Ad — background color', () => {
  let served;

  test.afterEach(() => {
    expectStrapiServed(served);
  });

  test('a dark color gets the full colored treatment — the old blue look, from the editor\'s color', async ({ page, context }) => {
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({ sidebarAds: [adWithBackground('Dark Ad', '#004E5F')] }),
    );
    await prepareStrapiPage(page, scenario);
    await page.goto('/texts');

    const ad = page.locator('.sidebarPromo', { hasText: 'Dark Ad' });
    await expect(ad).toBeVisible();
    // The editor's color arrives as the inline background…
    await expect(ad).toHaveCSS('background-color', 'rgb(0, 78, 95)');
    // …and the dark-background treatment flips the title to white and the button's text to the
    // ad's own color (the generalized white-button-blue-text of the old blue ads).
    await expect(ad).toHaveClass(/colored/);
    await expect(ad.locator('h3')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(ad.locator('a.button')).toHaveCSS('color', 'rgb(0, 78, 95)');
  });

  test('a whitish color keeps the default styling — a light tint must read like an uncolored ad', async ({ page, context }) => {
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({ sidebarAds: [adWithBackground('Light Ad', '#F8F8F8')] }),
    );
    await prepareStrapiPage(page, scenario);
    await page.goto('/texts');

    const ad = page.locator('.sidebarPromo', { hasText: 'Light Ad' });
    await expect(ad).toBeVisible();
    // The tint itself renders…
    await expect(ad).toHaveCSS('background-color', 'rgb(248, 248, 248)');
    // …but nothing else changes: no colored class, and the title keeps its default (dark) color.
    await expect(ad).not.toHaveClass(/colored/);
    await expect(ad.locator('h3')).not.toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('no color means no inline background and no treatment — the pre-field default', async ({ page, context }) => {
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({ sidebarAds: [sidebarAd({ shared: { title: 'Plain Ad' } })] }),
    );
    await prepareStrapiPage(page, scenario);
    await page.goto('/texts');

    const ad = page.locator('.sidebarPromo', { hasText: 'Plain Ad' });
    await expect(ad).toBeVisible();
    await expect(ad).not.toHaveClass(/colored/);
    // Transparent = no inline background was applied.
    await expect(ad).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });
});
