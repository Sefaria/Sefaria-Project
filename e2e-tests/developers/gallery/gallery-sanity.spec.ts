import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { developersUrl } from '../../pages/developers/developersCommon';
import { DESCRIBE } from './gallery-entry';

// The two read-only core journeys (PLAN §5.2.3), against the real /api/powered-by data: no snapshot, and
// assertions on structure (a filter narrows the count) rather than on particular projects.
test.describe(DESCRIBE, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, developersUrl('/powered-by'), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('DEV-GAL-001: The gallery lists projects and a filter narrows them', { tag: ['@sanity', '@pr'] }, async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    const total = await gallery.resultCount();
    expect(total).toBeGreaterThan(0);
    expect((await gallery.projectCards()).length).toBeGreaterThan(0);

    // Narrow by the first category that has projects but not all of them.
    const categories = (await gallery.filterValues('Category')).filter((c) => c !== 'All projects');
    let narrowed = false;
    for (const category of categories) {
      const count = await gallery.filterCount('Category', category);
      if (count > 0 && count < total) {
        await gallery.toggleFilter('Category', category);
        await expect(page).toHaveURL(/category=/, { timeout: t(10000) });
        await expect.poll(() => gallery.resultCount(), { timeout: t(10000) }).toBe(count);
        narrowed = true;
        break;
      }
    }
    expect(narrowed, 'some category holds part of the projects').toBe(true);
  });

  test(
    'DEV-GAL-002: A project page opens from the gallery; an unknown id is a 404',
    { tag: ['@sanity', '@pr'] },
    async () => {
      const gallery = pm.onDevelopersGallery();
      await gallery.waitForProjects();
      const [first] = await gallery.projectCards();
      expect(first).toBeDefined();
      await gallery.openResult(0);
      expect(await gallery.projectTitle()).toBe(first!.title);
      expect(new URL(page.url()).pathname).toBe(first!.href);

      expect((await gallery.httpGet('/powered-by/projects/999999999-no-such-project')).status).toBe(404);
      await gallery.open('/powered-by/projects/999999999-no-such-project');
      expect(await gallery.isNotFound()).toBe(true);
    }
  );
});
