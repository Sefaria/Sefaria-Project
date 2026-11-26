import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';
import { DOC_PAGES, enterPortal, stubExternalSites } from '../developers-entry';

// The header copies live's (C6 "Header"; SITE_ATLAS §2): six links in live's order and targets, plus the
// Powered by Sefaria gallery (D-14), the active tab, the links menu, the search field's key hint and the skip link.

const PRODUCTION_HOSTS = new Set(['sefaria.org', 'www.sefaria.org', 'voices.sefaria.org', 'developers.sefaria.org']);

/** A links-menu address: this environment's module URL, or live's address in production (devportal_assets.site_links). */
function siteLink(moduleUrl: string, production: string): string {
  const url = new URL(moduleUrl);
  return PRODUCTION_HOSTS.has(url.hostname) ? production : url.origin;
}
test.describe('Developers Shell, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test("DEV-HDR-001: The primary navigation lists live's six links in order, with the gallery after API Reference", async () => {
    expect(await pm.onDevelopersShell().headerLinkNames()).toEqual([
      'Home',
      'Docs',
      'API Reference',
      'Projects Powered by Sefaria',
      'GitHub',
      'Donate',
      'Get in Touch',
    ]);
  });

  test("DEV-HDR-002: Home, Docs, API Reference and Get in Touch open in the same tab at live's targets", async () => {
    const shell = pm.onDevelopersShell();
    expect(await shell.headerLink('Home')).toEqual({ name: 'Home', href: '/', opensInNewTab: false });
    expect(await shell.headerLink('Docs')).toEqual({ name: 'Docs', href: '/docs', opensInNewTab: false });
    expect(await shell.headerLink('API Reference')).toEqual({
      name: 'API Reference',
      href: '/reference',
      opensInNewTab: false,
    });
    expect(await shell.headerLink('Get in Touch')).toEqual({
      name: 'Get in Touch',
      href: '/page/contact-us',
      opensInNewTab: false,
    });
  });

  test('DEV-HDR-003: GitHub and Donate open in a new tab', async () => {
    const shell = pm.onDevelopersShell();
    const github = await shell.headerLink('GitHub');
    expect(github.href).toBe('https://github.com/Sefaria/Sefaria-Project');
    expect(github.opensInNewTab).toBe(true);
    const donate = await shell.headerLink('Donate');
    expect(donate.href).toMatch(/^https:\/\/donate\.sefaria\.org\/give\/451346\/.*c_src=HeaderDev/);
    expect(donate.opensInNewTab).toBe(true);
  });

  test('DEV-HDR-004: Clicking GitHub opens the repository in a new tab', async ({ context }) => {
    await stubExternalSites(context, /^https:\/\/github\.com\//);
    const tab = await pm.onDevelopersShell().clickHeaderLinkInNewTab('GitHub');
    await expect(tab).toHaveURL('https://github.com/Sefaria/Sefaria-Project', { timeout: t(15000) });
    await tab.close();
    expect(new URL(page.url()).pathname).toBe(DOC_PAGES.welcome);
  });

  test('DEV-HDR-005: Docs leads to the welcome page and marks Docs active', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath('/');
    await shell.clickHeaderLink('Docs');
    await expect(page).toHaveURL(/\/docs\/welcome$/, { timeout: t(15000) });
    expect(await shell.activeHeaderTab()).toBe('Docs');
  });

  test('DEV-HDR-006: API Reference leads to Getting Started and marks API Reference active', async () => {
    const shell = pm.onDevelopersShell();
    await shell.clickHeaderLink('API Reference');
    await expect(page).toHaveURL(/\/reference\/getting-started$/, { timeout: t(15000) });
    expect(await shell.activeHeaderTab()).toBe('API Reference');
  });

  test('DEV-HDR-007: Get in Touch leads to the contact page and marks it active', async () => {
    const shell = pm.onDevelopersShell();
    await shell.clickHeaderLink('Get in Touch');
    await expect(page).toHaveURL(/\/page\/contact-us$/, { timeout: t(15000) });
    expect(await shell.activeHeaderTab()).toBe('Get in Touch');
  });

  test('DEV-HDR-008: Home is the active tab on the homepage and Docs on a docs page', async () => {
    const shell = pm.onDevelopersShell();
    expect(await shell.activeHeaderTab()).toBe('Docs');
    await shell.clickHeaderLink('Home');
    await expect(page).toHaveURL(/\/$/, { timeout: t(15000) });
    expect(await shell.activeHeaderTab()).toBe('Home');
  });

  test('DEV-HDR-009: The links menu lists the four Sefaria products', async () => {
    const items = await pm.onDevelopersShell().openLinksMenu();
    expect(items.map((i) => i.name)).toEqual([
      'Sefaria Library',
      'Voices at Sefaria',
      'Developers',
      'More from Sefaria ›',
    ]);
    // This environment's sites, which the server puts on <html> (a cauldron links to its own Library and Voices),
    // each either live's address or this environment's module URL.
    const sites = await page.evaluate(() => ({ ...document.documentElement.dataset }));
    const library = sites.dpLibraryUrl ?? 'https://sefaria.org';
    const voices = sites.dpVoicesUrl ?? 'https://voices.sefaria.org';
    const developers = sites.dpDevelopersUrl ?? 'https://developers.sefaria.org';
    expect(items.map((i) => i.href)).toEqual([library, voices, developers, `${library}/products`]);
    expect(['https://sefaria.org', siteLink(MODULE_URLS.EN.LIBRARY, 'https://sefaria.org')]).toContain(library);
    expect(['https://voices.sefaria.org', siteLink(MODULE_URLS.EN.VOICES, 'https://voices.sefaria.org')]).toContain(
      voices
    );
    expect([
      'https://developers.sefaria.org',
      siteLink(MODULE_URLS.EN.DEVELOPERS, 'https://developers.sefaria.org'),
    ]).toContain(developers);
  });

  test('DEV-HDR-010: The links menu closes with Escape', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openLinksMenu();
    await shell.closeLinksMenu();
  });

  test('DEV-HDR-011: The search field shows the platform key hint', async () => {
    const hint = await pm.onDevelopersShell().searchKeyHint();
    const apple = await page.evaluate(() => /mac|iphone|ipad|ipod/i.test(navigator.platform));
    expect(hint).toBe(apple ? '⌘K' : 'CTRL-K');
  });

  test('DEV-HDR-012: "Jump to Content" is the first focusable element and moves focus into the content', async () => {
    const shell = pm.onDevelopersShell();
    await shell.useSkipLink();
    await expect(page).toHaveURL(/#content$/);
    expect(await shell.isFocusInMainContent()).toBe(true);
  });

  test('DEV-HDR-013: An unknown address shows the 404 page with status 404', async () => {
    const shell = pm.onDevelopersShell();
    expect((await pm.onDevelopersCopyPage().httpGet('/no-such-page-e2e')).status).toBe(404);
    await shell.openPath('/no-such-page-e2e');
    expect(await shell.isNotFoundPage()).toBe(true);
    expect(await page.title()).toBe('404 Not Found');
  });

  test('DEV-HDR-014: An unknown docs slug is a 404 inside the portal chrome', async () => {
    const shell = pm.onDevelopersShell();
    expect((await pm.onDevelopersCopyPage().httpGet('/docs/no-such-page-e2e')).status).toBe(404);
    await shell.openPath('/docs/no-such-page-e2e');
    expect(await shell.isNotFoundPage()).toBe(true);
    expect(await shell.headerLinkNames()).toHaveLength(6);
  });

  test('DEV-HDR-015: The header is the same on the home, docs, reference, contact and 404 pages', async () => {
    const shell = pm.onDevelopersShell();
    for (const path of ['/', DOC_PAGES.welcome, '/reference/get-v3-texts', DOC_PAGES.contact, '/no-such-page-e2e']) {
      await shell.openPath(path);
      expect(await shell.headerLinkNames(), path).toEqual([
        'Home',
        'Docs',
        'API Reference',
        'Projects Powered by Sefaria',
        'GitHub',
        'Donate',
        'Get in Touch',
      ]);
    }
  });
});

