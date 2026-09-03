/**
 * Playwright Tests: Strapi Sidebar Ad — markdown body text
 *
 * The ad BODY renders markdown, matching banners and modals (all three flow through
 * InterfaceText's markdown path with the same Strapi newline handling). The TITLE stays plain,
 * like a banner/modal header — markdown syntax an editor types there must appear literally, not
 * formatted. Each test pins one side of that boundary.
 *
 * Synthetic payloads (the factory), navigated to /texts — markdown rendering doesn't depend on
 * the page, so the least-demanding page keeps these tests prerequisite-free.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it): bare page.goto
 * plus a synthetic Strapi route, on purpose — see e2e-tests/CLAUDE.md §3, §22.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { strapiPayload, sidebarAd, SYNTHETIC_NOW } from '../support/strapi-payload-factory.js';
import { prepareStrapiPage } from './strapi.fixtures.js';

const scenario = { pinnedNow: SYNTHETIC_NOW };

test.describe('Strapi Sidebar Ad — markdown', () => {
  let served;

  test.afterEach(() => {
    expectStrapiServed(served);
  });

  test('bold and link markdown in the body render as elements, not literal syntax', async ({ page, context }) => {
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({
        sidebarAds: [
          sidebarAd({
            shared: {
              title: 'Markdown Ad',
              bodyText: 'Support **Torah learning** — read [our impact report](https://www.sefaria.org/impact).',
            },
          }),
        ],
      }),
    );
    await prepareStrapiPage(page, scenario);

    await page.goto('/texts');

    const ad = page.locator('.sidebarPromo', { hasText: 'Markdown Ad' });
    await expect(ad).toBeVisible();
    // The markdown became elements…
    await expect(ad.locator('strong', { hasText: 'Torah learning' })).toBeVisible();
    await expect(ad.locator('a[href="https://www.sefaria.org/impact"]', { hasText: 'our impact report' })).toBeVisible();
    // …and the raw syntax is gone (asterisks or brackets surviving would mean the body was
    // rendered as plain text after all).
    await expect(ad).not.toContainText('**');
    await expect(ad).not.toContainText('](');
  });

  test('markdown syntax in the TITLE stays literal — titles are plain like banner/modal headers', async ({ page, context }) => {
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({
        sidebarAds: [sidebarAd({ shared: { title: 'A **bold** claim', bodyText: 'Plain body.' } })],
      }),
    );
    await prepareStrapiPage(page, scenario);

    await page.goto('/texts');

    const ad = page.locator('.sidebarPromo', { hasText: 'bold' });
    await expect(ad).toBeVisible();
    // The h3 shows the asterisks verbatim and contains no formatting element.
    await expect(ad.locator('h3')).toContainText('A **bold** claim');
    await expect(ad.locator('h3 strong')).toHaveCount(0);
  });
});
