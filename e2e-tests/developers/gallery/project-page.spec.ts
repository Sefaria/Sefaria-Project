import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { developersUrl } from '../../pages/developers/developersCommon';
import { GALLERY_PROJECTS } from '../../pages/developers/developersGalleryPage';
import { DESCRIBE, enterGallery } from './gallery-entry';

// Ported from Sefaria/powered-by e2e/project-page.spec.ts: the three widths of the spec, each with its own
// viewport (side card, inline panel, bottom bar).
const WIDTHS = [
  { width: 1280, layout: 'side card' },
  { width: 834, layout: 'inline panel' },
  { width: 390, layout: 'bottom bar' },
] as const;

const GALLERY_ROOT = new RegExp(`^${developersUrl('/powered-by').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

for (const { width, layout } of WIDTHS) {
  test.describe(`${DESCRIBE} (project page at ${width}px)`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });
    let page: Page;
    let pm: PageManager;

    test.beforeEach(async ({ context }) => {
      ({ page, pm } = await enterGallery(context, `/powered-by/projects/${GALLERY_PROJECTS.torahMcp}-torah-mcp`));
    });

    test(`DEV-GAL-050: a deep link works and a wrong slug redirects to the canonical one (${width}px)`, async () => {
      const gallery = pm.onDevelopersGallery();
      expect(await gallery.projectTitle()).toBe('Torah MCP');
      await expect(page).toHaveTitle('Torah MCP · Powered by Sefaria');

      await gallery.open(`/powered-by/projects/${GALLERY_PROJECTS.torahMcp}-an-old-name`);
      await expect(page).toHaveURL(new RegExp(`/powered-by/projects/${GALLERY_PROJECTS.torahMcp}-torah-mcp$`), {
        timeout: t(10000),
      });
      expect(await gallery.projectTitle()).toBe('Torah MCP');
    });

    test(`DEV-GAL-051: an unknown id shows "Project not found" (${width}px)`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.open('/powered-by/projects/999999');
      expect(await gallery.isNotFound()).toBe(true);
      await gallery.clickNotFoundAllProjects();
      await expect(page).toHaveURL(GALLERY_ROOT, { timeout: t(10000) });
    });

    test(`DEV-GAL-052: the open button is a ${layout} (${width}px)`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.open(`/powered-by/projects/${GALLERY_PROJECTS.torahMcp}`);
      const cta = await gallery.projectCtaLayout();
      expect(cta.position).toBe(width >= 600 && width < 1024 ? 'static' : 'sticky');
      if (width >= 1024) {
        // a right-hand column, level with the header, with full-width stacked buttons
        expect(cta.panel.x).toBeGreaterThan(width / 2);
        expect(cta.panel.width).toBeCloseTo(360, 0);
        expect(cta.open.height).toBeCloseTo(52, 0);
        await gallery.scrollTo(300);
        // still in view after scrolling: it follows the page
        await expect.poll(async () => (await gallery.projectCtaBox()).y, { timeout: t(5000) }).toBeCloseTo(24, 0);
      } else if (width >= 600) {
        // an inline panel under the header, buttons side by side at natural width
        expect(cta.panel.y).toBeGreaterThan(cta.heading.y);
        expect(cta.open.width).toBeLessThan(cta.panel.width - 40);
        expect(cta.source).not.toBeNull();
        expect(Math.abs(cta.source!.y - cta.open.y)).toBeLessThan(2);
      } else {
        // pinned to the bottom edge, bleeding to both sides, one full-width 52px button
        expect(cta.panel.x).toBe(0);
        expect(cta.panel.width).toBe(width);
        expect(cta.panel.y + cta.panel.height).toBeCloseTo(cta.viewport.height, 0);
        expect(cta.open.height).toBeCloseTo(52, 0);
        expect(cta.open.width).toBeGreaterThan(width - 40);
        // "View source code" has moved into the project header
        expect(cta.sourceInPanel).toBe(false);
        expect(cta.sourceVisible).toBe(true);
      }
    });

    if (width < 600) {
      test(`DEV-GAL-053: the bottom bar never covers the last of the details (${width}px)`, async () => {
        const gallery = pm.onDevelopersGallery();
        await gallery.projectTitle();
        await gallery.scrollToBottom();
        const details = await gallery.projectDetailsBox();
        const bar = await gallery.projectCtaBox();
        expect(details.y + details.height).toBeLessThanOrEqual(bar.y + 1);
      });
    }

    test(`DEV-GAL-054: a known-issues project has the notice above "Open anyway" (${width}px)`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.open(`/powered-by/projects/${GALLERY_PROJECTS.dafQuiz}`);
      await expect
        .poll(() => gallery.ctaNotice(), { timeout: t(10000) })
        .toContain('This project may no longer be active.');
      expect(await gallery.hasOpenAnyway()).toBe(true);
      expect(await gallery.hasOpenProjectButton('Daf Quiz')).toBe(false);
    });

    test(`DEV-GAL-055: no axe violations on a project page and a known-issues page (${width}px)`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.projectTitle();
      expect(await gallery.axeViolations()).toEqual([]);
      await gallery.open(`/powered-by/projects/${GALLERY_PROJECTS.dafQuiz}`);
      await expect.poll(() => gallery.knownIssuesNotice(), { timeout: t(10000) }).not.toBeNull();
      expect(await gallery.axeViolations()).toEqual([]);
    });

    test(`DEV-GAL-056: Back from a project restores the browse filters, sort and scroll (${width}px)`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.open('/powered-by?sort=az&category=learn');
      await gallery.waitForProjects();
      const before = await gallery.scrollResultIntoView(6);
      expect(before).toBeGreaterThan(0);
      await gallery.openResult(6);
      await gallery.clickAllProjects();
      await expect(page).toHaveURL(/sort=az/, { timeout: t(10000) });
      await expect(page).toHaveURL(/category=learn/);
      await gallery.waitForProjects();
      await expect.poll(() => gallery.scrollY(), { timeout: t(5000) }).toBeGreaterThan(before - 150);
    });

    test(`DEV-GAL-057: "All projects" links to the gallery root when the page is opened directly (${width}px)`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.projectTitle();
      await gallery.clickAllProjects();
      await expect(page).toHaveURL(GALLERY_ROOT, { timeout: t(10000) });
    });
  });
}
