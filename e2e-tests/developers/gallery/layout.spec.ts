import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../../pages/pageManager';
import { GALLERY_PROJECTS, richGalleryProject } from '../../pages/developers/developersGalleryPage';
import { DESCRIBE, enterGallery, featureThree, MOBILE_VIEWPORT } from './gallery-entry';

// Ported from Sefaria/powered-by e2e/layout.spec.ts. The gallery's own header became the portal header
// (PLAN §2.14 item 5): its "Submit a project" and "Donate" moved into the gallery's bar, which the
// DEV-GAL-078..082 checks now measure. The portal header's own menu is covered by DEV-HDR.
const FORM = 'https://sefaria.formstack.com/forms/powered_by_sefaria_submission_form';
const THREE = featureThree([GALLERY_PROJECTS.todaysDaf, GALLERY_PROJECTS.talmudNavigator, GALLERY_PROJECTS.torahMcp]);

const LAYOUTS = [
  { name: 'desktop', mobile: false, viewport: { width: 1440, height: 900 } },
  { name: '390px', mobile: true, viewport: MOBILE_VIEWPORT },
] as const;

for (const layout of LAYOUTS) {
  test.describe(`${DESCRIBE} (touch targets, ${layout.name})`, () => {
    test.use({ viewport: layout.viewport });

    test(`DEV-GAL-070: browse grid, list and the whole page, scrolled through, have 44x44 targets (${layout.name})`, async ({
      context,
    }) => {
      const { pm } = await enterGallery(context);
      const gallery = pm.onDevelopersGallery();
      for (const path of ['/powered-by', '/powered-by?view=list']) {
        await gallery.open(path);
        await gallery.waitForProjects();
        expect(await gallery.smallTouchTargetsWhileScrolling()).toEqual([]);
      }
    });

    test(`DEV-GAL-071: the project page and the filter sheet have 44x44 targets (${layout.name})`, async ({
      context,
    }) => {
      const { pm } = await enterGallery(context, `/powered-by/projects/${richGalleryProject().id}`);
      const gallery = pm.onDevelopersGallery();
      await gallery.projectTitle();
      expect(await gallery.smallTouchTargets()).toEqual([]);

      await gallery.open('/powered-by');
      await gallery.waitForProjects();
      if (layout.mobile) {
        await gallery.openFilterSheet();
        expect(await gallery.smallTouchTargets()).toEqual([]);
        await gallery.closeFilterSheet();
      }
      expect(await gallery.smallTouchTargets()).toEqual([]);
    });

    test(`DEV-GAL-072: the featured band and every expanded filter section have 44x44 targets (${layout.name})`, async ({
      context,
    }) => {
      const { pm } = await enterGallery(context, '/powered-by', THREE);
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      expect(await gallery.smallTouchTargetsWhileScrolling()).toEqual([]);
      if (layout.mobile) await gallery.openFilterSheet();
      await gallery.expandEveryFilterSection();
      expect(await gallery.smallTouchTargets()).toEqual([]);
    });

    test(`DEV-GAL-073: the charts page has 44x44 targets (${layout.name})`, async ({ context }) => {
      const { pm } = await enterGallery(context, '/powered-by/charts');
      const gallery = pm.onDevelopersGallery();
      expect(await gallery.chartCount()).toBe(8);
      expect(await gallery.smallTouchTargetsWhileScrolling()).toEqual([]);
    });
  });
}

test.describe(`${DESCRIBE} (responsive layout)`, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterGallery(context));
  });

  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    test(`DEV-GAL-074: no horizontal page scroll at ${width}px`, async () => {
      const gallery = pm.onDevelopersGallery();
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/powered-by', '/powered-by?view=list', '/powered-by/charts']) {
        await gallery.open(path);
        if (path.endsWith('charts')) await gallery.chartCount();
        else await gallery.waitForProjects();
        expect(await gallery.horizontalOverflow(), `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('DEV-GAL-075: the Talmud quote never overlaps the hero copy or buttons from 1100 to 1440px', async () => {
    const gallery = pm.onDevelopersGallery();
    for (const width of [1100, 1180, 1280, 1366, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await gallery.open('/powered-by');
      await gallery.waitForProjects();
      expect((await gallery.heroQuoteLayout()).overlaps, `quote overlaps content at ${width}px`).toEqual([]);
    }
  });

  test('DEV-GAL-076: the quote sits in the hero corner from 1100px and in flow below', async () => {
    const gallery = pm.onDevelopersGallery();
    await page.setViewportSize({ width: 1280, height: 900 });
    await gallery.waitForProjects();
    expect((await gallery.heroQuoteLayout()).position).toBe('absolute');
    await page.setViewportSize({ width: 1000, height: 900 });
    expect((await gallery.heroQuoteLayout()).position).toBe('relative');
  });

  test('DEV-GAL-077: card tag rows stay on a single line', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    const heights = await gallery.topicTagRowHeights();
    expect(heights.length).toBeGreaterThan(0);
    for (const height of heights) expect(height).toBe(28);
  });
});

test.describe(`${DESCRIBE} (submit a project)`, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterGallery(context));
  });

  test('DEV-GAL-078: "Submit a project" in the gallery bar opens the form in a new tab; the footer has none', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.submitProjectLink()).toEqual({
      name: 'Submit a project (opens in a new tab)',
      href: FORM,
      opensInNewTab: true,
    });
    expect(await gallery.footerMentions('formstack', 'Submit a project')).toEqual({ links: 0, texts: 0 });
    const donate = await gallery.donateLink();
    expect(donate.href).toBe('https://www.sefaria.org/donate');
    expect(donate.opensInNewTab).toBe(true);
  });

  test('DEV-GAL-079: at 390px it reads "Submit", sits before Donate and nothing overflows', async () => {
    const gallery = pm.onDevelopersGallery();
    await page.setViewportSize({ width: 390, height: 844 });
    await gallery.waitForProjects();
    const submit = await gallery.submitProjectLabel();
    expect(submit.visibleText).toBe('Submit');
    expect(submit.box.height).toBeCloseTo(44, 0);
    const edges = await gallery.galleryBarEdges();
    expect(submit.box.x + submit.box.width).toBeLessThanOrEqual(edges.last.x);
    expect(edges.title.height).toBeLessThan(48);
    expect(await gallery.horizontalOverflow()).toBeLessThanOrEqual(0);
  });

  test('DEV-GAL-080: from 721px the label is the full "Submit a project"', async () => {
    const gallery = pm.onDevelopersGallery();
    await page.setViewportSize({ width: 768, height: 900 });
    await gallery.waitForProjects();
    expect((await gallery.submitProjectLabel()).visibleText).toBe('Submit a project');
  });

  test('DEV-GAL-081: the gallery bar is flush with both container edges', async () => {
    const gallery = pm.onDevelopersGallery();
    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await gallery.open('/powered-by');
      await gallery.waitForProjects();
      const { first, last } = await gallery.galleryBarEdges();
      const left = first.x;
      const right = width - (last.x + last.width);
      expect(Math.abs(left - right), `${width}px: left ${left}, right ${right}`).toBeLessThanOrEqual(1);
    }
  });

  test('DEV-GAL-082: the gallery bar has no axe violations', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.axeViolations('gallery-bar')).toEqual([]);
  });
});
