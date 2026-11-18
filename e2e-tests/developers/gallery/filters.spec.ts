import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DevelopersGalleryPage, GALLERY_PROJECTS } from '../../pages/developers/developersGalleryPage';
import { DESCRIBE, enterGallery, MOBILE_VIEWPORT } from './gallery-entry';

// Ported from Sefaria/powered-by e2e/filters.spec.ts. Counts are the API snapshot's. OR within a facet, AND
// across facets; on the sheet a selection applies only on "Show N projects".
const LAYOUTS = [
  { name: 'sidebar', mobile: false, viewport: { width: 1440, height: 900 } },
  { name: 'sheet', mobile: true, viewport: MOBILE_VIEWPORT },
] as const;

for (const layout of LAYOUTS) {
  test.describe(`${DESCRIBE} (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });
    let page: Page;
    let pm: PageManager;
    let gallery: DevelopersGalleryPage;

    const openFilters = async () => {
      if (layout.mobile) await gallery.openFilterSheet();
    };
    const applyIfSheet = async () => {
      if (layout.mobile) await gallery.applyFilterSheet();
    };

    test.beforeEach(async ({ context }) => {
      ({ page, pm } = await enterGallery(context));
      gallery = pm.onDevelopersGallery();
    });

    test(`DEV-GAL-020: topic + language + built-with combine: results, chips, badge and URL (${layout.name})`, async () => {
      await gallery.waitForProjects();
      await openFilters();
      await gallery.toggleFilter('Topics', 'Gemara');
      await gallery.toggleFilter('Language', 'English');
      await gallery.toggleFilter('Built with', 'React');
      await applyIfSheet();

      await expect(page).toHaveURL(/topic=Gemara/, { timeout: t(10000) });
      await expect(page).toHaveURL(/lang=English/);
      await expect(page).toHaveURL(/tech=React/);
      await expect(page).not.toHaveURL(/bugs=/);
      await expect.poll(() => gallery.resultSummary(), { timeout: t(10000) }).toBe('1 project matches');
      expect(await gallery.resultHeadings()).toEqual(['Jastrow Search']);

      expect(await gallery.activeFilterChips()).toEqual(['Gemara', 'Language: English', 'Built with: React']);
      expect(await gallery.filtersButtonLabel()).toBe(layout.mobile ? 'Filters · 3' : null);

      // removing one chip widens the results (Gemara + English only)
      await gallery.removeFilterChip(gallery.chipLabel('Built with', 'React'));
      await expect(page).not.toHaveURL(/tech=/, { timeout: t(10000) });
      await expect.poll(() => gallery.resultSummary(), { timeout: t(10000) }).toBe('14 projects match');

      await gallery.clearAllChips();
      await expect(page).not.toHaveURL(/topic=|lang=/, { timeout: t(10000) });
      await expect.poll(() => gallery.resultSummary(), { timeout: t(10000) }).toMatch(/^Showing 24 of 122/);
    });

    test(`DEV-GAL-021: OR within a section: two topics match either (${layout.name})`, async () => {
      await gallery.open('/powered-by?topic=Gemara');
      await gallery.waitForProjects();
      expect(await gallery.resultSummary()).toBe('16 projects match');
      await openFilters();
      await gallery.toggleFilter('Topics', 'Tanakh');
      await applyIfSheet();
      await expect(page).toHaveURL(/topic=Gemara%2CTanakh|topic=Gemara,Tanakh/, { timeout: t(10000) });
      // Gemara (16) or Tanakh (13), visible projects only: 29 in the snapshot
      await expect.poll(() => gallery.resultSummary(), { timeout: t(10000) }).toBe('29 projects match');
    });

    test(`DEV-GAL-022: sections start collapsed, and open from a selection in the URL (${layout.name})`, async () => {
      await gallery.open('/powered-by?lang=Hebrew');
      await gallery.waitForProjects();
      await openFilters();
      expect(await gallery.filterSectionLabel('Language')).toBe('Language · 1');
      expect(await gallery.isFilterSectionOpen('Language')).toBe(true);
      expect(await gallery.isFilterSectionOpen('Topics')).toBe(false);
    });

    test(`DEV-GAL-023: Show all expands a long list, and Filter topics narrows it (${layout.name})`, async () => {
      await gallery.waitForProjects();
      await openFilters();
      expect(await gallery.filterValues('Topics')).toHaveLength(8);
      expect((await gallery.showAllInSection('Topics')).length).toBeGreaterThan(12);
      expect(await gallery.narrowFilterSection('Topics', 'gemara')).toEqual(['Gemara']);
    });

    test(`DEV-GAL-025: known issues are hidden by default and shown (without a badge) when switched on (${layout.name})`, async () => {
      await gallery.waitForProjects();
      expect(await gallery.heroProjectCount()).toBe(122);
      expect(await gallery.resultSummary()).toMatch(/^Showing 24 of 122 projects/);

      await openFilters();
      expect(await gallery.areKnownIssuesShown()).toBe(false);
      await gallery.setKnownIssuesShown(true);
      await applyIfSheet();

      await expect(page).toHaveURL(/bugs=1/, { timeout: t(10000) });
      await expect.poll(() => gallery.heroProjectCount(), { timeout: t(10000) }).toBe(134);
      expect(await gallery.resultSummary()).toMatch(/^Showing 24 of 134 projects/);

      // a buggy project is now findable, with no badge; off again, it's gone
      await gallery.open('/powered-by?bugs=1&q=Daf+Quiz');
      await gallery.waitForProjects();
      const cards = await gallery.projectCards();
      expect(cards.map((c) => c.title)).toContain('Daf Quiz');
      expect(cards.some((c) => c.knownIssuesBadge)).toBe(false);
      await gallery.open('/powered-by?q=Daf+Quiz');
      expect(await gallery.waitForEmptyState()).toBe('No projects match that search.');
    });

    test(`DEV-GAL-026: filter counts follow the known-issues switch (${layout.name})`, async () => {
      await gallery.open('/powered-by?topic=Gemara');
      await gallery.waitForProjects();
      expect(await gallery.resultSummary()).toBe('16 projects match');
      await gallery.open('/powered-by?topic=Gemara&bugs=1');
      await gallery.waitForProjects();
      expect(await gallery.resultSummary()).toBe('18 projects match');
      await openFilters();
      expect(await gallery.areKnownIssuesShown()).toBe(true);
    });

    test(`DEV-GAL-028: a known-issues project page works with the switch off (${layout.name})`, async () => {
      await gallery.open(`/powered-by/projects/${GALLERY_PROJECTS.dafQuiz}`);
      expect(await gallery.projectTitle()).toBe('Daf Quiz');
      await gallery.clickAllProjects();
      await gallery.waitForProjects();
      await openFilters();
      expect(await gallery.areKnownIssuesShown()).toBe(false);
    });

    test(`DEV-GAL-030: no axe violations with every section open (${layout.name})`, async () => {
      await gallery.open('/powered-by?topic=Gemara&lang=English&bugs=1');
      await gallery.waitForProjects();
      await openFilters();
      for (const facet of ['Topics', 'Language', 'Sefaria resources', 'Built with'] as const) {
        await gallery.openFilterSection(facet);
      }
      expect(await gallery.axeViolations()).toEqual([]);
    });
  });
}

test.describe(`${DESCRIBE} (sheet)`, () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterGallery(context));
  });

  test('DEV-GAL-024: the sheet holds a pending selection with a live "Show N", discarded on close', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    await gallery.openFilterSheet();
    expect(await gallery.filterSheetPendingCount()).toBe(122);

    await gallery.toggleFilter('Topics', 'Gemara');
    await expect.poll(() => gallery.filterSheetPendingCount(), { timeout: t(5000) }).toBe(16);
    await expect(page).not.toHaveURL(/topic=/); // not applied yet
    await gallery.toggleFilter('Language', 'Hebrew');
    await expect.poll(() => gallery.filterSheetPendingCount(), { timeout: t(5000) }).toBe(2);

    await gallery.closeFilterSheet();
    await expect(page).not.toHaveURL(/topic=|lang=/);
    expect(await gallery.resultSummary()).toMatch(/^Showing 24 of 122/);

    await gallery.openFilterSheet();
    expect(await gallery.isFilterChecked('Topics', 'Gemara')).toBe(false);
    expect(await gallery.filterSheetPendingCount()).toBe(122);
  });
});

test.describe(DESCRIBE, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterGallery(context));
  });

  test('DEV-GAL-027: a known-issues project opens from its arrow, the notice above the button', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.open('/powered-by?bugs=1&q=Daf+Quiz');
    await gallery.waitForProjects();
    await gallery.openProject('Daf Quiz');
    await expect(page).toHaveURL(new RegExp(`/powered-by/projects/${GALLERY_PROJECTS.dafQuiz}-daf-quiz`));
    expect(await gallery.knownIssuesNotice()).toContain('This project may no longer be active.');
    expect(await gallery.hasOpenAnyway()).toBe(true);
    expect(await gallery.isNoticeAboveOpenAnyway()).toBe(true);
  });

  test('DEV-GAL-029: the empty state offers Clear filters', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.open('/powered-by?topic=Gemara&lang=Korean');
    expect(await gallery.waitForEmptyState()).toBe('No projects match that search.');
    await gallery.clearFilters();
    await expect(page).not.toHaveURL(/topic=|lang=/, { timeout: t(10000) });
    await expect.poll(() => gallery.resultSummary(), { timeout: t(10000) }).toMatch(/^Showing 24 of 122/);
  });
});
