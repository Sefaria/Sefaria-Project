import { Page } from '@playwright/test';
import { test, expect, pageFetch } from '../fixtures';
import { findAccount } from '../env';
import { AccountSettingsPage } from '../../pages/accountSettingsPage';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { openHeaderDropdown, selectDropdownOption, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { SUITE, addListing, closeOwnContexts, openAs, developerState, openSettings, other, savedSettings, selectedOption } from './accountFixtures';

const PASSWORD = 'password';
const GAUTH = 'gauth';
const HEBREW = 'hebrew';

type Server = { name: string; host?: string };
const SERVERS: Server[] = [
  { name: 'flag on' },
  { name: 'flag off', host: 'flagoff.gateway.test' },
];

/** Waits for the profile POST a Save provokes and returns its form payload. */
function profilePost(page: Page) {
  return page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/api/profile', { timeout: t(30000) })
    .then(r => JSON.parse(new URLSearchParams(r.postData() || '').get('json') || '{}'));
}

/** Clicks Save, accepts the alert, and waits for the reload the change triggers. */
async function saveAndReload(page: Page) {
  const reloaded = page.waitForEvent('load', { timeout: t(60000) });
  await new AccountSettingsPage(page, LANGUAGES.EN).saveSettings();
  await reloaded;
  await expect(page.locator('#accountSettingsPage')).toBeAttached({ timeout: t(45000) });
}

/** Presses Tab from the page heading and describes where focus lands each time. */
async function tabStops(page: Page, presses = 3): Promise<string[]> {
  await page.locator('#accountSettingsPage h1').click();
  const stops: string[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return 'body';
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return `${el.tagName.toLowerCase()}#${el.id}.${el.className}|${el.textContent?.trim().slice(0, 30)}|visible=${visible}`;
    }));
  }
  return stops;
}

/** Marks the current document, so a later check can tell an in-app navigation from a page load. */
const markDocument = (page: Page) => page.evaluate(() => { (window as any).__accountE2eDocument = true; });
const sameDocument = (page: Page) => page.evaluate(() => (window as any).__accountE2eDocument === true);

