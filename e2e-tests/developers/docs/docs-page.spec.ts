import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, enterPortal, flattenedSidebarOrder, stubExternalSites } from '../developers-entry';

// A docs page's layout and chrome (PLAN §6.2 F and G): title, excerpt, sidebar, the right rail with the
// table of contents and its scroll spy, heading anchors, "Updated", prev/next, feedback and the two
// Discord placements of a docs page.
test.describe('Developers Docs, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test(
    'DEV-DOC-001: /docs/welcome renders its title, a callout and the sidebar',
    { tag: ['@sanity', '@pr'] },
    async () => {
      const shell = pm.onDevelopersShell();
      expect(await shell.pageTitle()).toBe("Welcome to Sefaria's Technical Documentation");
      const callouts = await pm.onDevelopersDocs().callouts();
      expect(callouts.length).toBeGreaterThan(0);
      expect(callouts[0].title).toBe('This is a work in progress.');
      const items = await shell.sidebarItems();
      expect(items.find((i) => i.active)?.href).toBe('/docs/welcome');
    }
  );

  test('DEV-DOC-002: The excerpt sits under the title and the document title is the page title', async () => {
    expect(await pm.onDevelopersShell().pageExcerpt()).toMatch(/^Explore Sefaria's technical documentation/);
    expect(await page.title()).toBe("Welcome to Sefaria's Technical Documentation");
  });

  test('DEV-DOC-003: Three columns: sidebar, article and a right rail with the table of contents', async () => {
    const shell = pm.onDevelopersShell();
    const docs = pm.onDevelopersDocs();
    const sidebar = await shell.sidebarBox();
    expect(sidebar).not.toBeNull();
    expect(await docs.isTocVisible()).toBe(true);
    expect(await docs.tocEntries()).toEqual([
      "Welcome to Sefaria's Technical Documentation",
      'Quick Questions and Answers',
      "Need more information before exploring Sefaria's API?",
      'Interested in the structure of the Sefaria Library?',
      'Looking for additional endpoints beyond the API Reference?',
      "We're here to help!",
    ]);
  });

  test('DEV-DOC-004: The right rail holds Copy Page above the table of contents', async () => {
    const entries = await pm.onDevelopersCopyPage().openMenu();
    expect(entries[0]).toBe('Copy Markdown');
    expect(await pm.onDevelopersDocs().isTocVisible()).toBe(true);
  });

  // A long page: the welcome page is too short for its later headings to reach the top of the viewport.
  test('DEV-DOC-005: The table of contents marks the current section while scrolling', async () => {
    const docs = pm.onDevelopersDocs();
    expect(await docs.activeTocEntry()).toBe("Welcome to Sefaria's Technical Documentation");
    await pm.onDevelopersShell().openPath(DOC_PAGES.callouts);
    await docs.scrollToHeading('8) Add some texts in your database.');
    await expect.poll(() => docs.activeTocEntry(), { timeout: t(5000) }).toBe('8) Add some texts in your database.');
    await docs.scrollToHeading('4) Install gettext.');
    await expect.poll(() => docs.activeTocEntry(), { timeout: t(5000) }).toBe('4) Install gettext.');
  });

  test('DEV-DOC-006: Choosing a table-of-contents entry jumps to its heading', async () => {
    const docs = pm.onDevelopersDocs();
    await pm.onDevelopersShell().openPath(DOC_PAGES.callouts);
    const id = await docs.headingId('7) Get Mongo running:');
    await docs.clickTocEntry('7) Get Mongo running:');
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect.poll(() => docs.activeTocEntry(), { timeout: t(5000) }).toBe('7) Get Mongo running:');
  });

  test('DEV-DOC-007: Headings show an anchor link on hover and carry stable ids', async () => {
    const docs = pm.onDevelopersDocs();
    expect(await docs.headingId('Quick Questions and Answers')).toBe('quick-questions-and-answers');
    expect(await docs.hoverHeadingAnchor('Quick Questions and Answers')).toBe('#quick-questions-and-answers');
  });

  test('DEV-DOC-008: A #hash in the address scrolls to its heading on load', async () => {
    const docs = pm.onDevelopersDocs();
    await pm.onDevelopersShell().openPath(DOC_PAGES.callouts);
    const id = await docs.headingId('7) Get Mongo running:');
    await pm.onDevelopersShell().openPath(`${DOC_PAGES.callouts}#${id}`);
    await expect.poll(() => docs.activeTocEntry(), { timeout: t(10000) }).toBe('7) Get Mongo running:');
  });

  test('DEV-DOC-009: "Updated N ago" shows a relative time', async () => {
    expect(await pm.onDevelopersShell().updatedText()).toMatch(
      /^Updated (a few seconds|a minute|\d+ minutes|an hour|\d+ hours|a day|\d+ days|a month|\d+ months|a year|\d+ years) ago$/
    );
  });

  test('DEV-DOC-010: Prev/next follow the flattened sidebar order', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath('/docs/powered-by-sefaria');
    const order = await flattenedSidebarOrder(pm, 'docs');
    const here = order.indexOf('/docs/powered-by-sefaria');
    const { previous, next } = await shell.prevNextLinks();
    expect(previous?.href).toBe(order[here - 1]);
    expect(previous?.name).toBe("Previous Page: Welcome to Sefaria's Technical Documentation");
    // The next page is the group's first child (Project Acceptance Criteria), not its next sibling.
    expect(next?.href).toBe(order[here + 1]);
    expect(next?.href).toBe('/docs/powered-by-sefaria-acceptance-criteria');
  });

  // Live shows no prev/next on the welcome page (research/site/pages.json: "pagination": []), so start one later.
  test('DEV-DOC-011: Next goes to the next page and Previous comes back', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath('/docs/powered-by-sefaria');
    const { next } = await shell.prevNextLinks();
    expect(next).not.toBeNull();
    await shell.clickNext();
    await expect(page).toHaveURL(new RegExp(`${next!.href}$`), { timeout: t(15000) });
    await shell.clickPrevious();
    await expect(page).toHaveURL(/\/docs\/powered-by-sefaria$/, { timeout: t(15000) });
  });

  test('DEV-DOC-012: Prev/next skip external link items ("Sefaria GitHub")', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath('/docs/the-sefaria-mcp');
    const { previous } = await shell.prevNextLinks();
    expect(previous?.href ?? '').not.toMatch(/^https?:/);
  });

  test('DEV-DOC-013: "Did this page help you?" opens a comment box and votes through the feedback endpoint', async () => {
    const shell = pm.onDevelopersShell();
    const capture = await shell.interceptFeedback();
    await shell.answerFeedback('No');
    expect(await shell.isFeedbackCommentBoxVisible()).toBe(true);
    await shell.fillFeedbackComment('e2e: the example could use a POST body');
    await shell.submitFeedbackVote();
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBe(1);
    const body = JSON.parse(capture.requests[0].body ?? '{}');
    expect(body).toMatchObject({ helpful: false, comment: 'e2e: the example could use a POST body' });
    expect(body.path).toBe('/docs/welcome');
    expect(capture.requests[0].headers['x-csrftoken']).toBeTruthy();
  });

  test('DEV-DOC-014: Answering Yes also opens the comment box', async () => {
    const shell = pm.onDevelopersShell();
    await shell.interceptFeedback();
    await shell.answerFeedback('Yes');
    expect(await shell.isFeedbackCommentBoxVisible()).toBe(true);
  });

  test('DEV-DOC-015: The sidebar footer and the end of the page carry "Join our Discord"', async ({ context }) => {
    const shell = pm.onDevelopersShell();
    const formstack = /^https:\/\/sefaria\.formstack\.com\/forms\/sefaria_developer_discord_community/;
    for (const placement of ['sidebar_footer', 'docs_page_end'] as const) {
      const button = await shell.discordButton(placement);
      expect(button, placement).not.toBeNull();
      expect(button!.name).toBe('Join our Discord');
      expect(button!.href).toMatch(formstack);
      expect(button!.opensInNewTab).toBe(true);
    }
    await stubExternalSites(context, /formstack\.com/);
    const tab = await shell.clickDiscordButton('docs_page_end');
    await expect(tab).toHaveURL(formstack);
    await tab.close();
  });

  test('DEV-DOC-016: Only the group of the current page is open on load', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath('/docs/index-and-versions');
    const open = await shell.openSidebarGroups();
    expect(open).toEqual(['The Structure of a Book in the Sefaria Library']);
    expect((await shell.sidebarItems()).find((i) => i.active)?.href).toBe('/docs/index-and-versions');
  });

  test('DEV-DOC-017: Sidebar groups open and close on click', async () => {
    const shell = pm.onDevelopersShell();
    expect(await shell.openSidebarGroups()).toEqual([]);
    await shell.toggleSidebarGroup('Topic Ontology');
    expect(await shell.openSidebarGroups()).toEqual(['Topic Ontology']);
    await shell.toggleSidebarGroup('Topic Ontology');
    expect(await shell.openSidebarGroups()).toEqual([]);
  });

  test('DEV-DOC-018: A sidebar link item shows the external arrow and opens its target in a new tab', async ({
    context,
  }) => {
    const shell = pm.onDevelopersShell();
    const github = (await shell.sidebarItems()).find((i) => i.name === 'Sefaria GitHub');
    expect(github).toMatchObject({ href: 'https://github.com/Sefaria/Sefaria-Project', external: true });
    await stubExternalSites(context, /^https:\/\/github\.com\//);
    const tab = await shell.clickExternalSidebarItem('Sefaria GitHub');
    await expect(tab).toHaveURL('https://github.com/Sefaria/Sefaria-Project');
    await tab.close();
  });

  test('DEV-DOC-019: Clicking a sidebar row navigates in place and moves the current marker', async () => {
    const shell = pm.onDevelopersShell();
    await shell.clickSidebarItem('Text References');
    await expect(page).toHaveURL(/\/docs\/text-references$/);
    expect(await shell.pageTitle()).toBe('Text References');
    expect((await shell.sidebarItems()).find((i) => i.active)?.name).toBe('Text References');
  });

  test('DEV-DOC-020: Sidebar section headings are upper-cased', async () => {
    const headings = await pm.onDevelopersShell().sidebarSectionHeadings();
    expect(headings).toContain('TECHNICAL DOCS');
    expect(headings).toContain('LOCAL INSTALLATION');
    for (const heading of headings) expect(heading).toBe(heading.toUpperCase());
  });

  test('DEV-DOC-021: A deprecated doc shows the deprecated marker in the sidebar', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(DOC_PAGES.deprecated);
    const row = (await shell.sidebarItems()).find((i) => i.href === DOC_PAGES.deprecated);
    expect(row?.deprecated).toBe(true);
  });

  test('DEV-DOC-022: A hidden page is served but listed nowhere in the sidebar', async () => {
    const shell = pm.onDevelopersShell();
    expect((await pm.onDevelopersCopyPage().httpGet(DOC_PAGES.hidden)).status).toBe(200);
    await shell.openPath(DOC_PAGES.hidden);
    expect(await shell.pageTitle()).toBe('Shape API');
    expect((await shell.sidebarItems()).map((i) => i.href)).not.toContain(DOC_PAGES.hidden);
  });
});
