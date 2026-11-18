import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../../pages/pageManager';
import { DESCRIBE, enterGallery } from './gallery-entry';

// Ported from Sefaria/powered-by e2e/charts.spec.ts: the unlisted /powered-by/charts page.
test.describe(DESCRIBE, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterGallery(context, '/powered-by/charts'));
  });

  test('DEV-GAL-060: the charts page draws all 8 charts, is noindex, and is not linked from the gallery', async () => {
    const gallery = pm.onDevelopersGallery();
    expect(await gallery.chartCount()).toBe(8);
    expect(await gallery.chartTableToggleCount()).toBe(8);
    expect(await gallery.robotsMeta()).toBe('noindex, nofollow');
    await expect(page).toHaveTitle('Powered by Sefaria in numbers');
    // the line and bar charts really drew something
    expect(await gallery.chartsDrawn()).toBe(true);

    await gallery.open('/powered-by');
    await gallery.waitForProjects();
    expect(await gallery.linksTo('charts')).toBe(0);
  });

  test('DEV-GAL-061: the table alternative shows the same numbers', async () => {
    const rows = await pm.onDevelopersGallery().chartTableByTitle('Submissions by year');
    expect(rows).toContainEqual(['2026', '58']);
  });

  test('DEV-GAL-062: the charts page has no horizontal page scroll and no axe violations', async () => {
    const gallery = pm.onDevelopersGallery();
    expect(await gallery.chartCount()).toBe(8);
    expect(await gallery.horizontalOverflow()).toBeLessThanOrEqual(0);
    expect(await gallery.axeViolations()).toEqual([]);
  });
});
