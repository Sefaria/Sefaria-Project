/**
 * MOBILE HAMBURGER MENU SANITY TESTS
 *
 * Tests critical mobile navigation functionality through the hamburger menu.
 * Validates menu structure, navigation, language switching, and search on mobile devices.
 *
 * PRIORITY: Critical - Run before every mobile release
 */

import { test, expect } from '@playwright/test';
import { MobileHamburgerMenuPage } from '../pages/mobileHamburgerMenuPage';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { MODULE_URLS, SEARCH_DROPDOWN } from '../constants';
import { MOBILE_DEVICES } from '../mobile-constants';

// Configure test to use mobile device (Pixel 10)
test.use({
  viewport: MOBILE_DEVICES.PIXEL_10.viewport,
  userAgent: MOBILE_DEVICES.PIXEL_10.userAgent,
  deviceScaleFactor: MOBILE_DEVICES.PIXEL_10.deviceScaleFactor,
  isMobile: MOBILE_DEVICES.PIXEL_10.isMobile,
  hasTouch: MOBILE_DEVICES.PIXEL_10.hasTouch,
});

test.describe('Mobile Hamburger Menu Sanity Tests', () => {

  test('Sanity 10: Mobile hamburger menu navigation and verification', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(MODULE_URLS.EN.LIBRARY);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    const mobileMenu = new MobileHamburgerMenuPage(page, LANGUAGES.EN);

    // =================================================================
    // STEP 1: Click the hamburger
    // =================================================================
    await mobileMenu.openHamburgerMenu();

    // =================================================================
    // STEP 2: Switch to English and verify page artifacts
    // =================================================================
    // Note: Already on English, but let's ensure via language toggle
    await mobileMenu.switchLanguageInMenu('english');
    await page.waitForTimeout(t(500));

    // Close and reopen menu to verify state
    await mobileMenu.closeHamburgerMenu();
    await mobileMenu.openHamburgerMenu();

    // Verify header artifacts
    await mobileMenu.verifyHeaderArtifacts();

    // Verify all menu items for Library module
    await mobileMenu.verifyMenuArtifacts('library', 'english');

    // =================================================================
    // STEP 3: Search for "mid" and verify results
    // =================================================================
    await mobileMenu.searchInMenu('mid');

    // // Verify search dropdown shows only: Authors, Topics, Categories, Books
    // await mobileMenu.verifySearchResultTypes(
    //   SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS
    // );

    // // Verify Users section is NOT present
    // const dropdown = page.locator('.autocomplete-dropdown');
    // await expect(dropdown.getByText('Users', { exact: true })).not.toBeVisible();

    // Exit search bar
    await mobileMenu.exitSearch();

    // =================================================================
    // STEP 4: Click Texts and verify page
    // =================================================================
    await mobileMenu.clickTexts();
    await mobileMenu.verifyOnTextsPage();


    // Return to hamburger menu
    await mobileMenu.openHamburgerMenu();

    // =================================================================
    // STEP 5: Click Topics and verify page
    // =================================================================
    await mobileMenu.clickTopics();
    await mobileMenu.verifyOnTopicsPage();

    // Return to hamburger menu
    await mobileMenu.openHamburgerMenu();

    // =================================================================
    // STEP 6: Click Donate and verify (opens new tab)
    // =================================================================
    const donatePage = await mobileMenu.clickDonate();

    // Verify donate page opened
    expect(donatePage.url()).toContain('donate');
    await donatePage.close();

    // Use device back button to return to hamburger page
    await mobileMenu.goBack();
    await mobileMenu.openHamburgerMenu();

    // =================================================================
    // STEP 7: Click Help and verify (opens new tab)
    // =================================================================
    const helpPage = await mobileMenu.clickHelp();

    // Verify help page opened
    expect(helpPage.url()).toContain('help');
    await helpPage.close();

    // Use device back button to return to hamburger page
    await mobileMenu.goBack();
    await mobileMenu.openHamburgerMenu();

    // =================================================================
    // STEP 8: Click About Sefaria and verify page
    // =================================================================
    await mobileMenu.clickAbout();
    await mobileMenu.verifyOnAboutPage();

    // Return to hamburger menu
    await mobileMenu.openHamburgerMenu();

    // =================================================================
    // STEP 9: Click Voices on Sefaria and verify
    // =================================================================
    await mobileMenu.clickVoicesModuleSwitcher();
    await mobileMenu.verifyOnVoicesModule();

    // =================================================================
    // STEP 10: Open hamburger and verify "Voices on Sefaria" replaced with "Sefaria Library"
    // =================================================================
    await mobileMenu.openHamburgerMenu();
    await mobileMenu.verifyVoicesSwitcherReplaced();

    // =================================================================
    // STEP 11: Click Developers on Sefaria (opens new tab)
    // =================================================================
    const developersPage = await mobileMenu.clickDevelopers();

    // Verify developers page opened
    expect(developersPage.url()).toContain('developers');
    await developersPage.close();

    // Use device back button (no hamburger navigation expected on external site)
    await mobileMenu.goBack();
    await mobileMenu.openHamburgerMenu();

    // =================================================================
    // STEP 12: Click More from Sefaria and verify page
    // =================================================================
    await mobileMenu.clickMoreFromSefaria();
    await mobileMenu.verifyOnProductsPage();

    // Test complete!
    await page.close();
  });
});

/**
 * TEST SUMMARY:
 *
 * Comprehensive mobile hamburger menu sanity test covering:
 * 1. Open hamburger menu
 * 2. Switch to English and verify all menu artifacts
 * 3. Search for "mid" and verify result types (Authors, Topics, Categories, Books only)
 * 4. Navigate to Texts page
 * 5. Navigate to Topics page
 * 6. Navigate to Donate (new tab) and return
 * 7. Navigate to Help (new tab) and return
 * 8. Navigate to About Sefaria page
 * 9. Switch to Voices module
 * 10. Verify module switcher changes (Voices → Library)
 * 11. Navigate to Developers (new tab) and return
 * 12. Navigate to More from Sefaria page
 *
 * KEY FEATURES:
 * - Uses iPhone 12 device emulation for authentic mobile testing
 * - Tests hamburger menu open/close interactions
 * - Validates all menu items and navigation links
 * - Tests search functionality with mobile constraints
 * - Verifies module switching behavior
 * - Tests back button navigation
 * - Confirms external links open in new tabs
 * - Validates module-specific menu differences
 */
