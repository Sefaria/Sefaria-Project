import { test, expect } from '@playwright/test';
import { HeaderTestHelpers } from './headerMDL';
import { URLS, SELECTORS, EXTERNAL_URLS, SITE_CONFIGS } from './constantsMDL';

test.describe('Modularization Header Tests', () => {
  let helpers: HeaderTestHelpers;
  
  test.beforeEach(async ({ page }) => {
    helpers = new HeaderTestHelpers(page);
    await helpers.navigateAndHideModals(URLS.LIBRARY);
  });

  test('MOD-H001: Logo navigation functionality (EXPECTED TO FAIL)', async ({ page }) => {
    for (const [siteName, config] of Object.entries(SITE_CONFIGS)) {
      await helpers.navigateAndHideModals(config.url);
      
      // Navigate to Topics, then try to go back via logo
      await helpers.clickAndVerifyNavigation('Topics', /topics/);
      
      const logo = page.getByRole('banner').locator(config.logo);
      await expect(logo).toBeVisible();
      await logo.click();
      await page.waitForLoadState('networkidle');
      
      // This should fail - logos don't navigate home
      await expect(page).toHaveURL(new RegExp(`^${config.url}/?$`));
    }
  });

  test('MOD-H002: Library header navigation and logo', async ({ page }) => {
    const config = SITE_CONFIGS.LIBRARY;
    
    // Test logo visibility
    await expect(page.locator(config.logo)).toBeVisible();
    
    // Test main navigation links
    for (const link of config.mainLinks) {
      await helpers.navigateAndHideModals(config.url);
      await helpers.clickAndVerifyNavigation(link.name, link.expectedUrl);
    }
    
    // Test donate and help link (new tab)
    await helpers.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Donate', EXTERNAL_URLS.DONATE);
  
    await helpers.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Help', EXTERNAL_URLS.HELP);
  });

  test('MOD-H003: Sheets header navigation and elements', async ({ page }) => {
    const config = SITE_CONFIGS.SHEETS;
    await helpers.navigateAndHideModals(config.url);
    
    // Test logo visibility
    await expect(page.locator(config.logo)).toBeVisible();
    
    // Test main navigation links
    for (const link of config.mainLinks) {
      await helpers.navigateAndHideModals(config.url);
      await helpers.clickAndVerifyNavigation(link.name, link.expectedUrl);
    }
    
    // Test donate and help links (new tabs)
    await helpers.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Donate', EXTERNAL_URLS.DONATE);
    
    await helpers.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Help', EXTERNAL_URLS.HELP);
    
    // Test action button (Create)
    await helpers.navigateAndHideModals(config.url);
    await helpers.testActionButton(config);
  });

  test('MOD-H004: Search functionality across both sites', async ({ page }) => {
    // Test Library search
    await helpers.testSearch('Genesis 1:1', /Genesis/);
    
    // Test Sheets search
    await helpers.navigateAndHideModals(URLS.SHEETS);
    await helpers.testSearch('Passover', /search|Passover/);
  });

  test('MOD-H005: Language switcher functionality', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/interface-english/);
    
    await helpers.openDropdown(SELECTORS.ICONS.LANGUAGE);
    await helpers.selectDropdownOption('עברית');
    
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
    await expect(page.getByRole('link', { name: 'מקורות' })).toBeVisible();
  });

  test('MOD-H006: Module switcher navigation', async ({ page }) => {
    await helpers.openDropdown(SELECTORS.ICONS.MODULE_SWITCHER);
    
    // Test Sheets navigation (new tab)
    let newPage = await helpers.selectDropdownOption('Sheets', true);
    await expect(newPage!).toHaveURL(/sheets\.modularization\.cauldron\.sefaria\.org/);
    await newPage!.close();
    
    // Test Developers navigation (new tab)
    await helpers.openDropdown(SELECTORS.ICONS.MODULE_SWITCHER);
    newPage = await helpers.selectDropdownOption('Developers', true);
    await expect(newPage!).toHaveURL(EXTERNAL_URLS.DEVELOPERS);
    await newPage!.close();
  });

  test('MOD-H007: User authentication menu', async ({ page }) => {
    await helpers.openDropdown(SELECTORS.ICONS.USER_MENU);
    await helpers.selectDropdownOption('Log in');
    
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  });

  test('MOD-H008: Browser navigation controls (back/forward buttons)', async ({ page }) => {
    await helpers.clickAndVerifyNavigation('Topics', /topics/);
    
    const topicLink = page.getByRole('link').filter({ hasText: /Jewish Calendar/i }).first();
    if (await topicLink.isVisible()) {
      await topicLink.click();
      await expect(page).toHaveURL(/category/);
      
      await page.goBack();
      await expect(page).toHaveURL(/topics/);
      
      await page.goForward();
      await expect(page).toHaveURL(/category/);
    }
  });

  test('MOD-H009: Keyboard navigation accessibility', async ({ page }) => {
    for (const [siteName, config] of Object.entries(SITE_CONFIGS)) {
      await helpers.navigateAndHideModals(config.url);
      await helpers.testTabOrder(config.tabOrder);
      await helpers.testModuleSwitcherKeyboard();
    }
  });
});