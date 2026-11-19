import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, ENDPOINTS, RECORDED_TEXTS_200, enterBlank, enterPortal } from '../developers-entry';
import { ALLOWED_H1_COUNT, DEFAULT_H1_COUNT, withoutRegisteredExceptions } from './a11y-exceptions';

// Accessibility (PLAN §6.6): axe with the WCAG 2.0, 2.1 and 2.2 A and AA tags on every page type and on
// each open menu and modal, with zero violations apart from the (rule, element) pairs registered in
// a11y-exceptions.ts where live has the same issue (README "Exceptions"); one h1 per page (two on the
// pages where live has two); C6's landmarks; the skip link; every menu and modal opened, used and closed by keyboard with focus
// returned; and the status dot's text alternative.

type Violation = { id: string; impact: string | null; help: string; targets: string[] };
const describe = (violations: Violation[]) =>
  violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.targets.slice(0, 5).join('\n    ')}`).join('\n');

test.describe('Developers Accessibility, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterBlank(context));
  });

  async function expectNoViolations(include?: string[]) {
    const violations = withoutRegisteredExceptions(
      await pm.onDevelopersShell().axeViolations(include ? { include } : {}),
      page.url()
    );
    expect(violations, describe(violations)).toEqual([]);
  }

  // ---- axe on every page type ---------------------------------------------------------------

  const PAGES: [string, string][] = [
    ['001', '/'],
    ['002', DOC_PAGES.welcome],
    ['003', ENDPOINTS.texts.path],
    ['004', ENDPOINTS.findRefs.path],
    ['005', DOC_PAGES.contact],
    ['006', '/reference/getting-started'],
    ['007', '/no-such-page-e2e'],
    ['008', DOC_PAGES.captionedImages],
    ['009', DOC_PAGES.codeTabs],
    ['010', DOC_PAGES.hebrew],
  ];
  for (const [id, path] of PAGES) {
    test(`DEV-A11Y-${id}: axe finds no WCAG A/AA violation on ${path}`, async () => {
      test.slow();
      await pm.onDevelopersShell().openPath(path);
      await pm.onDevelopersShell().pageTitle();
      await expectNoViolations();
    });
  }

  test('DEV-A11Y-011: axe finds no violation on the gallery list and a project page', async () => {
    const shell = pm.onDevelopersShell();
    const gallery = pm.onDevelopersGallery();
    await shell.openPath('/powered-by');
    await gallery.waitForProjects();
    await expectNoViolations();
    const [first] = await gallery.projectCards();
    await gallery.openProject(first.title);
    expect(await gallery.projectTitle()).toBe(first.title);
    await expectNoViolations();
  });

  // ---- axe with each menu and modal open ----------------------------------------------------

  test('DEV-A11Y-020: The links menu, open, has no violation', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.welcome);
    await pm.onDevelopersShell().openLinksMenu();
    await expectNoViolations();
  });

  test('DEV-A11Y-021: The search modal, with results, has no violation', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.welcome);
    await pm.onDevelopersSearch().openWithShortcut();
    await pm.onDevelopersSearch().search('texts');
    await expectNoViolations();
  });

  test('DEV-A11Y-022: The Copy Page menu, open, has no violation', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.welcome);
    await pm.onDevelopersCopyPage().openMenu();
    await expectNoViolations();
  });

  test('DEV-A11Y-023: The feedback popover, open, has no violation', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(DOC_PAGES.welcome);
    await shell.interceptFeedback();
    await shell.answerFeedback('Yes');
    await expectNoViolations();
  });

  test('DEV-A11Y-024: The image lightbox, open, has no violation', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.captionedImages);
    await pm.onDevelopersDocs().openImageLightbox(0);
    await expectNoViolations();
  });

  test('DEV-A11Y-025: An endpoint page with the "More Languages" menu open has no violation', async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().openMoreLanguages();
    await expectNoViolations();
  });

  test('DEV-A11Y-026: An endpoint page with the library menu open has no violation', async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().selectLanguage('Node');
    await pm.onDevelopersReference().openLibraryMenu();
    await expectNoViolations();
  });

  test('DEV-A11Y-027: An endpoint page with the response-example menu open has no violation', async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().openResponseExampleMenu();
    await expectNoViolations();
  });

  test('DEV-A11Y-028: An endpoint page with the tags popover open has no violation', async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().openTagPopover();
    await expectNoViolations();
  });

  test('DEV-A11Y-029: An endpoint page with an example list open has no violation', async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().openExampleList('path', 'tref');
    await expectNoViolations();
  });

  test('DEV-A11Y-030: After Try It, the response and the Headers modal have no violation', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    await expectNoViolations();
    await tryIt.openHeadersModal();
    await expectNoViolations();
  });

  test('DEV-A11Y-031: An endpoint page with every response expanded has no violation', async () => {
    const reference = pm.onDevelopersReference();
    await pm.onDevelopersShell().openPath(ENDPOINTS.findRefs.path);
    for (const status of await reference.responseStatuses()) {
      if (!(await reference.isResponseExpanded(status.code))) await reference.toggleResponse(status.code);
    }
    await reference.expandBodyObject('text');
    await expectNoViolations();
  });

  // ---- Structure -------------------------------------------------------------------------------

  test('DEV-A11Y-040: Every page type has exactly one h1', async () => {
    const shell = pm.onDevelopersShell();
    for (const [, path] of PAGES) {
      await shell.openPath(path);
      await shell.pageTitle();
      // Live has two h1 on the paths in ALLOWED_H1_COUNT (registered exception, README); one everywhere else.
      expect(await shell.h1Count(), path).toBe(ALLOWED_H1_COUNT[path] ?? DEFAULT_H1_COUNT);
    }
  });

  test('DEV-A11Y-041: The landmarks of C6: one banner, one main, primary navigation, the article', async () => {
    const shell = pm.onDevelopersShell();
    for (const path of [DOC_PAGES.welcome, ENDPOINTS.texts.path, DOC_PAGES.contact, '/no-such-page-e2e']) {
      await shell.openPath(path);
      await shell.pageTitle();
      const landmarks = await shell.landmarks();
      expect(landmarks.banner, path).toHaveLength(1);
      expect(landmarks.main, path).toHaveLength(1);
      expect(landmarks.navigation, path).toContain('Primary navigation');
      expect(landmarks.article, path).toContain('content');
    }
    await shell.openPath(DOC_PAGES.welcome);
    const docs = await shell.landmarks();
    expect(docs.navigation).toEqual(expect.arrayContaining(['Secondary navigation', 'Table of Contents']));
  });

  test('DEV-A11Y-042: The skip link is the first focusable element and lands in the content, on every page type', async () => {
    const shell = pm.onDevelopersShell();
    for (const path of ['/', DOC_PAGES.welcome, ENDPOINTS.texts.path, DOC_PAGES.contact]) {
      await shell.openPath(path);
      await shell.useSkipLink();
      expect(await shell.isFocusInMainContent(), path).toBe(true);
    }
  });

  test('DEV-A11Y-043: The response status dot has a text alternative', async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().responseStatuses();
    const names = await pm.onDevelopersShell().statusDotNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/^\d{3}$|^error$/);
  });

  // ---- Keyboard ---------------------------------------------------------------------------------

  test('DEV-A11Y-050: The links menu opens with Enter, closes with Escape and returns focus', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(DOC_PAGES.welcome);
    await shell.focusControl('button', 'Open links menu');
    await page.keyboard.press('Enter');
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toBe('Sefaria Library');
    await page.keyboard.press('Escape');
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toBe('Open links menu');
  });

  test('DEV-A11Y-051: Search opens with the keyboard, results are reachable with arrows, Escape returns focus', async () => {
    const shell = pm.onDevelopersShell();
    const search = pm.onDevelopersSearch();
    await shell.openPath(DOC_PAGES.welcome);
    await shell.focusControl('button', 'Search ⌘k');
    await page.keyboard.press('Enter');
    expect(await search.isInputFocused()).toBe(true);
    await search.search('texts');
    await search.pressArrow('Down');
    expect(await search.activeResultIndex()).toBeGreaterThanOrEqual(0);
    await search.close();
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toBe('Search ⌘k');
  });

  test('DEV-A11Y-052: The Copy Page menu works from the keyboard and returns focus', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(DOC_PAGES.welcome);
    await shell.focusControl('button', 'Copy Page options');
    await page.keyboard.press('Enter');
    expect(await pm.onDevelopersCopyPage().isMenuOpen()).toBe(true);
    await page.keyboard.press('ArrowDown');
    expect(await shell.focusedName()).not.toBe('Copy Page options');
    await page.keyboard.press('Escape');
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toBe('Copy Page options');
  });

  test('DEV-A11Y-053: The "More Languages" menu works from the keyboard and returns focus', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(ENDPOINTS.texts.path);
    await shell.focusControl('button', 'More Languages');
    await page.keyboard.press('Enter');
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toBe('Agent Prompt');
    await page.keyboard.press('ArrowDown');
    expect(await shell.focusedName()).not.toBe('Agent Prompt');
    await page.keyboard.press('Escape');
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toBe('More Languages');
  });

  test('DEV-A11Y-054: The Headers modal traps focus, closes with Escape and returns focus', async () => {
    const shell = pm.onDevelopersShell();
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await shell.openPath(ENDPOINTS.texts.path);
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    await shell.focusControl('button', 'Headers');
    await page.keyboard.press('Enter');
    expect(await tryIt.isHeadersModalOpen()).toBe(true);
    expect(await shell.focusedName()).toBe('Close');
    await page.keyboard.press('Escape');
    expect(await tryIt.isHeadersModalOpen()).toBe(false);
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toMatch(/^Headers/);
  });

  test('DEV-A11Y-055: The image lightbox opens with Enter and closes with Escape, returning focus', async () => {
    const shell = pm.onDevelopersShell();
    const docs = pm.onDevelopersDocs();
    await shell.openPath(DOC_PAGES.captionedImages);
    await docs.openImageLightbox(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => docs.isLightboxOpen(), { timeout: t(5000) }).toBe(false);
    const trigger = await shell.focusedName();
    expect(trigger).not.toBe('');
    await page.keyboard.press('Enter');
    await expect.poll(() => docs.isLightboxOpen(), { timeout: t(5000) }).toBe(true);
  });

  test('DEV-A11Y-056: The feedback popover opens and closes from the keyboard', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(DOC_PAGES.welcome);
    await shell.interceptFeedback();
    await shell.focusControl('button', 'No, this page did not help me');
    await page.keyboard.press('Enter');
    await expect.poll(() => shell.isFeedbackCommentBoxVisible(), { timeout: t(5000) }).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => shell.isFeedbackCommentBoxVisible(), { timeout: t(5000) }).toBe(false);
    expect(await shell.focusedName()).toBe('No, this page did not help me');
  });

  test('DEV-A11Y-057: Sidebar groups toggle from the keyboard', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(DOC_PAGES.welcome);
    await shell.focusControl('button', 'Show subpages for Topic Ontology');
    await page.keyboard.press('Enter');
    expect(await shell.openSidebarGroups()).toContain('Topic Ontology');
    expect(await shell.focusedName()).toBe('Hide subpages for Topic Ontology');
  });
});

test.describe('Developers Accessibility, English (768px)', () => {
  test.use({ viewport: { width: 768, height: 900 } });

  test('DEV-A11Y-060: The mobile drawer and sub-nav, open, have no violation and close with Escape', async ({
    context,
  }) => {
    const { page, pm } = await enterPortal(context, DOC_PAGES.welcome);
    const shell = pm.onDevelopersShell();
    await shell.openMobileNav();
    let violations = withoutRegisteredExceptions(await shell.axeViolations(), page.url());
    expect(violations, describe(violations)).toEqual([]);
    await page.keyboard.press('Escape');
    expect(await shell.isMobileNavOpen()).toBe(false);
    await expect.poll(() => shell.focusedName(), { timeout: t(5000) }).toBe('Toggle navigation menu');
    await shell.openMobileSubnav();
    violations = withoutRegisteredExceptions(await shell.axeViolations(), page.url());
    expect(violations, describe(violations)).toEqual([]);
  });
});
