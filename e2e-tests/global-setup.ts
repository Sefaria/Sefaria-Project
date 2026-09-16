import { chromium, devices, FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { LoginPage } from './pages/loginPage';
import { BROWSER_SETTINGS, LANGUAGES, t } from './globals';
import { fixCookieDomainsForCrossSubdomain } from './utils';

type Profile = typeof BROWSER_SETTINGS[keyof typeof BROWSER_SETTINGS];
type Credentials = { email: string; password: string };

// Read credentials live from process.env. playwright.config.ts imports
// './e2e-tests/globals' BEFORE dotenv populates process.env, so the
// `testUser` / `testAdminUser` / `testLAUser` exports are frozen with empty
// strings in the main process where global-setup runs. Workers re-import
// globals fresh (after dotenv has run) and get the real values, which is why
// the bug never surfaced until we started reading creds from the main process.
declare const process: { env: { [key: string]: string | undefined } };
function creds(emailVar: string, passwordVar: string): Credentials {
  return {
    email: process.env[emailVar] ?? '',
    password: process.env[passwordVar] ?? '',
  };
}

// Group profiles by unique account. We log each account in once and stamp out
// its storage-state variants from the same captured cookie set; one login per
// account keeps setup fast. EN/HE variants of the standard user & admin differ
// only by the `interfaceLang` cookie (Hebrew runs anonymously on the `.il`
// domain — the `.org` session cookie isn't sent cross-TLD).
//
// `site` selects the login domain: 'EN' logs in on the English (`.org`) site,
// 'IL' on the Hebrew (`.org.il`) site. The Library Assistant needs a logged-in
// session ON the Hebrew domain, and a logged-in user is server-side-routed to
// the domain matching their account Site-Language — so the Hebrew LA account is
// a SEPARATE, Hebrew-preference account logged in directly on `.org.il`.
const userGroups: { credentials: Credentials; profiles: Profile[]; label: string; site: 'EN' | 'IL' }[] = [
  { label: 'testUser',      credentials: creds('PLAYWRIGHT_USER_EMAIL', 'PLAYWRIGHT_USER_PASSWORD'),           profiles: [BROWSER_SETTINGS.enUser,   BROWSER_SETTINGS.heUser],  site: 'EN' },
  { label: 'testAdminUser', credentials: creds('PLAYWRIGHT_SUPERUSER_EMAIL', 'PLAYWRIGHT_SUPERUSER_PASSWORD'), profiles: [BROWSER_SETTINGS.enAdmin,  BROWSER_SETTINGS.heAdmin], site: 'EN' },
  { label: 'testLAUser',    credentials: creds('PLAYWRIGHT_LA_USER_EMAIL', 'PLAYWRIGHT_LA_USER_PASSWORD'),     profiles: [BROWSER_SETTINGS.enLAUser], site: 'EN' },
  { label: 'testHeLAUser',  credentials: creds('PLAYWRIGHT_LA_USER_HE_EMAIL', 'PLAYWRIGHT_LA_USER_HE_PASSWORD'), profiles: [BROWSER_SETTINGS.heLAUser], site: 'IL' },
];

// Sefaria canonicalizes a bare apex host to its `www.` form (sefariapreprod.org
// -> www.sefariapreprod.org), so a strict hostname comparison flags that normal
// redirect as a failure. What these guards actually care about is the *site*:
// staying on `.org` vs. being geo-bounced to `.org.il`. Compare on the
// www-stripped host so the apex->www hop is a no-op.
const siteHost = (host: string) => host.replace(/^www\./, '');
const sameSite = (a: string, b: string) => siteHost(a) === siteHost(b);

// Wait until the login POST has actually issued a session.
//
// The auth form submits via XHR and re-renders in place, so the browser may still
// be sitting on /login with no navigation pending when `loginAs` returns —
// `waitForLoadState('domcontentloaded')` resolves immediately in that state.
// Navigating before the POST settles cancels it and leaves the context
// anonymous, so gate any post-login navigation on the cookie itself.
async function waitForSessionCookie(page: any, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = await page.context().cookies();
    if (cookies.some((c: any) => c.name === 'sessionid' && c.value)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `No 'sessionid' cookie after ${timeoutMs}ms — the login form was submitted but the ` +
    `server never issued a session (URL: ${page.url()}). Verify the credentials are valid.`
  );
}

// Re-pin the logged-in account's *saved* Site-Language to the language of the
// domain we just authenticated on.
//
// Sefaria's LanguageCookieMiddleware persists `interface_language` onto the user
// profile on every authenticated `?set-language-cookie` hop (sefaria/system/
// middleware.py). So any earlier run that drove a shared account through a
// language switch leaves that choice saved on the account — enAdmin and heAdmin
// are the SAME account, so one Hebrew switch permanently flips it. After that,
// LanguageSettingsMiddleware bounces every `.org` page for that account to
// `.org.il`, where the `.org` session cookie isn't sent and the user looks
// logged out — global-setup's profile-pic oracle then times out even though the
// login itself succeeded and issued a perfectly good `.org` session.
//
// Hitting the param explicitly re-pins the account to this domain's language and
// makes setup self-healing regardless of how the previous run left the account.
// LanguageCookieMiddleware is registered BEFORE LanguageSettingsMiddleware, so it
// sees this request and rewrites the profile before the language router can
// bounce us off-domain.
async function pinAccountSiteLanguage(page: any, baseURL: string) {
  await page.goto(`${baseURL}/texts?set-language-cookie`, {
    waitUntil: 'domcontentloaded',
    timeout: t(30000),
  });
}

async function loginAndCaptureState(baseURL: string, credentials: Credentials) {
  const browser = await chromium.launch();
  try {
    // Match the desktop projects in playwright.config.ts so the page renders
    // the same login form the tests will exercise (Desktop Chrome viewport,
    // US locale + headers — without these Sefaria served a Hebrew-localized
    // variant that hides the English-placeholder form input).
    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      baseURL,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      geolocation: { latitude: 40.7128, longitude: -74.0060 },
      permissions: ['geolocation'],
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    // Pre-seed interfaceLang=english on the parent domain. Without it, Sefaria
    // geo-redirects www.sefaria.org/login -> www.sefaria.org.il/login (Hebrew
    // interface) for some IPs / headless-browser fingerprints, and the
    // English-placeholder selectors in LoginPage no longer match.
    const baseHost = new URL(baseURL).hostname;
    const baseHostParts = baseHost.split('.');
    const baseParentDomain = baseHostParts.length >= 3
      ? '.' + baseHostParts.slice(1).join('.')
      : '.' + baseHost;
    await context.addCookies([{
      name: 'interfaceLang',
      value: LANGUAGES.EN,
      domain: baseParentDomain,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax' as const,
    }]);

    const page = await context.newPage();
    await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: t(30000) });
    // /login lands on AuthPage's ChooseView first (provider buttons + "Continue
    // with Email") — wait for that, not the email field, which only exists once
    // LoginPage.loginAs() clicks through it below.
    await page.getByRole('button', { name: 'Continue with Email' }).first()
      .waitFor({ state: 'visible', timeout: t(15000) });

    // If geo still redirected us off-domain, fail loudly here rather than
    // time out later waiting for the email/password form.
    if (!sameSite(new URL(page.url()).hostname, baseHost)) {
      throw new Error(
        `[global-setup] /login redirected from ${baseHost} to ${new URL(page.url()).hostname}. ` +
        `Check that the interfaceLang cookie applied correctly on the parent domain.`
      );
    }

    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await loginPage.loginAs(credentials);

    await waitForSessionCookie(page, t(30000));
    await pinAccountSiteLanguage(page, baseURL);

    // Authenticated-state oracle: the profile pic only renders for a logged-in
    // user. If this times out, the login failed — fail the whole suite now
    // instead of letting every worker hit a dead session.
    await page
      .locator('.profile-pic, .accountBox, img.profile-pic-image')
      .first()
      .waitFor({ state: 'visible', timeout: t(30000) });

    const state = await context.storageState();
    state.cookies = fixCookieDomainsForCrossSubdomain(state.cookies as any) as any;
    await context.close();
    return state;
  } finally {
    await browser.close();
  }
}

