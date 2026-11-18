import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, ENDPOINTS, enterPortal } from '../developers-entry';

// The search modal (PLAN §2.9, §6.2 H): Cmd/Ctrl-K and the header field, tabs with counts, method badges,
// highlighted snippets, 15 results per page with "Back · 1 of N · Next", arrow keys, Enter, Escape, the
// empty state, and no "Ask AI". Queries use words the seeded content is known to contain.
test.describe('Developers Search, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test(
    'DEV-SRCH-001: Cmd/Ctrl-K opens search; a query returns results in the Docs and API Reference tabs',
    { tag: ['@sanity', '@pr'] },
    async () => {
      const search = pm.onDevelopersSearch();
      await search.openWithShortcut();
      expect(await search.isOpen()).toBe(true);
      await search.search('texts');
      const tabs = await search.tabs();
      expect(tabs.find((tab) => tab.name === 'Docs')!.count).toBeGreaterThan(0);
      expect(tabs.find((tab) => tab.name === 'API Reference')!.count).toBeGreaterThan(0);
      expect((await search.results()).length).toBeGreaterThan(0);
    }
  );

  test('DEV-SRCH-002: The header field opens search and focuses the query', async () => {
    const search = pm.onDevelopersSearch();
    await search.openByClick();
    expect(await search.isInputFocused()).toBe(true);
  });

  test('DEV-SRCH-003: The empty state reads "Start typing to search…" and there is no "Ask AI"', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    expect(await search.emptyStateText()).toBe('Start typing to search…');
    expect(await search.hasAskAi()).toBe(false);
  });

  test('DEV-SRCH-004: Tabs are All, Docs, API Reference and Pages, with counts that add up', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('linker');
    const tabs = await search.tabs();
    expect(tabs.map((tab) => tab.name)).toEqual(['All', 'Docs', 'API Reference', 'Pages']);
    const [all, ...sections] = tabs;
    expect(all.count).toBe(sections.reduce((sum, tab) => sum + tab.count, 0));
    expect(await search.activeTab()).toBe('All');
  });

  test('DEV-SRCH-005: A tab narrows the results to its section', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('texts');
    await search.selectTab('API Reference');
    expect(await search.activeTab()).toBe('API Reference');
    const results = await search.results();
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) expect(result.section).toBe('API Reference');
    await search.selectTab('Docs');
    for (const result of await search.results()) expect(result.section).toBe('Docs');
  });

  test('DEV-SRCH-006: Endpoint results carry their GET/POST badge; docs results none', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('find refs');
    await search.selectTab('API Reference');
    const results = await search.results();
    expect(results.some((r) => r.method === 'POST')).toBe(true);
    for (const result of results) expect(['GET', 'POST']).toContain(result.method);
    await search.selectTab('Docs');
    for (const result of await search.results()) expect(result.method).toBeNull();
  });

  test('DEV-SRCH-007: The snippet highlights the match', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('disambiguator');
    const [first] = await search.results();
    expect(first.highlighted.map((h) => h.toLowerCase())).toContain('disambiguator');
  });

  test('DEV-SRCH-008: Results come 15 to a page with "Back · 1 of N · Next"', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('text');
    const tabs = await search.tabs();
    const total = tabs[0].count;
    expect(total, 'a query with more than one page of results').toBeGreaterThan(15);
    expect(await search.results()).toHaveLength(15);
    expect(await search.pageIndicator()).toEqual({ current: 1, total: Math.ceil(total / 15) });
    const firstPage = (await search.results()).map((r) => r.path);
    await search.nextPage();
    expect((await search.pageIndicator())?.current).toBe(2);
    expect((await search.results()).map((r) => r.path)).not.toEqual(firstPage);
    await search.previousPage();
    expect((await search.results()).map((r) => r.path)).toEqual(firstPage);
  });

  test('DEV-SRCH-009: A single page of results has no pager', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('disambiguator');
    expect(await search.pageIndicator()).toBeNull();
  });

  test('DEV-SRCH-010: Arrow keys move the highlight and Enter opens the result', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('texts');
    const results = await search.results();
    const start = await search.activeResultIndex();
    await search.pressArrow('Down', 2);
    expect(await search.activeResultIndex()).toBe(start + 2);
    await search.pressArrow('Up');
    expect(await search.activeResultIndex()).toBe(start + 1);
    await search.openActiveResult();
    await expect(page).toHaveURL(new RegExp(`${results[start + 1].path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect(await search.isOpen()).toBe(false);
  });

  test('DEV-SRCH-011: Choosing a result opens that page', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('Texts (v3)');
    await search.selectTab('API Reference');
    const results = await search.results();
    const index = results.findIndex((r) => r.path === ENDPOINTS.texts.path);
    expect(index).toBeGreaterThanOrEqual(0);
    await search.chooseResult(index);
    await expect(page).toHaveURL(new RegExp(`${ENDPOINTS.texts.path}$`));
    await expect.poll(() => pm.onDevelopersShell().pageTitle(), { timeout: t(10000) }).toBe(ENDPOINTS.texts.title);
  });

  test('DEV-SRCH-012: Escape and the Close button close the modal', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.close();
    expect(await search.isOpen()).toBe(false);
    await search.openByClick();
    await search.closeWithButton();
    expect(await search.isOpen()).toBe(false);
  });

  test('DEV-SRCH-013: A query with no match says so', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('zzqxjv');
    expect(await search.results()).toEqual([]);
    expect(await search.emptyStateText()).toBe("No search results for 'zzqxjv'");
  });

  test('DEV-SRCH-014: Hidden pages are not found', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('Shape API');
    expect((await search.results()).map((r) => r.path)).not.toContain(DOC_PAGES.hidden);
  });

  test('DEV-SRCH-015: Search opens from an endpoint page too and finds custom pages', async () => {
    const search = pm.onDevelopersSearch();
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await search.openWithShortcut();
    await search.search('contact');
    await search.selectTab('Pages');
    expect((await search.results()).map((r) => r.path)).toContain(DOC_PAGES.contact);
  });

  test('DEV-SRCH-016: Clearing the query brings back the empty state', async () => {
    const search = pm.onDevelopersSearch();
    await search.openWithShortcut();
    await search.search('linker');
    await search.search('');
    await expect.poll(() => search.emptyStateText(), { timeout: t(5000) }).toBe('Start typing to search…');
  });
});
