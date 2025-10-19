import { test, expect, Page } from '@playwright/test';
import SidebarTestHelpers from './sidebarMDL';
import { UtilTestHelpers } from './utilsMDL';
import { hideAllModalsAndPopups } from '../utils';
import { URLS, EXTERNAL_URLS, SITE_CONFIGS } from './constantsMDL';

test.describe('Modularization Sidebar Tests', () => {
  let sidebar: SidebarTestHelpers;
  let utils: UtilTestHelpers;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarTestHelpers(page);
    utils = new UtilTestHelpers(page);
    await utils.navigateAndHideModals(URLS.LIBRARY);
  });

  test('MOD-S013: Voices sidebar - modules and buttons', async ({ page }) => {
    // Navigate to Voices site
    await utils.navigateAndHideModals(URLS.VOICES);

    // Verify Voices modules and descriptive text
    await sidebar.verifyModuleHasText('What is Voices on Sefaria?');
    await sidebar.verifyModuleHasText('Create');
    await sidebar.verifyModuleHasText('Get Updates');

    // Verify Learn More button exists and links to a sheet or page
    await sidebar.verifyModuleButton({ headingText: 'What is Voices on Sefaria?', buttonText: 'Learn More', href: /\/sheets\// });

    // Verify Create button leads to new sheet
    await sidebar.verifyModuleButton({ headingText: 'Create', buttonText: 'Create', href: /\/sheets\/new|\/sheets\//, isRoleButton: false });

    // Verify Subscribe button points to newsletter
    await sidebar.verifyModuleButton({ headingText: 'Get Updates', buttonText: 'Subscribe', href: /newsletter|sefar/ });

    // Return to Library
    await utils.navigateAndHideModals(URLS.LIBRARY);
  });

  test('MOD-S001: Footer appearance and standard links', async ({ page }) => {
    await sidebar.verifyFooterAppearance();
    await sidebar.verifyStandardFooterLinks();
  });

  test('MOD-S002: Sidebar sections - A Living Library of Torah has content', async ({ page }) => {
    const section = page.locator('aside.navSidebar .navSidebarModule').nth(0);
    await expect(section.getByRole('heading', { name: /A Living Library of Torah|A Living Library/i })).toBeVisible();
    // Ensure descriptive text exists and is not empty
    const text = await section.locator('span.int-en').nth(0).innerText();
    expect(text.trim().length).toBeGreaterThan(10);
  });

  test('MOD-S003: Sidebar sections - Translations has language list', async ({ page }) => {
    // Translations is the 3rd navSidebarModule in the provided markup (0-based index 2)
    const section = page.locator('aside.navSidebar .navSidebarModule').nth(2);
    await expect(section.getByRole('heading', { name: /Translations/i })).toBeVisible();
    // Check translation list has multiple links
    const langs = section.locator('div.navSidebarLink.language ul li a');
    await expect(langs.first()).toBeVisible();
    const count = await langs.count();
    expect(count).toBeGreaterThan(3);
  });

  test('MOD-S004: Sidebar sections - Learning Schedules lists readings', async ({ page }) => {
    const section = page.locator('aside.navSidebar .navSidebarModule').filter({ hasText: 'Learning Schedules' }).first();
    await expect(section.getByRole('heading', { name: /Learning Schedules/i })).toBeVisible();
    // Ensure there are reading sections with links
    const readings = section.locator('.readingsSection .navSidebarLink.ref a');
    await expect(readings.first()).toBeVisible();
    const count = await readings.count();
    expect(count).toBeGreaterThan(0);
  });

  test('MOD-S005: Sidebar sections - Resources contains link list', async ({ page }) => {
    const section = page.locator('aside.navSidebar .navSidebarModule').filter({ hasText: 'Resources' }).first();
    await expect(section.getByRole('heading', { name: /Resources/i })).toBeVisible();
    const links = section.locator('.linkList .navSidebarLink a');
    await expect(links.first()).toBeVisible();
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test('MOD-S006: About link loads in same tab', async ({ page }) => {
    // About should load in same tab to modularization cauldron
    await hideAllModalsAndPopups(page);
    await sidebar.clickAndVerifyLink({ name: 'About', href: /modularization\.cauldron/, opensNewTab: false });
    await expect(page).toHaveURL(/modularization\.cauldron/);

    // Return to Library for subsequent tests
    await utils.navigateAndHideModals(URLS.LIBRARY);
  });

  test('MOD-S007: Help link href and behavior (Zendesk)', async ({ page }) => {
    await hideAllModalsAndPopups(page);
    // First verify the href is to either Zendesk or the modularization help proxy
    await sidebar.verifyFooterLink({ name: 'Help', href: /help\.sefaria\.org|modularization\.cauldron/, opensNewTab: true });

    // Click and handle either new tab or same tab
    const link = sidebar.getFooterLinkByText('Help');
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
      // same tab
      const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
      await link.click();
      await navigation;
      expect(page.url()).toMatch(/help\.sefaria\.org|modularization\.cauldron/);
      // navigate back to library for next tests
      await page.goBack();
      await utils.navigateAndHideModals(URLS.LIBRARY);
    }
  });

  test('MOD-S008: Contact Us is a mailto link', async ({ page }) => {
    await sidebar.verifyFooterLink({ name: 'Contact Us', isMailto: true, href: /^mailto:/, opensNewTab: true });
  });

  test('MOD-S009: Newsletter loads in same tab', async ({ page }) => {
    await hideAllModalsAndPopups(page);
    await sidebar.clickAndVerifyLink({ name: 'Newsletter', href: /newsletter/, opensNewTab: false });
    await expect(page).toHaveURL(/newsletter/);
    await utils.navigateAndHideModals(URLS.LIBRARY);
  });

  test('MOD-S010: Blog opens in new tab', async ({ page }) => {
    await hideAllModalsAndPopups(page);
    const newPage = await sidebar.clickAndVerifyLink({ name: 'Blog', href: /blog|sefaria\.org\.il/, opensNewTab: true });
    await expect(newPage!).toHaveURL(/blog|sefaria\.org\.il/);
    await newPage!.close();
  });

  test('MOD-S011: Social and Shop links open in new tabs', async ({ page }) => {
    const socialSpecs = [
      { name: 'Instagram', href: /instagram\.com/ },
      { name: 'Facebook', href: /facebook\.com/ },
      { name: 'YouTube', href: /youtube\.com/ },
      { name: 'Shop', href: /store\.sefaria\.org/ },
    ];

    for (const s of socialSpecs) {
      await hideAllModalsAndPopups(page);
      const newPage = await sidebar.clickAndVerifyLink({ name: s.name, href: s.href, opensNewTab: true });
      await expect(newPage!).toHaveURL(s.href);
      await newPage!.close();
    }
  });

  test('MOD-S012: Ways to Give loads, Donate href verified', async ({ page }) => {
    await hideAllModalsAndPopups(page);
    await sidebar.clickAndVerifyLink({ name: 'Ways to Give', href: /ways-to-give/, opensNewTab: false });
    await expect(page).toHaveURL(/ways-to-give/);

    // Return to Library then verify Donate href only (Donate may redirect or be proxied)
    await utils.navigateAndHideModals(URLS.LIBRARY);
    await hideAllModalsAndPopups(page);
    await sidebar.verifyFooterLink({ name: 'Donate', href: /donate\.sefaria\.org/, opensNewTab: false });
  });
});
