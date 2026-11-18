import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { richGalleryProject } from '../../pages/developers/developersGalleryPage';
import { DESCRIBE, enterGallery, MOBILE_VIEWPORT } from './gallery-entry';

// Ported from Sefaria/powered-by e2e/browse.spec.ts. Runs against the API snapshot.
const LAYOUTS = [
  { name: 'sidebar', mobile: false, viewport: { width: 1440, height: 900 } },
  { name: 'sheet', mobile: true, viewport: MOBILE_VIEWPORT },
] as const;

for (const layout of LAYOUTS) {
  test.describe(`${DESCRIBE} (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });
    let page: Page;
    let pm: PageManager;

    test.beforeEach(async ({ context }) => {
      ({ page, pm } = await enterGallery(context));
    });

    test(`DEV-GAL-010: search, filter, list view, open a project, Back restores them (${layout.name})`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      expect(await gallery.resultSummary()).toBe('Showing 24 of 122 projects · newest first');

      await gallery.search('torah');
      await expect.poll(() => gallery.resultSummary(), { timeout: t(10000) }).toMatch(/projects match$/);

      if (layout.mobile) {
        await gallery.openFilterSheet();
        await gallery.toggleFilter('Category', 'AI & Apps');
        await gallery.applyFilterSheet();
        expect(await gallery.filtersButtonLabel()).toBe('Filters · 1');
      } else {
        await gallery.toggleFilter('Category', 'AI & Apps');
      }
      await expect(page).toHaveURL(/category=ai/, { timeout: t(10000) });

      await gallery.setView('list');
      await expect(page).toHaveURL(/view=list/);
      expect(await gallery.currentView()).toBe('list');

      const listed = await gallery.openResult(0);
      const title = await gallery.projectTitle();
      expect(title.length).toBeGreaterThan(0);
      expect(listed).toContain(title);

      await gallery.goBack();
      // search, filter and view survive, and the opener has its place back
      await expect(page).toHaveURL(/q=torah/, { timeout: t(10000) });
      await expect(page).toHaveURL(/category=ai/);
      await expect(page).toHaveURL(/view=list/);
      await expect.poll(() => gallery.isResultVisible(0), { timeout: t(10000) }).toBe(true);
    });

    test(`DEV-GAL-017: no axe violations on browse, the list, the project page and the filter sheet (${layout.name})`, async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      expect(await gallery.axeViolations()).toEqual([]);

      await gallery.open('/powered-by?view=list');
      await gallery.waitForProjects();
      expect(await gallery.axeViolations()).toEqual([]);

      await gallery.open(`/powered-by/projects/${richGalleryProject().id}`);
      await gallery.projectTitle();
      expect(await gallery.axeViolations()).toEqual([]);

      if (layout.mobile) {
        await gallery.open('/powered-by');
        await gallery.waitForProjects();
        await gallery.openFilterSheet();
        expect(await gallery.axeViolations()).toEqual([]);
      }
    });
  });
}

test.describe(DESCRIBE, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterGallery(context));
  });

  test('DEV-GAL-011: an old ?project=<id> link goes to the project page', async () => {
    const rich = richGalleryProject();
    const gallery = pm.onDevelopersGallery();
    await gallery.open(`/powered-by?project=${rich.id}`);
    await expect(page).toHaveURL(new RegExp(`/powered-by/projects/${rich.id}-`), { timeout: t(15000) });
    expect(await gallery.projectTitle()).toBe(rich.project_name);
  });

  test('DEV-GAL-012: an unknown ?project= id is ignored', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.open('/powered-by?project=999999');
    await gallery.waitForProjects();
    await expect(page).toHaveURL(/\/powered-by\?project=999999$/);
  });

  test('DEV-GAL-013: Show more appends 24 and moves focus to the first new card', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    expect(await gallery.shownResultCount()).toBe(24);
    const focusedTitle = await gallery.showMore();
    expect(await gallery.shownResultCount()).toBe(48);
    expect(await gallery.focusedResultIndex()).toBe(24);
    expect((await gallery.projectCards())[24]?.title).toBe(focusedTitle);
  });

  test('DEV-GAL-015: the empty state clears filters', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.open('/powered-by?q=zzzzzz');
    expect(await gallery.waitForEmptyState()).toBe('No projects match that search.');
    await gallery.clearFilters();
    expect(await gallery.searchValue()).toBe('');
    await expect.poll(() => gallery.resultSummary(), { timeout: t(10000) }).toMatch(/^Showing 24 of 122/);
  });

  test('DEV-GAL-016: unknown gallery routes show the gallery not-found page', async () => {
    const gallery = pm.onDevelopersGallery();
    expect((await gallery.httpGet('/powered-by/nope')).status).toBe(404);
    await gallery.open('/powered-by/nope');
    expect(await gallery.isNotFound()).toBe(true);
  });
});

test.describe(`${DESCRIBE} (sheet)`, () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterGallery(context));
  });

  test('DEV-GAL-014: the filter sheet discards on close and applies on Show', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    await gallery.openFilterSheet();
    await gallery.toggleFilter('Category', 'Visualization & Data');
    await gallery.closeFilterSheet();
    await expect(page).not.toHaveURL(/category=/);

    await gallery.openFilterSheet();
    await gallery.toggleFilter('Category', 'Visualization & Data');
    await gallery.applyFilterSheet();
    await expect(page).toHaveURL(/category=viz/, { timeout: t(10000) });
    expect(await gallery.activeFilterChips()).toEqual(['Visualization & Data']);
  });
});
