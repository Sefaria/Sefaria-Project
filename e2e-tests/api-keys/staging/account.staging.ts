// /settings/account (the React page phase 1 ships to every user): each control saves, survives a reload, and is put
// back. Signs in as the throwaway account from staging-smoke-creds.sh (STAGING_CREDS_DIR, default the same directory
// the script writes: $XDG_CONFIG_HOME or ~/.config, then sefaria-apikeys-smoke). Only exists after the merge: on
// master's staging the old page has no #accountSettingsPage, and the first test says so.
//
// Not automated here (they send mail or need a Google account): the email change and the Google disconnect. Use the
// Claude-in-Chrome prompts in STAGING-TESTS.md for those.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect, Page } from '@playwright/test';

const defaultCreds = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'sefaria-apikeys-smoke'
);
const CREDS = (process.env.STAGING_CREDS_DIR || defaultCreds).replace(/^~(?=\/|$)/, os.homedir());
const sessionFile = path.join(CREDS, 'session-cookie');

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!fs.existsSync(sessionFile)) {
    throw new Error(
      `no ${sessionFile}: run scripts/release/api-keys-phase1/staging-smoke-creds.sh first (or set STAGING_CREDS_DIR)`
    );
  }
});

test.beforeEach(async ({ context, baseURL }) => {
  const host = new URL(baseURL!).hostname;
  await context.addCookies([
    {
      name: 'sessionid',
      value: fs.readFileSync(sessionFile, 'utf8').trim(),
      domain: host,
      path: '/',
      secure: true,
      httpOnly: true,
    },
  ]);
});

/** Waits until React has hydrated the page (the Save button carries React's props): clicks before that do nothing. */
async function hydrated(page: Page) {
  await expect(page.locator('#accountSettingsPage'), 'the phase 1 account page is on this server').toBeAttached({
    timeout: 45_000,
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#accountSettingsPage .saveAccountSettingsBtn');
      return !!el && Object.keys(el).some((k) => /^__react(Props|EventHandlers|Fiber|InternalInstance)\$/.test(k));
    },
    null,
    { timeout: 45_000 }
  );
}

async function openSettings(page: Page) {
  const r = await page.goto('/settings/account');
  expect(
    r?.status(),
    'signed in, /settings/account answers 200 (a redirect means the session file is stale: re-run the creds script)'
  ).toBe(200);
  await hydrated(page);
}

const selected = (page: Page, id: string) => page.locator(`#${id} .toggleOption.on`).first().getAttribute('data-value');

async function choose(page: Page, id: string, value: string) {
  const option = page.locator(`#${id} .toggleOption[data-value="${value}"]`);
  await option.click();
  await expect(option).toHaveClass(/\bon\b/);
}

/** Saves; waits for the profile POST and its confirmation dialog, then for the response to finish. */
async function save(page: Page) {
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/profile'
  );
  const dialog = page.waitForEvent('dialog', { timeout: 30_000 });
  await page.locator('#accountSettingsPage .saveAccountSettingsBtn').filter({ visible: true }).first().click();
  const response = await saved;
  // Accept the alert first: while it is open the page is paused, and reading the response would hang.
  await (await dialog).accept();
  expect(response.status(), 'POST /api/profile').toBe(200);
  await response.finished();
}

/** Saves, then lands on a freshly loaded, hydrated page (whether or not the change reloads the page by itself). */
async function saveAndReopen(page: Page) {
  // Some changes (Library Assistant, language) reload the page after the alert; wait for that reload when it comes,
  // so the next navigation never races it. A change that does not reload simply lets the wait time out.
  const reloaded = page.waitForEvent('load', { timeout: 10_000 }).catch(() => null);
  await save(page);
  await reloaded;
  await openSettings(page);
}

// Each control: [section id, its options]. The page must show every one of them.
const CONTROLS: [string, string[]][] = [
  ['emailNotifications', ['daily', 'weekly', 'never']],
  ['readingHistory', ['true', 'false']],
  ['textualCustom', ['sephardi', 'ashkenazi']],
  ['libraryAssistantSetting', ['true', 'false']],
];

test('the page renders every control, with no page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openSettings(page);
  for (const id of [...CONTROLS.map((c) => c[0]), 'siteLanguage']) {
    await expect(page.locator(`#${id}`), `#${id} is on the page`).toBeVisible();
  }
  await expect(page.locator('#change-email'), 'the change-email control').toBeVisible();
  expect(errors).toEqual([]);
});

for (const [id, options] of CONTROLS) {
  test(`${id}: a change saves, survives a reload, and is put back`, async ({ page }) => {
    await openSettings(page);
    const original = await selected(page, id);
    const next = options.find((o) => o !== original)!;
    try {
      await choose(page, id, next);
      await saveAndReopen(page);
      await expect(page.locator(`#${id} .toggleOption[data-value="${next}"]`)).toHaveClass(/\bon\b/, {
        timeout: 45_000,
      });
    } finally {
      // Put the account back even when the check above failed.
      if (original) {
        await openSettings(page);
        if ((await selected(page, id)) !== original) {
          await choose(page, id, original);
          await saveAndReopen(page);
          await expect(page.locator(`#${id} .toggleOption[data-value="${original}"]`)).toHaveClass(/\bon\b/, {
            timeout: 45_000,
          });
        }
      }
    }
  });
}

test('site language: Hebrew saves and switches the interface, then English is restored', async ({ page }) => {
  // A language change reloads the page by itself after Save; wait for that load instead of navigating over it.
  const switchTo = async (lang: 'hebrew' | 'english') => {
    await openSettings(page);
    if ((await selected(page, 'siteLanguage')) === lang) return;
    await choose(page, 'siteLanguage', lang);
    const reloaded = page.waitForEvent('load', { timeout: 60_000 });
    await save(page);
    await reloaded;
    await expect(page.locator('body')).toHaveClass(new RegExp(`interface-${lang}`), { timeout: 45_000 });
  };
  try {
    await switchTo('hebrew');
  } finally {
    await switchTo('english');
  }
});

test('developer settings stay hidden (the flag is off)', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('[data-agent-action="open-developer-settings"]')).toHaveCount(0);
  const r = await page.request.get('/settings/developer', { maxRedirects: 0 });
  expect([302, 404], `/settings/developer answered ${r.status()}`).toContain(r.status());
});
