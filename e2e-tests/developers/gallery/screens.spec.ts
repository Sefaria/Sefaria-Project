import { test, expect } from '@playwright/test';
import { GALLERY_PROJECTS } from '../../pages/developers/developersGalleryPage';
import { DESCRIBE, enterGallery, featureThree } from './gallery-entry';

// Ported from Sefaria/powered-by e2e/screenshots.spec.ts. That file wrote screenshots to disk only with
// SCREENSHOTS=1; here every screen is reached, checked for horizontal overflow, and its screenshot is attached
// to the test report (no files written, no skip). Pixel comparison with live is the separate V-pixel loop.
const THREE = featureThree([GALLERY_PROJECTS.todaysDaf, GALLERY_PROJECTS.talmudNavigator, GALLERY_PROJECTS.torahMcp]);

for (const width of [360, 390, 768, 1024, 1440]) {
  test.describe(`${DESCRIBE} (screens at ${width}px)`, () => {
    test.use({ viewport: { width, height: width >= 1024 ? 900 : 844 } });

    test(`DEV-GAL-090: browse grid (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context);
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      expect(await gallery.horizontalOverflow()).toBeLessThanOrEqual(0);
      await testInfo.attach(`browse-grid-${width}`, { body: await gallery.screenshot(true), contentType: 'image/png' });
    });

    test(`DEV-GAL-091: browse list (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, '/powered-by?view=list');
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      expect(await gallery.currentView()).toBe('list');
      expect(await gallery.horizontalOverflow()).toBeLessThanOrEqual(0);
      await testInfo.attach(`browse-list-${width}`, { body: await gallery.screenshot(true), contentType: 'image/png' });
    });

    test(`DEV-GAL-092: filters, the sidebar from 1024px and the sheet below (${width}px)`, async ({
      context,
    }, testInfo) => {
      const { page, pm } = await enterGallery(context);
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      if (width >= 1024) {
        await gallery.scrollToBrowse();
        await gallery.toggleFilter('Category', 'AI & Apps');
        await expect(page).toHaveURL(/category=ai/);
        await gallery.scrollToBrowse();
      } else {
        await gallery.openFilterSheet();
        expect(await gallery.isFilterSheetOpen()).toBe(true);
      }
      await testInfo.attach(`filters-${width}`, { body: await gallery.screenshot(false), contentType: 'image/png' });
    });

    test(`DEV-GAL-093: project page (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, `/powered-by/projects/${GALLERY_PROJECTS.torahMcp}`);
      const gallery = pm.onDevelopersGallery();
      expect(await gallery.projectTitle()).toBe('Torah MCP');
      expect(await gallery.horizontalOverflow()).toBeLessThanOrEqual(0);
      await testInfo.attach(`project-page-${width}`, {
        body: await gallery.screenshot(false),
        contentType: 'image/png',
      });
    });

    test(`DEV-GAL-094: empty state (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, '/powered-by?q=zzzzzz');
      const gallery = pm.onDevelopersGallery();
      expect(await gallery.waitForEmptyState()).toBe('No projects match that search.');
      await gallery.scrollToBrowse();
      await testInfo.attach(`empty-${width}`, { body: await gallery.screenshot(false), contentType: 'image/png' });
    });

    test(`DEV-GAL-095: charts (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, '/powered-by/charts');
      const gallery = pm.onDevelopersGallery();
      expect(await gallery.chartCount()).toBe(8);
      expect(await gallery.horizontalOverflow()).toBeLessThanOrEqual(0);
      await testInfo.attach(`charts-${width}`, { body: await gallery.screenshot(true), contentType: 'image/png' });
    });

    test(`DEV-GAL-096: the gallery bar (was the header menu) (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context);
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      const submit = await gallery.submitProjectLabel();
      expect(submit.visibleText).toBe(width >= 721 ? 'Submit a project' : 'Submit');
      expect((await gallery.donateLink()).opensInNewTab).toBe(true);
      await testInfo.attach(`gallery-bar-${width}`, {
        body: await gallery.screenshot(false),
        contentType: 'image/png',
      });
    });
  });
}

for (const width of [1440, 390]) {
  test.describe(`${DESCRIBE} (revision 2 screens at ${width}px)`, () => {
    const desktop = width >= 1024;
    test.use({ viewport: { width, height: desktop ? 900 : 844 } });

    test(`DEV-GAL-097: featured band (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, '/powered-by', THREE);
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      expect(await gallery.featuredCards()).toHaveLength(3);
      await testInfo.attach(`featured-${width}`, { body: await gallery.screenshot(false), contentType: 'image/png' });
    });

    test(`DEV-GAL-098: mixed category icon colors (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context);
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      await gallery.scrollToBrowse();
      expect((await gallery.projectCards()).length).toBe(24);
      await testInfo.attach(`icon-colors-${width}`, {
        body: await gallery.screenshot(false),
        contentType: 'image/png',
      });
    });

    test(`DEV-GAL-099: expanded filters (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, '/powered-by?topic=Gemara');
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      if (!desktop) await gallery.openFilterSheet();
      for (const facet of ['Language', 'Sefaria resources', 'Built with'] as const) {
        await gallery.openFilterSection(facet);
        expect(await gallery.isFilterSectionOpen(facet)).toBe(true);
      }
      if (desktop) await gallery.scrollToBrowse();
      await testInfo.attach(`filters-expanded-${width}`, {
        body: await gallery.screenshot(false),
        contentType: 'image/png',
      });
    });

    test(`DEV-GAL-100: a known-issues project, card and page (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, '/powered-by?bugs=1&q=Daf+Quiz');
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      expect((await gallery.projectCards()).map((c) => c.title)).toContain('Daf Quiz');
      await gallery.scrollToBrowse();
      await testInfo.attach(`known-issues-card-${width}`, {
        body: await gallery.screenshot(false),
        contentType: 'image/png',
      });
      await gallery.open(`/powered-by/projects/${GALLERY_PROJECTS.dafQuiz}`);
      await expect.poll(() => gallery.knownIssuesNotice()).not.toBeNull();
      await testInfo.attach(`known-issues-page-${width}`, {
        body: await gallery.screenshot(false),
        contentType: 'image/png',
      });
    });
  });
}

for (const width of [1280, 834, 390]) {
  test.describe(`${DESCRIBE} (project page screens at ${width}px)`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test(`DEV-GAL-101: project page and known-issues page (${width}px)`, async ({ context }, testInfo) => {
      const { pm } = await enterGallery(context, `/powered-by/projects/${GALLERY_PROJECTS.torahMcp}`);
      const gallery = pm.onDevelopersGallery();
      expect(await gallery.projectTitle()).toBe('Torah MCP');
      await testInfo.attach(`page-${width}`, {
        body: await gallery.screenshot(width !== 390),
        contentType: 'image/png',
      });
      await gallery.open(`/powered-by/projects/${GALLERY_PROJECTS.dafQuiz}`);
      await expect.poll(() => gallery.knownIssuesNotice()).not.toBeNull();
      await testInfo.attach(`page-known-issues-${width}`, {
        body: await gallery.screenshot(false),
        contentType: 'image/png',
      });
    });
  });
}
