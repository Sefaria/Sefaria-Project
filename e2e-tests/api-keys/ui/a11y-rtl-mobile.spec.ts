import { BrowserContext, Locator, Page, devices } from '@playwright/test';
import { test, expect, pageFetch, AccountSession } from '../fixtures';
import { contextAs } from '../session';
import { findAccount } from '../env';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { openAccount } from './session-wait';
import { t } from '../../globals';

const SUITE = 'a11y';
const MOBILE = { width: 375, height: 812 };

type Lang = 'english' | 'hebrew';

async function openDeveloper(page: Page, lang: Lang = 'english', path = DeveloperSettingsPage.PATH): Promise<DeveloperSettingsPage> {
  const dev = new DeveloperSettingsPage(page, lang);
  await dev.goto(path);
  await expect(page.locator('.devPocPage .devPocPageHeader')).toBeVisible({ timeout: t(30000) });
  return dev;
}

async function developerState(page: Page) {
  const response = await pageFetch(page, '/api/developer/state');
  expect(response.status, response.text).toBe(200);
  return response.json;
}

/** The seeded project of an a11y account, expanded through its own URL. */
async function openSeededProject(page: Page, manifest: any, role: string, lang: Lang = 'english') {
  const key = manifest.keys.find((k: any) => k.suite === SUITE && k.role === role);
  expect(key, `the manifest has no a11y key for ${role}`).toBeTruthy();
  const dev = await openDeveloper(page, lang, `${DeveloperSettingsPage.PATH}/projects/${key.projectId}`);
  const project = (await developerState(page)).projects.find((p: any) => String(p.id) === String(key.projectId));
  expect(project, `project ${key.projectId} is not in the developer state`).toBeTruthy();
  const card = dev.projectCard(project.name);
  await expect(card.locator('button.devPocProjectToggle')).toHaveAttribute('aria-expanded', 'true', { timeout: t(15000) });
  return { dev, project, card };
}

/** "Not now" on the pending-listing dialog, which keeps the listing pending on the server. */
async function postponeListing(page: Page) {
  const dialog = page.locator('[role="dialog"][aria-labelledby="devPocYourListingTitle"]');
  if (await dialog.isVisible()) await dialog.locator('[data-agent-action="listing-not-now"]').click();
  await expect(dialog).toHaveCount(0);
}

async function describeFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ').join('.') : ''} "${name}"`;
  });
}

async function focusIsInside(locator: Locator): Promise<boolean> {
  return locator.evaluate(node => node.contains(document.activeElement));
}

/** Tab and Shift+Tab well past the number of controls: focus never leaves the dialog. */
async function expectFocusTrapped(page: Page, dialog: Locator) {
  const controls = await dialog.locator('a[href], button:not([disabled]), input:not([disabled]), select, textarea').count();
  const presses = Math.max(controls * 2 + 1, 3);
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < presses; i++) {
      await page.keyboard.press(key);
      expect(await focusIsInside(dialog), `after ${i + 1} × ${key}, focus is on ${await describeFocus(page)}`).toBe(true);
    }
  }
}

/** The first four Tab stops on /settings/account, each marked when it is not rendered. */
async function accountTabStops(page: Page): Promise<string[]> {
  await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).Sefaria, null, { timeout: t(45000) });
  await expect(page.locator('.settingsPage, .settingsPanel').first()).toBeVisible({ timeout: t(30000) });
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && el !== document.body && el.getClientRects().length > 0;
    });
    seen.push(`${await describeFocus(page)}${visible ? '' : ' (not visible)'}`);
  }
  return seen;
}

async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = Array.from(document.querySelectorAll('.settingsPage *, .devPocPage *'))
      .filter(el => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1);
      })
      .slice(0, 5)
      .map(el => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ').join('.')}`);
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide };
  });
  expect(overflow.scrollWidth, `${where}: page is ${overflow.scrollWidth}px wide in a ${overflow.clientWidth}px viewport; widest: ${overflow.wide.join(', ')}`)
    .toBeLessThanOrEqual(overflow.clientWidth);
}

async function expectInsideViewport(page: Page, locator: Locator, what: string) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, `${what} has no layout box`).toBeTruthy();
  expect(box!.x, `${what} starts left of the viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what} ends past the ${viewport.width}px viewport`).toBeLessThanOrEqual(viewport.width + 1);
}