/** Follows the header's Texts link, which ReaderApp handles without a page load, then goes Back. */
async function leaveThroughHeaderAndComeBack(page: Page) {
  await markDocument(page);
  await hideAllModalsAndPopups(page);
  await page.locator('.header a[href="/texts"]').first().click();
  await page.waitForURL(/\/texts(\/|$|\?)/, { timeout: t(30000) });
  await page.goBack();
  await page.waitForURL(/\/settings\//, { timeout: t(30000) });
  await expect(page.locator('#accountSettingsPage')).toBeAttached({ timeout: t(30000) });
  expect(await sameDocument(page), 'the header link and Back stayed in one document').toBe(true);
}

test.afterEach(async () => { await closeOwnContexts(); });

test.describe('account settings: password account', () => {
  test.describe.configure({ mode: 'default', timeout: t(240000) });

  for (const server of SERVERS) {
    test(`B2: notifications, reading history and custom persist after a reload (${server.name})`, async ({ account, browser, target }) => {
      test.skip(!!server.host && !target.hasFlagOffServer, 'The flag-off server exists only on the local stack.');
      const { page } = await openAs(account, browser, target, PASSWORD, { host: server.host });
      await openSettings(page);
      if (server.host) await expect(page.locator('[data-agent-action="open-developer-settings"]')).toHaveCount(0);
      const settingsPage = new AccountSettingsPage(page, LANGUAGES.EN);

      const notifications = other(await selectedOption(page, 'emailNotifications'), ['daily', 'weekly', 'never'] as const);
      const readingHistory = other(await selectedOption(page, 'readingHistory'), ['true', 'false'] as const);
      const custom = other(await selectedOption(page, 'textualCustom'), ['sephardi', 'ashkenazi'] as const);
      await settingsPage.changeSettings({
        emailNotifications: notifications,
        readingHistory: readingHistory === 'true',
        textualCustom: custom,
      });
      const posted = profilePost(page);
      await settingsPage.saveSettings();
      const body = await posted;
      expect(body.settings).toMatchObject({
        email_notifications: notifications,
        reading_history: readingHistory === 'true',
        textual_custom: custom,
      });
      expect(body.settings, 'library_assistant is sent only when it changed').not.toHaveProperty('library_assistant');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator(`#emailNotifications .toggleOption[data-value="${notifications}"]`)).toHaveClass(/\bon\b/, { timeout: t(30000) });
      await expect(page.locator(`#readingHistory .toggleOption[data-value="${readingHistory}"]`)).toHaveClass(/\bon\b/);
      await expect(page.locator(`#textualCustom .toggleOption[data-value="${custom}"]`)).toHaveClass(/\bon\b/);
      if (target.name === 'local') {
        expect(savedSettings(PASSWORD)).toMatchObject({
          email_notifications: notifications,
          reading_history: readingHistory === 'true',
          textual_custom: custom,
        });
      }
    });

    test(`B2: the Library Assistant setting persists (${server.name})`, async ({ account, browser, target }) => {
      test.skip(!!server.host && !target.hasFlagOffServer, 'The flag-off server exists only on the local stack.');
      const { page } = await openAs(account, browser, target, PASSWORD, { host: server.host });
      await openSettings(page);
      const settingsPage = new AccountSettingsPage(page, LANGUAGES.EN);
      const original = await selectedOption(page, 'libraryAssistantSetting');

      for (const value of [other(original, ['true', 'false'] as const), original === 'false' ? 'false' : 'true']) {
        await settingsPage.selectLibraryAssistant(value === 'true');
        const posted = profilePost(page);
        await saveAndReload(page);
        expect((await posted).settings.library_assistant).toBe(value === 'true');
        await expect(page.locator(`#libraryAssistantSetting .toggleOption[data-value="${value}"]`)).toHaveClass(/\bon\b/, { timeout: t(30000) });
        if (target.name === 'local') expect(savedSettings(PASSWORD).library_assistant).toBe(value === 'true');
      }
    });

    test(`B2: the site language persists, and switching back restores English (${server.name})`, async ({ account, browser, target }) => {
      test.skip(!!server.host && !target.hasFlagOffServer, 'The flag-off server exists only on the local stack.');
      const { page } = await openAs(account, browser, target, PASSWORD, { host: server.host });
      await openSettings(page);
      const settingsPage = new AccountSettingsPage(page, LANGUAGES.EN);
      await expect(page.locator('#siteLanguage .toggleOption[data-value="english"]')).toHaveClass(/\bon\b/);

      try {
        await settingsPage.selectSiteLanguage('hebrew');
        await saveAndReload(page);
        await expect(page.locator('#siteLanguage .toggleOption[data-value="hebrew"]')).toHaveClass(/\bon\b/, { timeout: t(30000) });
        await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
        if (target.name === 'local') expect(savedSettings(PASSWORD).interface_language).toBe('hebrew');
      } finally {
        if (await page.locator('#siteLanguage .toggleOption[data-value="english"]').getAttribute('aria-checked') !== 'true') {
          await settingsPage.selectSiteLanguage('english');
          await saveAndReload(page);
        }
      }
      await expect(page.locator('#siteLanguage .toggleOption[data-value="english"]')).toHaveClass(/\bon\b/, { timeout: t(30000) });
      await expect(page.locator('body')).toHaveClass(/interface-english/);
      if (target.name === 'local') expect(savedSettings(PASSWORD).interface_language).toBe('english');
    });
  }

  test('N-C6: Tab moves focus through the Account tab when no listing question waits (control)', async ({ account, browser, target }) => {
    const { page } = await openAs(account, browser, target, PASSWORD);
    await openSettings(page);
    const stops = await tabStops(page);
    test.info().annotations.push({ type: 'evidence', description: `focus after each Tab: ${stops.join(' -> ')}` });
    expect(new Set(stops).size).toBe(3);
    for (const stop of stops) expect(stop).toMatch(/visible=true$/);
  });

  test('N-M3: the UMN-004 flow (user menu, Account Settings, change, Save) works on the branch', async ({ account, browser, target }) => {
    const { page } = await openAs(account, browser, target, PASSWORD);
    await page.goto('/texts', { waitUntil: 'domcontentloaded', timeout: t(60000) });
    await page.waitForFunction(() => !!(window as any).Sefaria, null, { timeout: t(45000) });
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Account Settings');
    await hideAllModalsAndPopups(page);
    await page.waitForURL(/\/settings\/account/, { timeout: t(30000) });

    const settingsPage = new AccountSettingsPage(page, LANGUAGES.EN);
    await settingsPage.verifyPageLoaded();
    await settingsPage.verifyEmailDisplayed(findAccount(SUITE, PASSWORD).email);
    await settingsPage.changeSettings({ emailNotifications: 'weekly', readingHistory: true, textualCustom: 'ashkenazi' });
    await settingsPage.saveSettings();
  });

  test('N-C7: after Save, a header link and Back show the saved values, and a second Save keeps them @known-gap S4', async ({ account, browser, target }) => {
    const { page } = await openAs(account, browser, target, PASSWORD);
    await openSettings(page);
    const settingsPage = new AccountSettingsPage(page, LANGUAGES.EN);
    const notifications = other(await selectedOption(page, 'emailNotifications'), ['daily', 'weekly', 'never'] as const);
    await settingsPage.selectEmailNotificationFrequency(notifications);
    await settingsPage.saveSettings();

    await leaveThroughHeaderAndComeBack(page);
    const shownAfterBack = await selectedOption(page, 'emailNotifications');

    await settingsPage.saveSettings();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#accountSettingsPage')).toBeAttached({ timeout: t(45000) });
    const savedAfterSecondSave = await selectedOption(page, 'emailNotifications');
    if (target.name === 'local') {
      test.info().annotations.push({ type: 'evidence', description: `stored after the second Save: ${savedSettings(PASSWORD).email_notifications}` });
    }

    expect(shownAfterBack, 'Back shows the value saved before leaving').toBe(notifications);
    expect(savedAfterSecondSave, 'a second Save does not revert the first').toBe(notifications);
  });
});

