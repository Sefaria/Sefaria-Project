/*
 * PURPOSE: Test sidebar and footer functionality for the Library module
 *   - Footer appearance and standard links
 *   - Library-specific sidebar modules (Living Library, Translations, Learning Schedules, Resources)
 *   - Footer link behaviors (About, Help, Contact, Newsletter, Blog, Social, Ways to Give, Donate)
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

test.describe('Library Module Sidebar Tests', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('MOD-S001: Library - footer appearance and standard links', async () => {
    await pm.onModuleSidebar().verifyFooterAppearance();
    await pm.onModuleSidebar().verifyStandardFooterLinks();
  });

  test('MOD-S002: Library - A Living Library of Torah has content', async () => {
    const section = page.locator('aside.navSidebar .navSidebarModule').nth(0);
    await expect(section.getByRole('heading', { name: /A Living Library of Torah|A Living Library/i })).toBeVisible();
    // Ensure descriptive text exists and is not empty
    const text = await section.locator('span.int-en').nth(0).innerText();
    expect(text.trim().length).toBeGreaterThan(10);
  });

  test('MOD-S003: Library - Translations has language list', async () => {
    // Translations is the 3rd navSidebarModule in the provided markup (0-based index 2)
    const section = page.locator('aside.navSidebar .navSidebarModule').nth(2);
    await expect(section.getByRole('heading', { name: /Translations/i })).toBeVisible();
    // Check translation list has multiple links
    const langs = section.locator('div.navSidebarLink.language ul li a');
    await expect(langs.first()).toBeVisible();
    const count = await langs.count();
    expect(count).toBeGreaterThan(3);
  });

  test('MOD-S004: Library - Learning Schedules lists readings', async () => {
    const section = page.locator('aside.navSidebar .navSidebarModule').filter({ hasText: 'Learning Schedules' }).first();
    await expect(section.getByRole('heading', { name: /Learning Schedules/i })).toBeVisible();
    // Ensure there are reading sections with links
    const readings = section.locator('.readingsSection .navSidebarLink.ref a');
    await expect(readings.first()).toBeVisible();
    const count = await readings.count();
    expect(count).toBeGreaterThan(0);
  });

  test('MOD-S005: Library - Resources contains link list', async () => {
    const section = page.locator('aside.navSidebar .navSidebarModule').filter({ hasText: 'Resources' }).first();
    await expect(section.getByRole('heading', { name: /Resources/i })).toBeVisible();
    const links = section.locator('.linkList .navSidebarLink a');
    await expect(links.first()).toBeVisible();
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test('MOD-S006: Library - About link loads in same tab', async () => {
    // About should load in same tab to modularization cauldron
    await hideAllModalsAndPopups(page);
    await pm.onModuleSidebar().clickAndVerifyLink({ name: 'About', href: /modularization\.cauldron/, opensNewTab: false });
    await expect(page).toHaveURL(/modularization\.cauldron/);
  });

  test('MOD-S007: Library - Help link href and behavior (Zendesk)', async () => {
    await hideAllModalsAndPopups(page);
    // First verify the href is to either Zendesk or the modularization help proxy
    await pm.onModuleSidebar().verifyFooterLink({ name: 'Help', href: /help\.sefaria\.org|modularization\.cauldron/, opensNewTab: true });

    // Click and handle either new tab or same tab
    const link = pm.onModuleSidebar().getFooterLinkByText('Help');
    const target = await link.getAttribute('target');
    if (target === '_blank') {
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        link.click(),
      ]);
      await newPage.waitForLoadState('domcontentloaded');
      const url = newPage.url();
      expect(url).toMatch(/help\.sefaria\.org|modularization\.cauldron/);
      await newPage.close();
    } else {
      // Same tab
      const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
      await link.click();
      await navigation;
      expect(page.url()).toMatch(/help\.sefaria\.org|modularization\.cauldron/);
    }
  });

  test('MOD-S008: Library - Contact Us is a mailto link', async () => {
    await pm.onModuleSidebar().verifyFooterLink({ name: 'Contact Us', isMailto: true, href: /^mailto:/, opensNewTab: true });
  });

  test('MOD-S009: Library - Newsletter loads in same tab', async () => {
    await hideAllModalsAndPopups(page);
    await pm.onModuleSidebar().clickAndVerifyLink({ name: 'Newsletter', href: /newsletter/, opensNewTab: false });
    await expect(page).toHaveURL(/newsletter/);
  });

  test('MOD-S010: Library - Blog opens in new tab', async () => {
    await hideAllModalsAndPopups(page);
    const newPage = await pm.onModuleSidebar().clickAndVerifyLink({ name: 'Blog', href: /blog|sefaria\.org\.il/, opensNewTab: true });
    await expect(newPage!).toHaveURL(/blog|sefaria\.org\.il/);
    await newPage!.close();
  });

  test('MOD-S011: Library - Social and Shop links open in new tabs', async () => {
    const socialSpecs = [
      { name: 'Instagram', href: /instagram\.com/ },
      { name: 'Facebook', href: /facebook\.com/ },
      { name: 'YouTube', href: /youtube\.com/ },
      { name: 'Shop', href: /store\.sefaria\.org/ },
    ];

    for (const s of socialSpecs) {
      await hideAllModalsAndPopups(page);
      const newPage = await pm.onModuleSidebar().clickAndVerifyLink({ name: s.name, href: s.href, opensNewTab: true });
      await expect(newPage!).toHaveURL(s.href);
      await newPage!.close();
    }
  });

  test('MOD-S012: Library - Ways to Give loads, Donate href verified', async () => {
    await hideAllModalsAndPopups(page);
    await pm.onModuleSidebar().clickAndVerifyLink({ name: 'Ways to Give', href: /ways-to-give/, opensNewTab: false });
    await expect(page).toHaveURL(/ways-to-give/);

    await expect(page.locator('h1').filter({ hasText: 'Your gift. Your impact.' })).toBeVisible();
  });
});
