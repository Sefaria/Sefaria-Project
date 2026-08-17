import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t, testUser } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * Mobile auth flow — Library module (English).
 *
 * Covers the hamburger → Log in / Sign up / Forgot-password / Logout journey.
 * Source of truth is the React `AuthPage` state machine
 * (static/js/auth/AuthPage.jsx and siblings under static/js/auth/). Both
 * `/login` and `/register` land on `ChooseView` (provider buttons +
 * "Continue with Email") before any email/password form is on screen.
 *
 * Each test starts anonymous in `beforeEach` so cases stay independent. The
 * post-login tests (HAM-A004/A005/A006) re-perform the login UI flow rather
 * than re-using a stored auth state — exercising the form is the point of
 * those tests, not a side-quest to set up state.
 */

const ENGLISH_LIBRARY = MODULE_URLS.EN.LIBRARY;
const VOICES_URL_PATTERN = new RegExp(
  MODULE_URLS.EN.VOICES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
);

// ---------------------------------------------------------------------------
// Helpers shared by the post-login tests
// ---------------------------------------------------------------------------

/**
 * Open the hamburger, tap Log in, fill the login form, and wait for the
 * Library landing page. Mirrors what a user does manually and is the only
 * thing HAM-A004 / A005 / A006 share. Keeping it local to the spec (rather
 * than baking it into `MobileHamburgerPage`) preserves the POM's separation:
 * MobileHamburgerPage owns the hamburger; LoginPage owns the form.
 */
async function loginViaHamburger(page: Page, pm: PageManager): Promise<void> {
  await pm.onMobileHamburger().openMenu();
  await pm.onMobileHamburger().clickLogInAndExpectLoginPage();
  await pm.onLoginPage().loginAs(testUser);
  await expect(page).toHaveURL(/\/texts/, { timeout: t(20000) });
  await hideAllModalsAndPopups(page);
  await pm.onMobileHamburger().waitForHeaderReady();
}

// ---------------------------------------------------------------------------
// Pre-login: navigation to login / forgot-password / register pages
// ---------------------------------------------------------------------------

test.describe('Mobile Hamburger — auth navigation (anonymous)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
    await pm.onMobileHamburger().openMenu();
  });

  test('HAM-A001: Tapping Log in navigates to the Sefaria login page', { tag: '@sanity' }, async () => {
    await pm.onMobileHamburger().clickLogInAndExpectLoginPage();
    // /login lands on ChooseView first — "Continue with Email" is always
    // rendered regardless of whether Google/Apple SSO is configured on this
    // sandbox. Click through to the actual email/password form.
    const continueWithEmail = page.getByRole('button', { name: 'Continue with Email' });
    await expect(continueWithEmail).toBeVisible({ timeout: t(5000) });
    await continueWithEmail.tap();

    // Form is rendered with both fields (labeled, not placeholder-only) and
    // the "Log in" submit button.
    await expect(page.getByLabel('Email Address')).toBeVisible({
      timeout: t(5000),
    });
    await expect(page.getByLabel('Password')).toBeVisible({
      timeout: t(5000),
    });
    await expect(page.getByRole('button', { name: /^Log in$/i })).toBeVisible({
      timeout: t(5000),
    });
  });

  test('HAM-A002: From login, "Forgot your password?" navigates to the reset page; back button returns to login', { tag: '@sanity' }, async () => {
    await pm.onMobileHamburger().clickLogInAndExpectLoginPage();
    await page.getByRole('button', { name: 'Continue with Email' }).tap();

    const forgotLink = page.getByRole('link', { name: /Forgot Password\?/i });
    await expect(forgotLink).toBeVisible({ timeout: t(5000) });
    await forgotLink.tap();

    // The reset request view is an in-page AuthPage state, not a separate
    // route — the URL stays /login throughout.
    await expect(page).toHaveURL(/\/login/, { timeout: t(15000) });
    await expect(
      page.getByRole('heading', { name: /^Forgot Password\?$/i }),
    ).toBeVisible({ timeout: t(10000) });

    // Returning is the in-card back arrow (AuthCard's onBack), not browser
    // history — no new URL was pushed for this view transition.
    await page.getByRole('button', { name: 'Back' }).tap();
    await expect(
      page.getByRole('heading', { name: /^Log in$/i }),
    ).toBeVisible({ timeout: t(10000) });
  });

  test('HAM-A003: From login, "Sign Up" navigates to register; "Log in" crosslink returns to login', async () => {
    await pm.onMobileHamburger().clickLogInAndExpectLoginPage();

    const createLink = page.getByRole('link', { name: /Sign Up/i });
    await expect(createLink).toBeVisible({ timeout: t(5000) });
    await createLink.tap();
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/register/, { timeout: t(15000) });
    // ChooseView's register heading is "Create Account", not "Sign Up" — the
    // hamburger link and card heading use different copy by design.
    await expect(
      page.getByRole('heading', { name: /^Create Account$/i }),
    ).toBeVisible({ timeout: t(10000) });

    // Crossing flows (register -> login) is a real product link, not browser
    // history — use it directly rather than assuming a pushState round-trip.
    const logInLink = page.getByRole('link', { name: /^Log In$/i });
    await expect(logInLink).toBeVisible({ timeout: t(5000) });
    await logInLink.tap();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/login/, { timeout: t(15000) });
    await expect(
      page.getByRole('heading', { name: /^Log in$/i }),
    ).toBeVisible({ timeout: t(10000) });
  });
});

// ---------------------------------------------------------------------------
// Post-login: hamburger state changes after a successful login
// ---------------------------------------------------------------------------

test.describe('Mobile Hamburger — logged-in state (mobile login flow)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
  });

  test('HAM-A004: Submitting valid credentials lands on /texts and the hamburger shows Logout', async () => {
    test.setTimeout(t(90000));

    await loginViaHamburger(page, pm);

    await pm.onMobileHamburger().openMenu();
    await pm.onMobileHamburger().expectLogoutPresentAndSignupAbsent();
  });

  test('HAM-A005: After login, the Voices module hamburger also shows Logout', async () => {
    test.setTimeout(t(90000));

    await loginViaHamburger(page, pm);

    // Reach Voices via the cross-module switcher. The session cookie is set on
    // the parent domain (see fixCookieDomainsForCrossSubdomain in utils.ts), so
    // the popup tab arrives on voices.* already authenticated.
    await pm.onMobileHamburger().openMenu();
    const voicesPage = await pm
      .onMobileHamburger()
      .clickVoicesOnSefariaAndExpectVoicesModule(VOICES_URL_PATTERN);

    const voicesPm = new PageManager(voicesPage, LANGUAGES.EN);
    await hideAllModalsAndPopups(voicesPage);
    await voicesPm.onMobileHamburger().waitForHeaderReady();
    await voicesPm.onMobileHamburger().openMenu();
    await voicesPm.onMobileHamburger().expectLogoutPresentAndSignupAbsent();

    await voicesPage.close();
  });

  test('HAM-A006: Tapping Logout reverts the hamburger to Sign up / Log in', async () => {
    test.setTimeout(t(90000));

    await loginViaHamburger(page, pm);

    await pm.onMobileHamburger().openMenu();
    await pm.onMobileHamburger().expectLogoutPresentAndSignupAbsent();
    await pm.onMobileHamburger().clickLogoutAndExpectLoggedOut();

    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().openMenu();
    await pm.onMobileHamburger().expectSignupAndLoginPresent();
  });
});
