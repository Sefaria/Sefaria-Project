import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { GALLERY_PROJECTS } from '../../pages/developers/developersGalleryPage';
import { DESCRIBE, enterGallery, featureThree, MOBILE_VIEWPORT } from './gallery-entry';

// Ported from Sefaria/powered-by e2e/featured.spec.ts. The snapshot has no featured project (as in production
// when it was taken); the tests feature three by changing the served rows.
const THREE = featureThree([GALLERY_PROJECTS.todaysDaf, GALLERY_PROJECTS.talmudNavigator, GALLERY_PROJECTS.torahMcp]);

test.describe(DESCRIBE, () => {
  let page: Page;
  let pm: PageManager;

  test('DEV-GAL-040: the featured band is absent while no project is featured', async ({ context }) => {
    ({ page, pm } = await enterGallery(context));
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.featuredBandHeading()).toBeNull();
    expect(await gallery.featuredCards()).toEqual([]);
  });

  test('DEV-GAL-041: clicking the "Made with" tag opens the project like the rest of the card', async ({ context }) => {
    ({ page, pm } = await enterGallery(context, '/powered-by', THREE));
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    await gallery.clickFeaturedMadeWith();
    await expect(page).toHaveURL(/\/powered-by\/projects\/\d+-/, { timeout: t(10000) });
  });

  test('DEV-GAL-042: up to 3 featured projects, newest first, between the hero and the browse area', async ({
    context,
  }) => {
    ({ page, pm } = await enterGallery(context, '/powered-by', THREE));
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.featuredBandHeading()).toEqual({ heading: 'Featured Projects', subtitle: true });
    expect((await gallery.featuredCards()).map((c) => c.title)).toEqual([
      "Today's Daf (daf-yomi.dev)",
      'Talmud Navigator',
      'Torah MCP',
    ]);
    // no tags on featured cards, and the band sits above "Browse projects"
    expect(await gallery.featuredTagRowCount()).toBe(0);
    expect(await gallery.isFeaturedAboveBrowse()).toBe(true);
  });

  test('DEV-GAL-044: opening a featured card shows the project page, and Back returns to the band', async ({
    context,
  }) => {
    ({ page, pm } = await enterGallery(context, '/powered-by', THREE));
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    await gallery.openFeatured('Talmud Navigator');
    await expect(page).toHaveURL(
      new RegExp(`/powered-by/projects/${GALLERY_PROJECTS.talmudNavigator}-talmud-navigator`),
      { timeout: t(10000) }
    );
    expect(await gallery.projectTitle()).toBe('Talmud Navigator');
    await gallery.goBack();
    await expect.poll(async () => (await gallery.featuredCards()).length, { timeout: t(10000) }).toBe(3);
  });

  test('DEV-GAL-045: never features a buggy project, even when known issues are shown', async ({ context }) => {
    ({ page, pm } = await enterGallery(context, '/powered-by', (rows) => {
      THREE(rows);
      for (const row of rows) {
        if (row.id === GALLERY_PROJECTS.dafQuiz)
          Object.assign(row, { featured: true, submission_date: '2026-10-01T00:00:00Z' });
      }
    }));
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.featuredCards()).toHaveLength(3);
    expect(await gallery.featuredBandContains('Daf Quiz')).toBe(false);

    await gallery.open('/powered-by?bugs=1');
    await gallery.waitForProjects();
    expect(await gallery.featuredCards()).toHaveLength(3);
    expect(await gallery.featuredBandContains('Daf Quiz')).toBe(false);
  });

  test('DEV-GAL-046: the band ignores search and filters', async ({ context }) => {
    ({ page, pm } = await enterGallery(context, '/powered-by?q=zzzzzz', THREE));
    const gallery = pm.onDevelopersGallery();
    expect(await gallery.waitForEmptyState()).toBe('No projects match that search.');
    expect(await gallery.featuredCards()).toHaveLength(3);
  });

  test('DEV-GAL-047: no axe violations with the band showing', async ({ context }) => {
    ({ page, pm } = await enterGallery(context, '/powered-by', THREE));
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.featuredCards()).toHaveLength(3);
    expect(await gallery.axeViolations()).toEqual([]);
  });

  test('DEV-GAL-048: a known-issues project flagged featured alone leaves no band', async ({ context }) => {
    // From e2e/project-page.spec.ts ("featured band" describe).
    ({ page, pm } = await enterGallery(context, '/powered-by?bugs=1', (rows) => {
      for (const row of rows) if (row.id === GALLERY_PROJECTS.dafQuiz) row.featured = true;
    }));
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.featuredBandHeading()).toBeNull();
  });
});

for (const layout of [
  { name: 'grid', mobile: false, viewport: { width: 1440, height: 900 } },
  { name: 'scroll-snap row', mobile: true, viewport: MOBILE_VIEWPORT },
] as const) {
  test.describe(`${DESCRIBE} (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });

    test(`DEV-GAL-043: the band is a 3-column grid from 900px and a scroll-snap row below (${layout.name})`, async ({
      context,
    }) => {
      const { pm } = await enterGallery(context, '/powered-by', THREE);
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      const { cards, scrollRegion } = await gallery.featuredLayout();
      expect(cards).toHaveLength(3);
      const [first, second, third] = cards as [(typeof cards)[0], (typeof cards)[0], (typeof cards)[0]];
      if (layout.mobile) {
        expect(scrollRegion).not.toBeNull();
        expect(scrollRegion!.tabIndex).toBe('0');
        expect(scrollRegion!.scrollSnapType).toMatch(/x mandatory/);
        // the next card peeks in, and the third is off-screen until scrolled
        expect(first.width).toBe(300);
        expect(second.x).toBeLessThan(layout.viewport.width);
        expect(third.x).toBeGreaterThanOrEqual(layout.viewport.width);
        expect(scrollRegion!.overflows).toBe(true);
      } else {
        expect(scrollRegion).toBeNull();
        expect(Math.abs(first.y - second.y)).toBeLessThan(1);
        expect(Math.abs(second.y - third.y)).toBeLessThan(1);
        expect(Math.abs(first.width - second.width)).toBeLessThan(1);
        expect(Math.abs(second.width - third.width)).toBeLessThan(1);
      }
    });
  });
}
