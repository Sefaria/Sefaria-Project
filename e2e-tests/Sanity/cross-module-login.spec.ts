import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithUser, goToPageWithLang, hideAllModalsAndPopups, isUserLoggedIn, openHeaderDropdown, selectDropdownOption } from "../utils";
import { BROWSER_SETTINGS, LANGUAGES, testUser } from '../globals';
import { MODULE_URLS, MODULE_SELECTORS } from '../constants';
import { PageManager } from '../pages/pageManager';

test.describe('Cross-Module Login Scenarios', () => {

  test('Scenario 1: Login on Library, verify logged in state and remain on Library', async ({ context }) => {
    // Start as not logged in
    let page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    await hideAllModalsAndPopups(page);

    // Verify initially not logged in
    expect(await isUserLoggedIn(page)).toBe(false);

    // Navigate to login page
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');

    // Fill in login credentials
    const loginPage = pm.onLoginPage();
    await loginPage.loginAs(testUser);

    // Wait for login to complete and profile pic to appear
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Explicitly wait for profile pic to ensure login completed
    const profilePic = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await profilePic.waitFor({ state: 'visible', timeout: 10000 });

    // Verify user is logged in
    expect(await isUserLoggedIn(page)).toBe(true);

    // Verify still on Library
    expect(page.url()).toContain(MODULE_URLS.EN.LIBRARY);

    // Verify header shows logged in state
    const profileImg = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();

    // Verify user menu has logged in options
    await openHeaderDropdown(page, 'user');
    const logoutOption = page.locator('.dropdownLinks-menu a', { hasText: 'Log out' });
    await expect(logoutOption).toBeVisible();
  });

  test('Scenario 2: Login on Library, switch to Voices via Module Switcher, verify logged in on Voices', async ({ context }) => {
    // Start already logged in on Library (using auth state)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

    // Verify logged in on Library
    expect(await isUserLoggedIn(page)).toBe(true);

    // Switch to Voices using module switcher
    await openHeaderDropdown(page, 'module');
    const voicesPage = await selectDropdownOption(page, 'Voices', true);

    // Wait for Voices to load
    await voicesPage!.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(voicesPage!);

    // Verify user is on Voices
    expect(voicesPage!.url()).toContain(MODULE_URLS.EN.VOICES);

    // Verify logged in on Voices
    expect(await isUserLoggedIn(voicesPage!)).toBe(true);

    // Verify header shows logged in state
    const profileImg = voicesPage!.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();

    // Verify user menu has logged in options
    await openHeaderDropdown(voicesPage!, 'user');
    const logoutOption = voicesPage!.locator('.dropdownLinks-menu a', { hasText: 'Log out' });
    await expect(logoutOption).toBeVisible();

    await voicesPage!.close();
  });

  test('Scenario 3: Login on Voices, switch to Library via Module Switcher, verify logged in on Library', async ({ context }) => {
    // Start already logged in on Voices (using auth state)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

    // Verify logged in on Voices
    expect(await isUserLoggedIn(page)).toBe(true);

    // Switch to Library using module switcher
    await openHeaderDropdown(page, 'module');
    const libraryPage = await selectDropdownOption(page, 'Library', true);

    // Wait for Library to load
    await libraryPage!.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(libraryPage!);

    // Verify user is on Library
    expect(libraryPage!.url()).toContain(MODULE_URLS.EN.LIBRARY);

    // Verify logged in on Library
    expect(await isUserLoggedIn(libraryPage!)).toBe(true);

    // Verify header shows logged in state
    const profileImg = libraryPage!.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();

    // Verify user menu has logged in options
    await openHeaderDropdown(libraryPage!, 'user');
    const logoutOption = libraryPage!.locator('.dropdownLinks-menu a', { hasText: 'Log out' });
    await expect(logoutOption).toBeVisible();

    await libraryPage!.close();
  });

  test('Scenarios 4: Multiple Library tabs - attempt login on second tab shows error', async ({ context }) => {
    // Test Scenario 4: Multiple Library tabs
    // Open first Library tab (not logged in)
    const libraryTab1 = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    await hideAllModalsAndPopups(libraryTab1);

    // Open second Library tab (not logged in)
    const libraryTab2 = await context.newPage();
    await libraryTab2.goto(MODULE_URLS.EN.LIBRARY);
    await hideAllModalsAndPopups(libraryTab2);

    // Verify both tabs not logged in
    expect(await isUserLoggedIn(libraryTab1)).toBe(false);
    expect(await isUserLoggedIn(libraryTab2)).toBe(false);

    // Log in on first tab
    await openHeaderDropdown(libraryTab1, 'user');
    await selectDropdownOption(libraryTab1, 'Log in');
    const pm1 = new PageManager(libraryTab1, LANGUAGES.EN);
    await pm1.onLoginPage().loginAs(testUser);
    await libraryTab1.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(libraryTab1);

    // Verify first tab is logged in
    expect(await isUserLoggedIn(libraryTab1)).toBe(true);

    // Try to navigate to login on second tab
    await libraryTab2.goto(`${MODULE_URLS.EN.LIBRARY}/login?next=%2Ftexts`);
    await libraryTab2.waitForLoadState('networkidle');

    // Verify error message appears
    const errorText = libraryTab2.locator('text=/You are already logged in as/i');
    await expect(errorText).toBeVisible({ timeout: 10000 });

    await libraryTab1.close();
    await libraryTab2.close();
  });
  test('Scenario 5: Multiple Voices tabs - attempt login on second tab shows error', async ({ context }) => {
    // Test Scenario 5: Multiple Voices tabs
    // Open first Voices tab (not logged in)
    const voicesTab1 = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    await hideAllModalsAndPopups(voicesTab1);

    // Open second Voices tab (not logged in)
    const voicesTab2 = await context.newPage();
    await voicesTab2.goto(MODULE_URLS.EN.VOICES);
    await hideAllModalsAndPopups(voicesTab2);

    // Verify both tabs not logged in
    expect(await isUserLoggedIn(voicesTab1)).toBe(false);
    expect(await isUserLoggedIn(voicesTab2)).toBe(false);

    // Log in on first tab
    await openHeaderDropdown(voicesTab1, 'user');
    await selectDropdownOption(voicesTab1, 'Log in');
    const pm2 = new PageManager(voicesTab1, LANGUAGES.EN);
    await pm2.onLoginPage().loginAs(testUser);
    await voicesTab1.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(voicesTab1);

    // Verify first tab is logged in
    expect(await isUserLoggedIn(voicesTab1)).toBe(true);

    // Try to navigate to login on second tab
    await voicesTab2.goto(`${MODULE_URLS.EN.VOICES}/login?next=%2F`);
    await voicesTab2.waitForLoadState('networkidle');

    // Verify error message appears
    const errorTextVoices = voicesTab2.locator('text=/You are already logged in as/i');
    await expect(errorTextVoices).toBeVisible({ timeout: 10000 });

    await voicesTab1.close();
    await voicesTab2.close();
  });

  test('Scenarios 6: Login on Library, try login on previously opened Voices tab', async ({ context }) => {
    // Test Scenario 6: Login on Library, try login on previously opened Voices tab
    // Open Library tab (not logged in)
    const libraryTab = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    await hideAllModalsAndPopups(libraryTab);

    // Open Voices tab (not logged in)
    const voicesTab = await context.newPage();
    await voicesTab.goto(MODULE_URLS.EN.VOICES);
    await hideAllModalsAndPopups(voicesTab);

    // Verify both tabs not logged in
    expect(await isUserLoggedIn(libraryTab)).toBe(false);
    expect(await isUserLoggedIn(voicesTab)).toBe(false);

    // Log in on Library tab
    await openHeaderDropdown(libraryTab, 'user');
    await selectDropdownOption(libraryTab, 'Log in');
    const pm1 = new PageManager(libraryTab, LANGUAGES.EN);
    await pm1.onLoginPage().loginAs(testUser);
    await libraryTab.waitForLoadState('networkidle');

    await hideAllModalsAndPopups(libraryTab);
    // Wait for profile pic to appear (indicates login success)
    await libraryTab.locator('.header .profile-pic').waitFor({ state: 'visible', timeout: 10000 });

    // Verify Library tab is logged in
    expect(await isUserLoggedIn(libraryTab)).toBe(true);

    // Try to navigate to login on Voices tab
    await voicesTab.goto(`${MODULE_URLS.EN.VOICES}/login?next=%2F`);
    await voicesTab.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(voicesTab);

    // Verify error message appears
    const errorText1 = voicesTab.locator('text=/You are already logged in as/i');
    await expect(errorText1).toBeVisible({ timeout: 10000 });

    await libraryTab.close();
    await voicesTab.close();
  });
  test('Scenarios 7: Login on Voices, try login on previously opened Library tab', async ({ context }) => {
    // Test Scenario 7: Login on Voices, try login on previously opened Library tab
    // Open Library tab (not logged in)
    const libraryTab2 = await context.newPage();
    await libraryTab2.goto(MODULE_URLS.EN.LIBRARY);
    await hideAllModalsAndPopups(libraryTab2);

    // Open Voices tab (not logged in)
    const voicesTab2 = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    await hideAllModalsAndPopups(voicesTab2);

    // Verify both tabs not logged in
    expect(await isUserLoggedIn(libraryTab2)).toBe(false);
    expect(await isUserLoggedIn(voicesTab2)).toBe(false);

    // Log in on Voices tab
    await openHeaderDropdown(voicesTab2, 'user');
    await selectDropdownOption(voicesTab2, 'Log in');
    const pm2 = new PageManager(voicesTab2, LANGUAGES.EN);
    await pm2.onLoginPage().loginAs(testUser);
    await voicesTab2.waitForLoadState('networkidle');

    // Wait for profile pic to appear (indicates login success)
    await voicesTab2.locator('.header .profile-pic').waitFor({ state: 'visible', timeout: 10000 });
    await hideAllModalsAndPopups(voicesTab2);

    // Verify Voices tab is logged in
    expect(await isUserLoggedIn(voicesTab2)).toBe(true);

    // Try to navigate to login on Library tab
    await libraryTab2.goto(`${MODULE_URLS.EN.LIBRARY}/login?next=%2Ftexts`);
    await libraryTab2.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(libraryTab2);

    // Verify error message appears
    const errorText2 = libraryTab2.locator('text=/You are already logged in as/i');
    await expect(errorText2).toBeVisible({ timeout: 10000 });

    await libraryTab2.close();
    await voicesTab2.close();
  });

  test('Scenario 8: Logged in Library user navigates to sheet link, opens in Voices while logged in', async ({ context }) => {
    // Start already logged in on Library (using auth state)
    const page = await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

    // Verify logged in on Library
    expect(await isUserLoggedIn(page)).toBe(true);

    // Navigate to a sheet link (simulating external navigation like from Google)
    // Using a known public sheet
    await page.goto(`${MODULE_URLS.EN.VOICES}/sheets/510219`);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Verify navigation to Voices module with sheet
    expect(page.url()).toContain(MODULE_URLS.EN.VOICES);
    expect(page.url()).toContain('/sheets/');

    // Verify user is still logged in on Voices
    expect(await isUserLoggedIn(page)).toBe(true);

    // Verify Voices logo is visible
    const voicesLogo = page.locator(MODULE_SELECTORS.LOGO.VOICES);
    await expect(voicesLogo).toBeVisible();

    // Verify header shows logged in state
    const profileImg = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();
  });

  test('Scenario 9: Logged in Voices user navigates to text link, opens in Library while logged in', async ({ context }) => {
    // Start already logged in on Voices (using auth state)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

    // Verify logged in on Voices
    expect(await isUserLoggedIn(page)).toBe(true);

    // Navigate to a text link (simulating external navigation like from Google)
    // Using a known text
    await page.goto(`${MODULE_URLS.EN.LIBRARY}/Genesis.1`);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Verify navigation to Library module with text
    expect(page.url()).toContain(MODULE_URLS.EN.LIBRARY);
    expect(page.url()).toContain('Genesis');

    // Verify user is still logged in on Library
    expect(await isUserLoggedIn(page)).toBe(true);

    // Verify Library logo is visible
    const libraryLogo = page.locator(MODULE_SELECTORS.LOGO.LIBRARY);
    await expect(libraryLogo).toBeVisible();

    // Verify header shows logged in state
    const profileImg = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();
  });

});
