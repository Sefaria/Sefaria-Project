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

// Group profiles by unique account. Sefaria invalidates concurrent sessions
// for the same user, so we log in each account exactly once and stamp out the
// EN / HE storage-state variants from the same captured cookie set.
const userGroups: { credentials: Credentials; profiles: Profile[]; label: string }[] = [
  { label: 'testUser',      credentials: creds('PLAYWRIGHT_USER_EMAIL', 'PLAYWRIGHT_USER_PASSWORD'),           profiles: [BROWSER_SETTINGS.enUser,   BROWSER_SETTINGS.heUser]  },
  { label: 'testAdminUser', credentials: creds('PLAYWRIGHT_SUPERUSER_EMAIL', 'PLAYWRIGHT_SUPERUSER_PASSWORD'), profiles: [BROWSER_SETTINGS.enAdmin,  BROWSER_SETTINGS.heAdmin] },
  { label: 'testLAUser',    credentials: creds('PLAYWRIGHT_LA_USER_EMAIL', 'PLAYWRIGHT_LA_USER_PASSWORD'),     profiles: [BROWSER_SETTINGS.enLAUser] },
];

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
    await page.locator('input[name="email"]').first()
      .waitFor({ state: 'visible', timeout: t(15000) });

    // If geo still redirected us off-domain, fail loudly rather than time out
    // on getByPlaceholder.
    if (new URL(page.url()).hostname !== baseHost) {
      throw new Error(
        `[global-setup] /login redirected from ${baseHost} to ${new URL(page.url()).hostname}. ` +
        `Check that the interfaceLang cookie applied correctly on the parent domain.`
      );
    }

    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await loginPage.loginAs(credentials);

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

  // Wipe stale auth files exactly once. Workers will only read from this
  // point forward — no race between worker processes, no in-flight login.
  for (const profile of Object.values(BROWSER_SETTINGS)) {
    const filePath = path.join(__dirname, profile.file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  console.log(`[global-setup] Authenticating against ${baseURL}`);

  for (const group of userGroups) {
    const { credentials, profiles, label } = group;
    if (!credentials.email || !credentials.password) {
      console.warn(
        `[global-setup] Skipping ${label}: missing credentials env vars. ` +
        `Auth files [${profiles.map(p => p.file).join(', ')}] will not exist; ` +
        `any test using those profiles will throw a clear error.`
      );
      continue;
    }

    console.log(`[global-setup] Logging in ${label} (${credentials.email})`);
    const baseState = await loginAndCaptureState(baseURL, credentials);

    for (const profile of profiles) {
      const variant = stampVariant(baseState, profile);
      const target = path.join(__dirname, profile.file);
      fs.writeFileSync(target, JSON.stringify(variant, null, 2));
      const hasSession = variant.cookies.some((c: any) => c.name === 'sessionid' && c.value);
      console.log(`[global-setup]   wrote ${profile.file} (sessionid present: ${hasSession})`);
      if (!hasSession) {
        throw new Error(
          `[global-setup] ${label} login produced no sessionid cookie. ` +
          `Check credentials and that ${baseURL}/login is reachable.`
        );
      }
    }
  }

  console.log(`[global-setup] Done.`);
}