test.describe('account settings: Hebrew interface', () => {
  test.describe.configure({ timeout: t(180000) });
  test('N-M2: the change-email fields have Hebrew placeholders @known-gap N-M2', async ({ account, browser, target }) => {
    const { page } = await openAs(account, browser, target, HEBREW, { lang: 'hebrew' });
    await openSettings(page);
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
    await page.locator('#change-email').click();
    await expect(page.locator('#username-change-edit')).toBeVisible();
    expect.soft(await page.locator('#username-change-edit #email').getAttribute('placeholder')).toBe('כתובת דוא״ל חדשה');
    expect.soft(await page.locator('#username-change-edit #confirmEmail').getAttribute('placeholder')).toBe('וידוא כתובת מייל חדשה');
    expect.soft(await page.locator('#username-change-edit #confirmPassword').getAttribute('placeholder')).toBe('סיסמא');
  });
});

test.describe('account settings: developer with a listing waiting', () => {
  test.describe.configure({ mode: 'default', timeout: t(240000) });

  let page: Page;
  let listingId: number;

  test.beforeEach(async ({ account, browser, target }) => {
    test.skip(target.name !== 'local', 'The listing fixture is made through the local stack database.');
    ({ page } = await openAs(account, browser, target, GAUTH));
    await openSettings(page);
    let state = await developerState(page);
    if (!state.developerEnabled) {
      const enabled = await pageFetch(page, '/api/developer/enable', { method: 'POST' });
      expect(enabled.status, enabled.text).toBe(200);
    }
    if (!state.profile) {
      const profile = await pageFetch(page, '/api/developer/profile', {
        method: 'POST',
        body: { profile: { developerName: 'Account Gauth', description: 'Temporary end-to-end test profile.', termsAccepted: true } },
      });
      expect(profile.status, profile.text).toBe(200);
    }
    state = await developerState(page);
    listingId = state.yourListing?.id ?? addListing(GAUTH, `Account listing ${Date.now().toString(36)}`).id;
    await openSettings(page);
    expect((await developerState(page)).yourListing?.id).toBe(listingId);
  });

  test('N-C6: Tab moves focus through the Account tab while a listing question waits on the hidden Developer tab @known-gap S2', async () => {
    const stops = await tabStops(page);
    test.info().annotations.push({ type: 'evidence', description: `focus after each Tab: ${stops.join(' -> ')}` });
    expect(new Set(stops).size, 'each Tab moves focus somewhere new').toBe(3);
    for (const stop of stops) expect(stop, 'focus lands on a visible element').toMatch(/visible=true$/);
  });

  test('N-C7: a key made on the page is listed after a header link and Back, and history.state holds no full key value @known-gap S4', async () => {
    let state = await developerState(page);
    if (!state.projects.length) {
      const created = await pageFetch(page, '/api/developer/projects', {
        method: 'POST',
        body: { project: { name: 'E2E account gauth project', description: 'Temporary end-to-end test project.', websiteUrl: 'https://site-a.example.com', visibility: 'private' } },
      });
      expect(created.status, created.text).toBe(200);
      state = created.json;
    }
    const project = state.projects[0];
    for (const key of project.keys) {
      const revoked = await pageFetch(page, `/api/developer/keys/${key.id}`, { method: 'DELETE' });
      expect(revoked.status, revoked.text).toBe(200);
    }

    const baseline = await pageFetch(page, `/api/developer/projects/${project.id}/keys`, { method: 'POST', body: { label: 'N-C7 loaded with the page' } });
    expect(baseline.status, 'baseline key created').toBe(200);
    const baselineKey = baseline.json.projects.find((p: any) => p.id === project.id).keys.find((k: any) => k.id === baseline.json.keyId);

    const dev = new DeveloperSettingsPage(page, 'english');
    await dev.goto();
    await expect(dev.listingDialog()).toBeVisible({ timeout: t(30000) });
    await dev.action('listing-not-now').click();
    await expect(dev.listingDialog()).toBeHidden();
    await dev.expandProject(project.name);
    const label = `N-C7 ${Date.now().toString(36)}`;
    await dev.createKey(dev.projectCard(project.name), label);
    const madeKey = (await developerState(page)).projects.find((p: any) => p.id === project.id).keys.find((k: any) => k.label === label);
    expect(!!madeKey, 'the key exists on the server').toBe(true);

    try {
      await markDocument(page);
      await hideAllModalsAndPopups(page);
      await page.locator('.header a[href="/texts"]').first().click();
      await page.waitForURL(/\/texts(\/|$|\?)/, { timeout: t(30000) });
      const stateWhileAway = await page.evaluate(() => JSON.stringify(history.state ?? null));
      await page.goBack();
      await page.waitForURL(/\/settings\/developer/, { timeout: t(30000) });
      expect(await sameDocument(page), 'the header link and Back stayed in one document').toBe(true);
      const stateAfterBack = await page.evaluate(() => JSON.stringify(history.state ?? null));
      const keyListed = await dev.keyRow(dev.projectCard(project.name), label).count();
      const valueKept = [stateWhileAway, stateAfterBack].some(s => s.includes(madeKey.value) || s.includes(baselineKey.value));
      const anyValueKept = /sfr_[A-Za-z0-9]{8,}/.test(stateAfterBack);
      test.info().annotations.push({ type: 'evidence', description: `after Back: key row listed=${keyListed > 0}; new key value in history.state=${valueKept}; any sfr_ value in history.state=${anyValueKept}` });

      expect.soft(keyListed, 'the key made before leaving is listed after Back').toBeGreaterThan(0);
      expect.soft(valueKept || anyValueKept, 'history.state holds no full key value').toBe(false);
    } finally {
      for (const key of [madeKey, baselineKey]) await pageFetch(page, `/api/developer/keys/${key.id}`, { method: 'DELETE' });
    }
  });

  test('N-C6: switching from the Account tab to the Developer tab asks about the listing (control)', async () => {
    const dev = new DeveloperSettingsPage(page, 'english');
    await dev.developerTabLink().first().click();
    await page.waitForURL(/\/settings\/developer/, { timeout: t(30000) });
    await expect(dev.listingDialog()).toBeVisible({ timeout: t(10000) });
  });

  test('N-C6: Escape on the Account tab leaves the listing question for the Developer tab @known-gap S2', async () => {
    await page.locator('#accountSettingsPage h1').click();
    await page.keyboard.press('Escape');
    const dev = new DeveloperSettingsPage(page, 'english');
    await dev.developerTabLink().first().click();
    await page.waitForURL(/\/settings\/developer/, { timeout: t(30000) });
    await expect(dev.listingDialog(), 'the listing question is still asked').toBeVisible({ timeout: t(10000) });
    expect((await developerState(page)).yourListing?.id).toBe(listingId);
  });
});