// The ≤768px header (C6 MobileMenuButton, MobileDrawer, MobileSubnav) at the breakpoint itself, in
// the desktop browsers; the phone projects cover it again under `mobile web/developers/`.
test.describe('Developers Shell, English (768px)', () => {
  test.use({ viewport: { width: 768, height: 900 } });
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test('DEV-HDR-016: The drawer lists the seven links, the two products and the logo', async () => {
    const names = await pm.onDevelopersShell().openMobileNav();
    expect(names).toEqual([
      'Home',
      'Docs',
      'API Reference',
      'Projects Powered by Sefaria',
      'GitHub',
      'Donate',
      'Get in Touch',
      'Sefaria Library',
      'Voices on Sefaria',
      'Developers on Sefaria',
    ]);
  });

  test('DEV-HDR-017: The drawer closes with Escape', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openMobileNav();
    await shell.closeMobileNav();
  });

  test('DEV-HDR-018: The sub-nav button names the page and opens the sidebar', async () => {
    const shell = pm.onDevelopersShell();
    expect(await shell.sidebarBox()).toBeNull();
    expect(await shell.openMobileSubnav()).toBe("Welcome to Sefaria's Technical Documentation");
    expect(await shell.sidebarBox()).not.toBeNull();
    await shell.closeMobileSubnav();
    expect(await shell.sidebarBox()).toBeNull();
  });
});
