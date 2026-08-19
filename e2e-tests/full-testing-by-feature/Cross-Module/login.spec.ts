import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithUser, goToPageWithLang, hideAllModalsAndPopups, isUserLoggedIn, openHeaderDropdown, selectDropdownOption } from "../../utils";
import { BROWSER_SETTINGS, LANGUAGES, testUser, t } from '../../globals';
import { MODULE_URLS, MODULE_SELECTORS } from '../../constants';
import { PageManager } from '../../pages/pageManager';

// ⚠️ Tripwire: XMOD-L04–L07 perform parallel UI logins as testUser. This works
// today only because Sefaria's Django config does NOT regenerate sibling
// sessions on fresh login — the new session is created without invalidating
// the on-disk sessionid that other concurrent workers are using. If Sefaria
// ever tightens that policy (e.g. SESSION_SAVE_EVERY_REQUEST=True with session
// regeneration, or stricter same-email enforcement), this file becomes the
// next chrome-sanity flake. Mitigation when that happens: switch the UI
// logins to enAdmin (already the destructive-auth throwaway profile per
// CLAUDE.md rule §2.21) or page.route-intercept /login. See README §14
// "Destructive auth tests".

test.describe('Cross-Module — Login & auth persistence', () => {

  test('XMOD-L01: Login on Library, verify logged in state and remain on Library', { tag: '@sanity' }, async ({ context }) => {
    // Start as not logged in
    let page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Verify initially not logged in
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(false);

    // Navigate to login page
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');

    // Fill in login credentials
    const loginPage = pm.onLoginPage();
    await loginPage.loginAs(testUser);

    // Wait for login to complete and profile pic to appear
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);

    // Explicitly wait for profile pic to ensure login completed
    const profilePic = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await profilePic.waitFor({ state: 'visible', timeout: t(10000) });

    // Verify user is logged in
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(true);

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

  test('XMOD-L02: Login on Library, switch to Voices via Module Switcher, verify logged in on Voices', { tag: '@sanity' }, async ({ context }) => {
    // Start already logged in on Library (using auth state)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enUser);

    // Verify logged in on Library
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(true);

    // Switch to Voices using module switcher
    await openHeaderDropdown(page, 'module');
    const voicesPage = await selectDropdownOption(page, 'Voices', true);

    // Wait for Voices to load
    await voicesPage!.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(voicesPage!);

    // Verify user is on Voices
    expect(voicesPage!.url()).toContain(MODULE_URLS.EN.VOICES);

    // Verify logged in on Voices
    await expect.poll(() => isUserLoggedIn(voicesPage!), { timeout: t(30000) }).toBe(true);

    // Verify header shows logged in state
    const profileImg = voicesPage!.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();

    // Verify user menu has logged in options
    await openHeaderDropdown(voicesPage!, 'user');
    const logoutOption = voicesPage!.locator('.dropdownLinks-menu a', { hasText: 'Log out' });
    await expect(logoutOption).toBeVisible();

    await voicesPage!.close();
  });

  test('XMOD-L03: Login on Voices, switch to Library via Module Switcher, verify logged in on Library', async ({ context }) => {
    // Start already logged in on Voices (using auth state)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);

    // Verify logged in on Voices
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(true);

    // Switch to Library using module switcher
    await openHeaderDropdown(page, 'module');
    const libraryPage = await selectDropdownOption(page, 'Library', true);

    // Wait for Library to load
    await libraryPage!.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(libraryPage!);

    // Verify user is on Library
    expect(libraryPage!.url()).toContain(MODULE_URLS.EN.LIBRARY);

    // Verify logged in on Library
    await expect.poll(() => isUserLoggedIn(libraryPage!), { timeout: t(30000) }).toBe(true);

    // Verify header shows logged in state
    const profileImg = libraryPage!.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();

    // Verify user menu has logged in options
    await openHeaderDropdown(libraryPage!, 'user');
    const logoutOption = libraryPage!.locator('.dropdownLinks-menu a', { hasText: 'Log out' });
    await expect(logoutOption).toBeVisible();

    await libraryPage!.close();
  });

  test('XMOD-L04: Multiple Library tabs - /login on the second tab redirects an already-authenticated user home', async ({ context }) => {
    // XMOD-L04: Multiple Library tabs
    // Open first Library tab (not logged in)
    const libraryTab1 = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);

    // Open second Library tab (not logged in)
    const libraryTab2 = await context.newPage();
    await libraryTab2.goto(MODULE_URLS.EN.LIBRARY);
    await hideAllModalsAndPopups(libraryTab2);

    // Verify both tabs not logged in
    await expect.poll(() => isUserLoggedIn(libraryTab1), { timeout: t(30000) }).toBe(false);
    await expect.poll(() => isUserLoggedIn(libraryTab2), { timeout: t(30000) }).toBe(false);

    // Log in on first tab
    await openHeaderDropdown(libraryTab1, 'user');
    await selectDropdownOption(libraryTab1, 'Log in');
    const pm1 = new PageManager(libraryTab1, LANGUAGES.EN);
    await pm1.onLoginPage().loginAs(testUser);
    await libraryTab1.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(libraryTab1);

    // Verify first tab is logged in. AuthPage submits with fetch and swaps the
    // view in place, so there is no navigation for loginAs to await — a
    // one-shot read can land before the header re-renders.
    await expect.poll(() => isUserLoggedIn(libraryTab1), { timeout: t(30000) }).toBe(true);

    // Try to navigate to login on second tab
    await libraryTab2.goto(`${MODULE_URLS.EN.LIBRARY}/login?next=%2Ftexts`);
    await libraryTab2.waitForLoadState('domcontentloaded');

    // A logged-in GET to /login no longer renders the old Django template's
    // "You are already logged in as <user>" notice — that template was removed
    // with the SSO work. CustomLoginView.get (sefaria/views.py) now redirects an
    // authenticated request straight to "/" (the ?next= param is not honoured on
    // that branch); the Library module then serves its home at /texts. Assert we
    // left /login, stayed in-module, and kept the session — not an exact path.
    await expect(libraryTab2).not.toHaveURL(/\/login/, { timeout: t(10000) });
    expect(libraryTab2.url().startsWith(MODULE_URLS.EN.LIBRARY)).toBe(true);
    await expect.poll(() => isUserLoggedIn(libraryTab2), { timeout: t(30000) }).toBe(true);

    await libraryTab1.close();
    await libraryTab2.close();
  });
  test('XMOD-L05: Multiple Voices tabs - /login on the second tab redirects an already-authenticated user home', async ({ context }) => {
    // XMOD-L05: Multiple Voices tabs
    // Open first Voices tab (not logged in)
    const voicesTab1 = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);

    // Open second Voices tab (not logged in)
    const voicesTab2 = await context.newPage();
    await voicesTab2.goto(MODULE_URLS.EN.VOICES);
    await hideAllModalsAndPopups(voicesTab2);

    // Verify both tabs not logged in
    await expect.poll(() => isUserLoggedIn(voicesTab1), { timeout: t(30000) }).toBe(false);
    await expect.poll(() => isUserLoggedIn(voicesTab2), { timeout: t(30000) }).toBe(false);

    // Log in on first tab
    await openHeaderDropdown(voicesTab1, 'user');
    await selectDropdownOption(voicesTab1, 'Log in');
    const pm2 = new PageManager(voicesTab1, LANGUAGES.EN);
    await pm2.onLoginPage().loginAs(testUser);
    await voicesTab1.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(voicesTab1);

    // See XMOD-L04 — poll rather than read once.
    await expect.poll(() => isUserLoggedIn(voicesTab1), { timeout: t(30000) }).toBe(true);

    // Try to navigate to login on second tab
    await voicesTab2.goto(`${MODULE_URLS.EN.VOICES}/login?next=%2F`);
    await voicesTab2.waitForLoadState('domcontentloaded');

    // See XMOD-L04: an authenticated /login GET redirects to "/" instead of
    // rendering the removed "already logged in" notice.
    await expect(voicesTab2).not.toHaveURL(/\/login/, { timeout: t(10000) });
    expect(voicesTab2.url().startsWith(MODULE_URLS.EN.VOICES)).toBe(true);
    await expect.poll(() => isUserLoggedIn(voicesTab2), { timeout: t(30000) }).toBe(true);

    await voicesTab1.close();
    await voicesTab2.close();
  });

  test('XMOD-L06: Login on Library, try login on previously opened Voices tab', async ({ context }) => {
    // XMOD-L06: Login on Library, try login on previously opened Voices tab
    // Open Library tab (not logged in)
    const libraryTab = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);

    // Open Voices tab (not logged in)
    const voicesTab = await context.newPage();
    await voicesTab.goto(MODULE_URLS.EN.VOICES);
    await hideAllModalsAndPopups(voicesTab);

    // Verify both tabs not logged in
    await expect.poll(() => isUserLoggedIn(libraryTab), { timeout: t(30000) }).toBe(false);
    await expect.poll(() => isUserLoggedIn(voicesTab), { timeout: t(30000) }).toBe(false);

    // Log in on Library tab
    await openHeaderDropdown(libraryTab, 'user');
    await selectDropdownOption(libraryTab, 'Log in');
    const pm1 = new PageManager(libraryTab, LANGUAGES.EN);
    await pm1.onLoginPage().loginAs(testUser);
    await libraryTab.waitForLoadState('domcontentloaded');

    await hideAllModalsAndPopups(libraryTab);
    // Wait for profile pic to appear (indicates login success)
    await libraryTab.locator('.header .profile-pic').waitFor({ state: 'visible', timeout: t(10000) });

    // Verify Library tab is logged in
    await expect.poll(() => isUserLoggedIn(libraryTab), { timeout: t(30000) }).toBe(true);

    // Try to navigate to login on Voices tab
    await voicesTab.goto(`${MODULE_URLS.EN.VOICES}/login?next=%2F`);
    await voicesTab.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(voicesTab);

    // See XMOD-L04: an authenticated /login GET redirects to "/" instead of
    // rendering the removed "already logged in" notice. The session was
    // established on Library and must carry across to the Voices subdomain.
    await expect(voicesTab).not.toHaveURL(/\/login/, { timeout: t(10000) });
    expect(voicesTab.url().startsWith(MODULE_URLS.EN.VOICES)).toBe(true);
    await expect.poll(() => isUserLoggedIn(voicesTab), { timeout: t(30000) }).toBe(true);

    await libraryTab.close();
    await voicesTab.close();
  });
  test('XMOD-L07: Login on Voices, try login on previously opened Library tab', async ({ context }) => {
    // XMOD-L07: Login on Voices, try login on previously opened Library tab
    // Open Library tab (not logged in)
    const libraryTab2 = await context.newPage();
    await libraryTab2.goto(MODULE_URLS.EN.LIBRARY);
    await hideAllModalsAndPopups(libraryTab2);

    // Open Voices tab (not logged in)
    const voicesTab2 = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);

    // Verify both tabs not logged in
    await expect.poll(() => isUserLoggedIn(libraryTab2), { timeout: t(30000) }).toBe(false);
    await expect.poll(() => isUserLoggedIn(voicesTab2), { timeout: t(30000) }).toBe(false);

    // Log in on Voices tab
    await openHeaderDropdown(voicesTab2, 'user');
    await selectDropdownOption(voicesTab2, 'Log in');
    const pm2 = new PageManager(voicesTab2, LANGUAGES.EN);
    await pm2.onLoginPage().loginAs(testUser);
    await voicesTab2.waitForLoadState('domcontentloaded');

    // Wait for profile pic to appear (indicates login success)
    await voicesTab2.locator('.header .profile-pic').waitFor({ state: 'visible', timeout: t(10000) });
    await hideAllModalsAndPopups(voicesTab2);

    // Verify Voices tab is logged in
    await expect.poll(() => isUserLoggedIn(voicesTab2), { timeout: t(30000) }).toBe(true);

    // Try to navigate to login on Library tab
    await libraryTab2.goto(`${MODULE_URLS.EN.LIBRARY}/login?next=%2Ftexts`);
    await libraryTab2.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(libraryTab2);

    // See XMOD-L04: an authenticated /login GET redirects to "/" instead of
    // rendering the removed "already logged in" notice. The session was
    // established on Voices and must carry across to the Library subdomain.
    await expect(libraryTab2).not.toHaveURL(/\/login/, { timeout: t(10000) });
    expect(libraryTab2.url().startsWith(MODULE_URLS.EN.LIBRARY)).toBe(true);
    await expect.poll(() => isUserLoggedIn(libraryTab2), { timeout: t(30000) }).toBe(true);

    await libraryTab2.close();
    await voicesTab2.close();
  });

  test('XMOD-L08: Logged in Library user navigates to sheet link, opens in Voices while logged in', { tag: '@sanity' }, async ({ context }) => {
    // Start already logged in on Library (using auth state)
    const page = await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);

    // Verify logged in on Library
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(true);

    // Navigate to a sheet link (simulating external navigation like from Google)
    // Using a known public sheet
    await page.goto(`${MODULE_URLS.EN.VOICES}/sheets/510219`);
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);

    // Verify navigation to Voices module with sheet
    expect(page.url()).toContain(MODULE_URLS.EN.VOICES);
    expect(page.url()).toContain('/sheets/');

    // Verify user is still logged in on Voices
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(true);

    // Verify Voices logo is visible
    const voicesLogo = page.locator(MODULE_SELECTORS.LOGO.VOICES);
    await expect(voicesLogo).toBeVisible();

    // Verify header shows logged in state
    const profileImg = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();
  });

  test('XMOD-L09: Logged in Voices user navigates to text link, opens in Library while logged in', { tag: '@sanity' }, async ({ context }) => {
    // Start already logged in on Voices (using auth state)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);

    // Verify logged in on Voices
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(true);

    // Navigate to a text link (simulating external navigation like from Google)
    // Using a known text
    await page.goto(`${MODULE_URLS.EN.LIBRARY}/Genesis.1`);
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);

    // Verify navigation to Library module with text
    expect(page.url()).toContain(MODULE_URLS.EN.LIBRARY);
    expect(page.url()).toContain('Genesis');

    // Verify user is still logged in on Library
    await expect.poll(() => isUserLoggedIn(page), { timeout: t(30000) }).toBe(true);

    // Verify Library logo is visible
    const libraryLogo = page.locator(MODULE_SELECTORS.LOGO.LIBRARY);
    await expect(libraryLogo).toBeVisible();

    // Verify header shows logged in state
    const profileImg = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await expect(profileImg).toBeVisible();
  });

});