// Native login on the Hebrew (`.org.il`) domain. Used for accounts whose
// Site-Language is Hebrew, so the session is captured on `.org.il` and the user
// stays on the Hebrew domain (a logged-in user is server-side-routed to their
// account-language's domain). Uses name-based input selectors so it works
// regardless of the form's placeholder language.
async function loginAndCaptureStateIL(baseURL: string, credentials: Credentials) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      baseURL,
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      geolocation: { latitude: 31.7683, longitude: 35.2137 }, // Jerusalem
      permissions: ['geolocation'],
      extraHTTPHeaders: { 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.5' },
    });

    // Pin interfaceLang=hebrew on the parent domain so /login renders on `.il`.
    const baseHost = new URL(baseURL).hostname;
    const baseHostParts = baseHost.split('.');
    const baseParentDomain = baseHostParts.length >= 3
      ? '.' + baseHostParts.slice(1).join('.')
      : '.' + baseHost;
    await context.addCookies([{
      name: 'interfaceLang',
      value: LANGUAGES.HE,
      domain: baseParentDomain,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax' as const,
    }]);

    const page = await context.newPage();
    await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: t(30000) });
    // /login lands on AuthPage's ChooseView first — reuse LoginPage's helper
    // rather than re-deriving the Hebrew button label here.
    const loginPage = new LoginPage(page, LANGUAGES.HE);
    await loginPage.clickContinueWithEmail();

    if (!sameSite(new URL(page.url()).hostname, baseHost)) {
      throw new Error(
        `[global-setup] IL /login redirected from ${baseHost} to ${new URL(page.url()).hostname}. ` +
        `Check that the interfaceLang cookie applied on the parent domain.`
      );
    }

    await page.locator('input[name="email"]').first().fill(credentials.email);
    await page.locator('input[name="password"]').first().fill(credentials.password);
    await page.locator('input[name="password"]').first().press('Enter');
    await page.waitForLoadState('domcontentloaded');

    await waitForSessionCookie(page, t(30000));
    await pinAccountSiteLanguage(page, baseURL);

    // Authenticated-state oracle: profile pic only renders for a logged-in user.
    try {
      await page
        .locator('.profile-pic, .accountBox, img.profile-pic-image')
        .first()
        .waitFor({ state: 'visible', timeout: t(30000) });
    } catch {
      const landedHost = new URL(page.url()).hostname;
      if (!sameSite(landedHost, baseHost)) {
        throw new Error(
          `IL login on ${baseHost} did not reach a logged-in state — after submitting the form ` +
          `the browser landed on ${landedHost} (URL: ${page.url()}). This is Sefaria's MDL ` +
          `language router redirecting the user to their account Site-Language's domain, which ` +
          `means this account's Site-Language is NOT Hebrew, so the .org.il session it issues is ` +
          `unusable. Fix: set this account's Settings → Site Language to Hebrew (עברית), or point ` +
          `the PLAYWRIGHT_LA_USER_HE_* credentials at a genuine Hebrew-preference account.`
        );
      }
      throw new Error(
        `IL login on ${baseHost} did not reach a logged-in state (no profile pic after 30s; ` +
        `URL: ${page.url()}). Verify the PLAYWRIGHT_LA_USER_HE_* credentials are valid.`
      );
    }

    const state = await context.storageState();
    state.cookies = fixCookieDomainsForCrossSubdomain(state.cookies as any) as any;
    await context.close();
    return state;
  } finally {
    await browser.close();
  }
}