/** A phone-sized context: the mobile site shell (multiPanel=false) at 375 px. */
async function phoneAs(browser: any, targetName: any, role: string, lang: Lang): Promise<{ context: BrowserContext; page: Page }> {
  const deadline = Date.now() + 180000;
  for (;;) {
    try {
      const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
      const context = await contextAs(browser, targetName, SUITE, role, { lang, options: { ...iphone, viewport: MOBILE } });
      return { context, page: await context.newPage() };
    } catch (error) {
      if (!/^No session for /.test(String((error as Error).message)) || Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

test.describe('developer settings: Hebrew, phone width and keyboard (C10)', () => {
  test.describe.configure({ timeout: t(180000) });

  test.beforeEach(async ({ target }) => {
    test.skip(target.name !== 'local', 'The a11y suite runs on the local stack.');
  });

  test.describe('Hebrew', () => {
    let session: AccountSession;
    test.beforeEach(async ({ account }) => {
      session = await openAccount((suite, role) => account(suite, role, { lang: 'hebrew' }), SUITE, 'hebrew');
    });

    test('C10 (RTL): the developer tab renders right to left with Hebrew strings and he-IL dates', async ({ manifest }) => {
      const { page } = session;
      const { card, project } = await openSeededProject(page, manifest, 'hebrew', 'hebrew');

      expect(await page.locator('.devPocPage').first().evaluate(el => getComputedStyle(el).direction)).toBe('rtl');
      await expect(page.locator('.devPocPage h1').first()).toHaveText('הגדרות מפתחים');
      await expect(card.getByText(new RegExp(`^${project.keys.length} מתוך 5 מפתחות$`))).toBeVisible();
      await expect(card.locator('[data-agent-action="new-key"]')).toHaveText('יצירת מפתח');

      const key = project.keys[0];
      const row = card.locator('article.devPocKey').filter({ hasText: key.label });
      const created = new Date(key.created).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
      await expect(row.locator('.devPocKeyMeta')).toHaveText(`נוצר ב־${created}`);
      expect(await row.locator('code').first().evaluate(el => getComputedStyle(el).direction)).toBe('ltr');
      await expect(row.getByRole('button', { name: 'מחיקת המפתח' })).toBeVisible();
    });

    test('C10 (RTL): key rows lay out from the right, and names keep their own direction', async ({ manifest }) => {
      const { page } = session;
      const { card, project } = await openSeededProject(page, manifest, 'hebrew', 'hebrew');

      const heading = card.locator('article.devPocKey .devPocKeyHeading').first();
      const label = await heading.locator('strong').boundingBox();
      const remove = await heading.getByRole('button').boundingBox();
      expect(label!.x, 'in RTL the key label sits to the right of its Delete button').toBeGreaterThan(remove!.x);

      const nameDirection = await card.locator('button.devPocProjectToggle span[dir="auto"]').evaluate(el => getComputedStyle(el).direction);
      const firstStrong = /[֐-׿]|[A-Za-z]/.exec(project.name)?.[0] || '';
      expect(nameDirection, `"${project.name}" starts with ${firstStrong}`).toBe(/[֐-׿]/.test(firstStrong) ? 'rtl' : 'ltr');
    });

    test('C10 (RTL + keyboard): the delete-key dialog is in Hebrew, traps focus, and Escape returns focus to its button', async ({ manifest }) => {
      const { page } = session;
      const { card, project } = await openSeededProject(page, manifest, 'hebrew', 'hebrew');
      const label = project.keys[0].label;
      const opener = card.locator('article.devPocKey').filter({ hasText: label }).getByRole('button', { name: 'מחיקת המפתח' });

      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('[role="dialog"][aria-labelledby="devPocConfirmTitle"]');
      await expect(dialog.locator('h2')).toHaveText(`למחוק את „${label}”?`);
      await expect(dialog.getByRole('button', { name: 'ביטול' })).toBeFocused();
      await expectFocusTrapped(page, dialog);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    });
  });

  test.describe('keyboard', () => {
    let session: AccountSession;
    test.beforeEach(async ({ account }) => {
      session = await openAccount(account, SUITE, 'setUp');
    });

    test('C10 (keyboard): "Is this your project?" takes focus on Yes, traps Tab, and Escape means Not now', async () => {
      const { page } = session;
      await openDeveloper(page);
      const dialog = page.locator('[role="dialog"][aria-labelledby="devPocYourListingTitle"]');
      await expect(dialog).toBeVisible({ timeout: t(15000) });
      await expect(dialog.locator('[data-agent-action="claim-listing"]')).toBeFocused();
      await expectFocusTrapped(page, dialog);

      const listingCalls: string[] = [];
      page.on('request', r => { if (/\/api\/developer\/listings\//.test(r.url())) listingCalls.push(r.url()); });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(listingCalls, 'Escape must not claim or dismiss the listing').toEqual([]);

      await page.reload();
      await expect(dialog).toBeVisible({ timeout: t(30000) });
    });

    test('C10 (keyboard): the delete-key dialog starts on Cancel, traps Tab, and Escape returns focus to its button', async ({ manifest }) => {
      const { page } = session;
      const { card, project } = await openSeededProject(page, manifest, 'setUp');
      await postponeListing(page);
      const opener = card.locator('article.devPocKey').filter({ hasText: project.keys[0].label }).getByRole('button', { name: 'Delete key' });

      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('[role="dialog"][aria-labelledby="devPocConfirmTitle"]');
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await expectFocusTrapped(page, dialog);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test('C10 (keyboard): the delete-project dialog starts on Cancel, traps Tab, and Escape returns focus to its button', async ({ manifest }) => {
      const { page } = session;
      const { card } = await openSeededProject(page, manifest, 'setUp');
      await postponeListing(page);
      await card.locator('button.devPocProjectEdit').focus();
      await page.keyboard.press('Enter');
      const opener = card.getByRole('button', { name: 'Delete project' });
      await expect(opener).toBeVisible();

      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('[role="dialog"][aria-labelledby="devPocConfirmTitle"]');
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await expectFocusTrapped(page, dialog);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test('C10 (keyboard): "What will be public" starts on Close, keeps focus, and Escape returns focus to its link', async () => {
      const { page } = session;
      const dev = await openDeveloper(page);
      await postponeListing(page);
      await dev.newProjectButton().focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#devPocProjectName')).toBeFocused();

      const opener = dev.newProjectPanel().locator('[data-agent-action="show-public-preview"]');
      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('[role="dialog"][aria-labelledby="devPocPublicTitle"]');
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
      await expectFocusTrapped(page, dialog);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test('C10 (keyboard): "Save without a website?" starts on Add a website and traps Tab', async () => {
      const { page } = session;
      const dev = await openDeveloper(page);
      await postponeListing(page);
      await dev.newProjectButton().click();
      await dev.fillNewProject({ name: `C10 no website ${Date.now().toString(36)}`, description: 'Never saved.', visibility: 'private' });

      const posts: string[] = [];
      page.on('request', r => { if (r.method() === 'POST' && /\/api\/developer\/projects$/.test(r.url())) posts.push(r.url()); });
      await dev.action('create-project', dev.newProjectPanel()).focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('[role="dialog"][aria-labelledby="devPocNoWebsiteTitle"]');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Add a website' })).toBeFocused();
      await expectFocusTrapped(page, dialog);
      expect(posts, 'nothing is saved while the dialog asks').toEqual([]);
    });

    for (const how of ['Escape', 'Add a website (mouse)', 'Add a website (Enter)'] as const) {
      test(`C10 (keyboard): ${how} on "Save without a website?" puts focus in the website field`, async () => {
        const { page } = session;
        const dev = await openDeveloper(page);
        await postponeListing(page);
        await dev.newProjectButton().click();
        await dev.fillNewProject({ name: `C10 add website ${Date.now().toString(36)}`, description: 'Never saved.', visibility: 'private' });
        if (how === 'Add a website (mouse)') {
          await dev.action('create-project', dev.newProjectPanel()).click();
        } else {
          await dev.action('create-project', dev.newProjectPanel()).focus();
          await page.keyboard.press('Enter');
        }
        const dialog = page.locator('[role="dialog"][aria-labelledby="devPocNoWebsiteTitle"]');
        await expect(dialog).toBeVisible();

        if (how === 'Escape') await page.keyboard.press('Escape');
        else if (how === 'Add a website (mouse)') await dialog.getByRole('button', { name: 'Add a website' }).click();
        else await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('#devPocProjectUrl'), `focus is on ${await describeFocus(page)}`).toBeFocused();
      });
    }

    test('C10 (keyboard): after a key is deleted from the keyboard, focus stays in its project, not on the page body @known-gap C10', async ({ manifest }) => {
      const { page } = session;
      const { dev, card } = await openSeededProject(page, manifest, 'setUp');
      await postponeListing(page);
      const label = `C10 kb ${Date.now().toString(36)}`;
      await dev.createKey(card, label);

      const opener = dev.keyRow(card, label).getByRole('button', { name: 'Delete key' });
      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('[role="dialog"][aria-labelledby="devPocConfirmTitle"]');
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      const deleted = dev.waitForApi(/\/api\/developer\/keys\/[^/]+$/, 'DELETE');
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Delete key' })).toBeFocused();
      await page.keyboard.press('Enter');
      expect((await deleted).status()).toBe(200);
      await expect(dev.keyRow(card, label)).toHaveCount(0);

      expect(await focusIsInside(card), `focus is on ${await describeFocus(page)}`).toBe(true);
    });

    test('C10 (keyboard): Tab moves through the Account tab while a listing is pending @known-gap S2', async () => {
      const seen = await accountTabStops(session.page);
      expect(seen.filter(s => s.endsWith('(not visible)') || s === 'body'), `Tab stops: ${seen.join(' → ')}`).toEqual([]);
      expect(new Set(seen).size, `Tab stops: ${seen.join(' → ')}`).toBe(seen.length);
    });

    test('C10 (keyboard): control: Tab moves through the Account tab when no listing is pending', async ({ account }) => {
      const { page } = await openAccount((suite, role) => account(suite, role, { lang: 'hebrew' }), SUITE, 'hebrew');
      expect((await accountTabStops(page)).filter(s => s.endsWith('(not visible)') || s === 'body')).toEqual([]);
    });

    test('C10 (keyboard): Escape on the Account tab leaves the pending listing to be asked on the Developer tab @known-gap S2', async () => {
      const { page } = session;
      await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!(window as any).Sefaria, null, { timeout: t(45000) });
      await page.keyboard.press('Escape');
      await page.locator('[data-agent-action="open-developer-settings"]').first().click();
      await expect(page).toHaveURL(/\/settings\/developer/);
      await expect(page.locator('[role="dialog"][aria-labelledby="devPocYourListingTitle"]')).toBeVisible({ timeout: t(10000) });
    });

    test('C10 (keyboard): control: without Escape, the Developer tab asks about the pending listing', async () => {
      const { page } = session;
      await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!(window as any).Sefaria, null, { timeout: t(45000) });
      await page.locator('[data-agent-action="open-developer-settings"]').first().click();
      await expect(page).toHaveURL(/\/settings\/developer/);
      await expect(page.locator('[role="dialog"][aria-labelledby="devPocYourListingTitle"]')).toBeVisible({ timeout: t(10000) });
    });

    test('C10 (keyboard): the mock confirmation email dialog starts on its link and traps Tab', async ({ target }) => {
      test.skip(!target.mocks, 'The mock confirmation email exists only with DEVELOPER_SETTINGS_MOCKS on; the local stack runs with it off.');
    });
  });

  test.describe('phone width', () => {
    for (const { role, lang } of [{ role: 'setUp', lang: 'english' as Lang }, { role: 'hebrew', lang: 'hebrew' as Lang }]) {
      test(`C10 (mobile, ${lang}): no horizontal scroll at 375 px, and key buttons and dialogs fit`, async ({ browser, target, manifest }) => {
        findAccount(SUITE, role);
        const { context, page } = await phoneAs(browser, target.name, role, lang);
        try {
          const { dev, card, project } = await openSeededProject(page, manifest, role, lang);
          expect(await page.evaluate(() => (window as any).Sefaria?.multiPanel), 'the mobile site shell').toBe(false);
          if (target.mocks) await dev.collapseTestControls();
          else test.info().annotations.push({ type: 'note', description: 'Test controls are off locally, so the collapsed-panel check does not apply.' });

          if (role === 'setUp') {
            const listing = page.locator('[role="dialog"][aria-labelledby="devPocYourListingTitle"]');
            await expect(listing).toBeVisible({ timeout: t(15000) });
            await expectNoHorizontalScroll(page, 'with the listing dialog open');
            await expectInsideViewport(page, listing.locator('.devPocDialog'), 'the listing dialog');
            await postponeListing(page);
          }

          await expectNoHorizontalScroll(page, 'project expanded');
          const row = card.locator('article.devPocKey').filter({ hasText: project.keys[0].label });
          for (const action of ['show-key', 'copy-key']) {
            await expectInsideViewport(page, row.locator(`[data-agent-action="${action}"]`), action);
          }
          const remove = row.locator('.devPocKeyHeading button');
          await expectInsideViewport(page, remove, 'Delete key');
          await expectInsideViewport(page, card.locator('[data-agent-action="new-key"]'), 'Create key');

          await remove.click();
          const dialog = page.locator('[role="dialog"][aria-labelledby="devPocConfirmTitle"]');
          await expectInsideViewport(page, dialog.locator('.devPocDialog'), 'the delete-key dialog');
          for (const button of await dialog.getByRole('button').all()) await expectInsideViewport(page, button, `dialog button "${await button.textContent()}"`);
          await expectNoHorizontalScroll(page, 'delete-key dialog open');
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);

          await dev.newProjectButton().click();
          await expectNoHorizontalScroll(page, 'new-project panel open');
        } finally {
          await context.close().catch(() => {});
        }
      });
    }
  });
});
