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

  test('a markdown image in the body renders, loads, and sits centered on its own line', async ({ page, context }) => {
    // The image is a real static asset served by Django, so "renders properly" can mean LOADED
    // (naturalWidth > 0), not merely "an <img> tag exists" — a broken src would pass a tag-only
    // check. Layout: body images get display:block + auto margins (s2.css .sidebarPromo p img),
    // so they sit on their own line, centered; the button's inline icon is deliberately not
    // affected by that rule.
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({
        sidebarAds: [
          sidebarAd({
            shared: {
              title: 'Image Ad',
              bodyText: 'Before the image.\n\n![Sefaria logo](/static/img/logo.png)\n\nAfter the image.',
            },
          }),
        ],
      }),
    );
    await prepareStrapiPage(page, scenario);

    await page.goto('/texts');

    const ad = page.locator('.sidebarPromo', { hasText: 'Image Ad' });
    await expect(ad).toBeVisible();

    const image = ad.locator('p img[alt="Sefaria logo"]');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', '/static/img/logo.png');

    // Loaded, not just present: naturalWidth is 0 for a broken image.
    await expect.poll(() => image.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);

    // Own line: block display separates it from the surrounding text.
    expect(await image.evaluate((el) => getComputedStyle(el).display)).toBe('block');

    // Centered: equal gaps to its paragraph's content edges (1px tolerance for rounding).
    const gaps = await image.evaluate((el) => {
      const imageBox = el.getBoundingClientRect();
      const paragraph = el.closest('p').getBoundingClientRect();
      return { left: imageBox.left - paragraph.left, right: paragraph.right - imageBox.right };
    });
    expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(1);

    // And the text around it survived the markdown round-trip.
    await expect(ad).toContainText('Before the image.');
    await expect(ad).toContainText('After the image.');
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