function stampVariant(baseState: any, profile: Profile) {
  const langValue = profile.lang === LANGUAGES.HE ? LANGUAGES.HE : LANGUAGES.EN;
  const cookies = baseState.cookies.map((c: any) =>
    c.name === 'interfaceLang' ? { ...c, value: langValue } : c,
  );
  if (!cookies.some((c: any) => c.name === 'interfaceLang')) {
    const sessionCookie = cookies.find((c: any) => c.name === 'sessionid');
    cookies.push({
      name: 'interfaceLang',
      value: langValue,
      domain: sessionCookie?.domain || '.sefaria.org',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax' as const,
    });
  }
  return { ...baseState, cookies };
}

export default async function globalSetup(_config: FullConfig) {
  const baseURL = process.env.SANDBOX_URL || 'https://www.sefaria.org';
  const baseURLIL = process.env.SANDBOX_URL_IL || 'https://www.sefaria.org.il';

  // Wipe stale auth files exactly once. Workers will only read from this
  // point forward — no race between worker processes, no in-flight login.
  for (const profile of Object.values(BROWSER_SETTINGS)) {
    const filePath = path.join(__dirname, profile.file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  console.log(`[global-setup] Authenticating against ${baseURL}`);

  // Per-group login is non-fatal: one bad/misconfigured account must not block the
  // suites that don't use it. A failed group leaves its auth file(s) absent on disk;
  // goToPageWithUser then throws a clear, immediate error for any test that needs it.
  const failures: { label: string; files: string[]; reason: string }[] = [];

  for (const group of userGroups) {
    const { credentials, profiles, label } = group;
    if (!credentials.email || !credentials.password) {
      const reason = 'missing credentials env vars (PLAYWRIGHT_*_EMAIL / PLAYWRIGHT_*_PASSWORD)';
      failures.push({ label, files: profiles.map(p => p.file), reason });
      console.warn(
        `[global-setup] SKIPPED ${label}: ${reason}. ` +
        `Auth file(s) [${profiles.map(p => p.file).join(', ')}] will not exist; ` +
        `any test using those profiles will fail immediately with a clear error.`
      );
      continue;
    }

    const loginURL = group.site === 'IL' ? baseURLIL : baseURL;
    console.log(`[global-setup] Logging in ${label} (${credentials.email}) on ${loginURL}`);

    try {
      const baseState = group.site === 'IL'
        ? await loginAndCaptureStateIL(loginURL, credentials)
        : await loginAndCaptureState(loginURL, credentials);

      // Validate the captured session BEFORE writing anything — never persist a
      // logged-out auth file, which would fail tests confusingly downstream.
      const baseHasSession = baseState.cookies.some((c: any) => c.name === 'sessionid' && c.value);
      if (!baseHasSession) {
        throw new Error(
          `login produced no sessionid cookie. Check credentials and that ${loginURL}/login is reachable.`
        );
      }

      for (const profile of profiles) {
        const variant = stampVariant(baseState, profile);
        const target = path.join(__dirname, profile.file);
        fs.writeFileSync(target, JSON.stringify(variant, null, 2));
        console.log(`[global-setup]   wrote ${profile.file}`);
      }
    } catch (e: any) {
      const reason = e?.message ? String(e.message) : String(e);
      failures.push({ label, files: profiles.map(p => p.file), reason });
      console.error(
        `\n[global-setup] FAILED to authenticate ${label} on ${loginURL}.\n` +
        `[global-setup]     Reason: ${reason}\n` +
        `[global-setup]     Auth file(s) NOT written: ${profiles.map(p => p.file).join(', ')}.\n` +
        `[global-setup]     Suites that don't use ${label} will still run; any test that does ` +
        `use it fails immediately with a clear message.\n`
      );
      continue;
    }
  }

  if (failures.length > 0) {
    console.error(
      `[global-setup] Completed with ${failures.length} unavailable profile group(s): ` +
      failures.map(f => f.label).join(', ') + '. See the FAILED/SKIPPED lines above for the reason of each.'
    );
  }
  console.log(`[global-setup] Done.`);
}
