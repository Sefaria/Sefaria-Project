import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, ENDPOINTS, enterPortal } from '../../developers/developers-entry';

// The developer portal below its 768px breakpoint (PLAN §5.2.1; §6.2 A and G), in the phone projects
// (chrome-mobile-developers: Pixel 5, safari-mobile-developers: iPhone 13). Read-only tests carry @sanity
// (PLAN §5.2.3). IDs continue the desktop series of each area with an M: DEV-HDR-M###, DEV-DOC-M###, …
test.describe('Developers Mobile, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test('DEV-HDR-M001: The header shows the menu toggle instead of the primary links', { tag: '@sanity' }, async () => {
    const names = await pm.onDevelopersShell().openMobileNav();
    expect(names.slice(0, 6)).toEqual(['Home', 'Docs', 'API Reference', 'GitHub', 'Donate', 'Get in Touch']);
    expect(names).toEqual(expect.arrayContaining(['Sefaria Library', 'Voices on Sefaria']));
  });

  test('DEV-HDR-M002: The drawer closes again', { tag: '@sanity' }, async () => {
    const shell = pm.onDevelopersShell();
    await shell.openMobileNav();
    await shell.closeMobileNav();
    expect(await shell.isMobileNavOpen()).toBe(false);
  });

  test('DEV-HDR-M003: A drawer link navigates', { tag: '@sanity' }, async () => {
    const shell = pm.onDevelopersShell();
    await shell.openMobileNav();
    await shell.focusControl('link', 'API Reference');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/reference\/getting-started$/, { timeout: t(15000) });
  });

  test(
    'DEV-DOC-M001: The sidebar becomes the dropdown under the header, named by the page',
    { tag: '@sanity' },
    async () => {
      const shell = pm.onDevelopersShell();
      expect(await shell.sidebarBox()).toBeNull();
      expect(await shell.openMobileSubnav()).toBe("Welcome to Sefaria's Technical Documentation");
      expect((await shell.sidebarItems()).find((i) => i.active)?.href).toBe(DOC_PAGES.welcome);
      await shell.closeMobileSubnav();
    }
  );

  test('DEV-DOC-M002: Choosing a page in the dropdown opens it', { tag: '@sanity' }, async () => {
    const shell = pm.onDevelopersShell();
    await shell.openMobileSubnav();
    await shell.clickSidebarItem('Text References');
    await expect(page).toHaveURL(/\/docs\/text-references$/);
    expect(await shell.pageTitle()).toBe('Text References');
  });

  test('DEV-DOC-M003: The table of contents is hidden on a phone', { tag: '@sanity' }, async () => {
    expect(await pm.onDevelopersDocs().isTocVisible()).toBe(false);
  });

  test('DEV-SRCH-M001: Search opens from the header and finds pages', { tag: '@sanity' }, async () => {
    const search = pm.onDevelopersSearch();
    await search.openByClick();
    await search.search('texts');
    expect((await search.results()).length).toBeGreaterThan(0);
    await search.close();
  });

  test('DEV-HOME-M001: The homepage hero keeps its spacing below the header (D-11)', { tag: '@sanity' }, async () => {
    const home = pm.onDevelopersHome();
    await pm.onDevelopersShell().openPath('/');
    expect(await home.heroTitle()).toBe('Expand Digital Torah');
    const spacing = await home.heroTopSpacing();
    expect(spacing).toBeGreaterThan(0);
    expect(spacing).toBeLessThan(120);
  });

  test(
    'DEV-HOME-M002: The six tiles and both Discord buttons are on the phone homepage',
    { tag: '@sanity' },
    async () => {
      const shell = pm.onDevelopersShell();
      await shell.openPath('/');
      expect(await pm.onDevelopersHome().toolTiles()).toHaveLength(6);
      expect(await shell.discordButton('home_hero')).not.toBeNull();
      expect(await shell.discordButton('home_community')).not.toBeNull();
    }
  );

  test('DEV-REF-M001: On an endpoint page the playground sits under the article', { tag: '@sanity' }, async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    const boxes = await pm.onDevelopersReference().layoutBoxes();
    expect(boxes.sidebar).toBeNull();
    expect(boxes.playground!.y).toBeGreaterThanOrEqual(boxes.article!.y + boxes.article!.height - 1);
  });

  test('DEV-REF-M002: The endpoint sub-nav names the operation', { tag: '@sanity' }, async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(ENDPOINTS.texts.path);
    expect(await shell.openMobileSubnav()).toBe(ENDPOINTS.texts.title);
  });

  test('DEV-A11Y-M001: The phone layout has no WCAG A/AA violation, with the drawer open', async () => {
    const shell = pm.onDevelopersShell();
    let violations = await shell.axeViolations();
    expect(violations, violations.map((v) => `${v.id}: ${v.targets.join(', ')}`).join('\n')).toEqual([]);
    await shell.openMobileNav();
    violations = await shell.axeViolations();
    expect(violations, violations.map((v) => `${v.id}: ${v.targets.join(', ')}`).join('\n')).toEqual([]);
  });

  test('DEV-HDR-M004: The page does not scroll sideways', { tag: '@sanity' }, async () => {
    for (const path of [DOC_PAGES.welcome, ENDPOINTS.texts.path, DOC_PAGES.contact]) {
      await pm.onDevelopersShell().openPath(path);
      await pm.onDevelopersShell().pageTitle();
      const overflow = await pm.onDevelopersReference().layoutBoxes();
      expect(overflow.article!.x, path).toBeGreaterThanOrEqual(0);
      expect(overflow.article!.x + overflow.article!.width, path).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  });
});
