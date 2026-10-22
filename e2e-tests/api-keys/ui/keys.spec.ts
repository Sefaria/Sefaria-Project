import { test, expect, pageFetch } from '../fixtures';
import { loadManifest } from '../env';
import { t } from '../../globals';
import {
  SITE_A, createKeyInUi, createProjectInUi, deleteProjectQuietly, developerState, isAllowed, keyRow,
  openDeveloperSettings, poll, waitForDeveloperApi, probeKey, probeSummary, revokeKeyInUi, uniqueName,
} from './keys-helpers';

/**
 * The key list in developer settings: the five-key limit, races between tabs, and the key value
 * controls. Runs on the keys.twoTabs account. Tests other than the two-tab race make their own
 * private project and delete it afterwards; the race uses the seeded project, which holds 4 keys.
 */

const TWO_TABS_PROJECT = 'E2E keys twoTabs';
const LIMIT_NOTICE = "You have 5 keys, the most a project can have. Delete one you don't use to make room.";

const counter = (card: import('@playwright/test').Locator) => card.getByText(/^\d+ of 5 keys$/);

// navigator.clipboard needs a secure context. The cauldron is https; the local stack is plain
// http, so Chromium is told to treat it as secure (only the new headless mode honours that flag).
// Setting launch args replaces the project's, so they are repeated here.
if (process.env.APIKEYS_TARGET === 'local') {
  test.use({
    channel: 'chromium',
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP *.gateway.test 127.0.0.1',
        '--explicitly-allowed-ports=10080,10081',
        '--unsafely-treat-insecure-origin-as-secure=http://www.gateway.test:10080',
      ],
    },
  });
}
// A failure screenshot could show an unmasked key.
test.use({ screenshot: 'off' });

test.describe('keys', () => {
  test('C3: five keys fill a project, the sixth is refused, and a revoked key frees a slot', async ({ account }) => {
    test.setTimeout(t(240000));
    const { page } = await account('keys', 'twoTabs');
    const dev = await openDeveloperSettings(page);
    const name = uniqueName('E2E C3');
    let projectId: string | undefined;
    try {
      projectId = await createProjectInUi(dev, name, SITE_A);
      const card = dev.projectCard(name);
      for (let i = 1; i <= 5; i++) {
        await createKeyInUi(dev, card, `C3-${i}`);
        await expect(counter(card)).toHaveText(`${i} of 5 keys`);
      }
      await expect(dev.action('new-key', card)).toBeDisabled();
      await expect(card.locator('.devPocNotice').filter({ hasText: 'the most a project can have' })).toHaveText(LIMIT_NOTICE);

      const sixth = await pageFetch(page, `/api/developer/projects/${projectId}/keys`, { method: 'POST', body: { label: 'C3-6' } });
      expect(sixth.status, 'a sixth key through the API').toBe(400);
      expect(sixth.json?.error).toBe('A project can have at most 5 keys.');

      await revokeKeyInUi(dev, card, 'C3-3');
      await expect(counter(card)).toHaveText('4 of 5 keys');
      await expect(dev.action('new-key', card)).toBeEnabled();
      await expect(card.locator('.devPocNotice').filter({ hasText: 'the most a project can have' })).toHaveCount(0);

      await createKeyInUi(dev, card, 'C3-6');
      await expect(counter(card)).toHaveText('5 of 5 keys');
      const project = (await developerState(page)).projects.find((p: any) => p.id === projectId);
      expect(project.keys.map((k: any) => k.label).sort()).toEqual(['C3-1', 'C3-2', 'C3-4', 'C3-5', 'C3-6']);
    } finally {
      await deleteProjectQuietly(page, projectId);
    }
  });

  test('N-C12: two tabs racing for the fifth key: the loser shows the server message and 5 of 5 @known-gap S8', async ({ account }) => {
    test.setTimeout(t(180000));
    const tabA = await account('keys', 'twoTabs');
    const tabB = await account('keys', 'twoTabs');
    const seededIds = new Set(loadManifest().keys.filter(k => k.suite === 'keys' && k.name.startsWith('twoTabs.')).map(k => String(k.id)));

    const extraKeys = async () => {
      const project = (await developerState(tabA.page)).projects.find((p: any) => p.name === TWO_TABS_PROJECT);
      return { project, extra: project.keys.filter((k: any) => !seededIds.has(String(k.id))) };
    };
    const restoreFourKeys = async () => {
      const { extra } = await extraKeys();
      for (const k of extra) await pageFetch(tabA.page, `/api/developer/keys/${k.id}`, { method: 'DELETE' });
    };

    const devA = await openDeveloperSettings(tabA.page);
    await restoreFourKeys();
    const devB = await openDeveloperSettings(tabB.page);
    await devA.goto();
    try {
      const { project } = await extraKeys();
      expect(project.keys, 'the seeded project starts with 4 keys').toHaveLength(4);

      const tabs = [
        { dev: devA, label: 'N-C12 tab A' },
        { dev: devB, label: 'N-C12 tab B' },
      ];
      for (const tab of tabs) {
        await tab.dev.expandProject(TWO_TABS_PROJECT);
        const card = tab.dev.projectCard(TWO_TABS_PROJECT);
        await expect(counter(card)).toHaveText('4 of 5 keys');
        await tab.dev.action('new-key', card).first().click();
        await card.locator('#devPocKeyLabel').fill(tab.label);
      }
      const responses = tabs.map(tab => waitForDeveloperApi(tab.dev.page, /\/api\/developer\/projects\/[^/]+\/keys$/));
      await Promise.all(tabs.map(tab => tab.dev.action('create-key', tab.dev.projectCard(TWO_TABS_PROJECT)).click()));
      const statuses = await Promise.all(responses.map(async r => (await r).status()));
      expect([...statuses].sort(), 'exactly one tab gets the fifth key').toEqual([200, 400]);

      const winner = tabs[statuses.indexOf(200)];
      const loser = tabs[statuses.indexOf(400)];
      const loserBody = await (await responses[statuses.indexOf(400)]).json();
      expect(loserBody.error).toBe('A project can have at most 5 keys.');

      const winnerCard = winner.dev.projectCard(TWO_TABS_PROJECT);
      await expect(winnerCard.locator('.devPocKeyReady')).toBeVisible({ timeout: t(20000) });
      await expect(counter(winnerCard)).toHaveText('5 of 5 keys');

      const loserCard = loser.dev.projectCard(TWO_TABS_PROJECT);
      await expect.soft(loserCard.getByRole('alert')).toContainText('at most 5 keys', { timeout: t(20000) });
      await expect(counter(loserCard)).toHaveText('5 of 5 keys');
    } finally {
      await restoreFourKeys();
    }
  });

  test('N-C12: a key name over 100 characters gets the length message, not a generic error @known-gap S8', async ({ account }) => {
    test.setTimeout(t(120000));
    const { page } = await account('keys', 'twoTabs');
    const dev = await openDeveloperSettings(page);
    const name = uniqueName('E2E N-C12 label');
    let projectId: string | undefined;
    try {
      projectId = await createProjectInUi(dev, name, SITE_A);
      const card = dev.projectCard(name);
      await dev.action('new-key', card).first().click();
      const input = card.locator('#devPocKeyLabel');
      await input.fill('x'.repeat(101));
      const maxLength = await input.getAttribute('maxlength');
      if (maxLength !== null) {
        // Refusing the extra characters in the field is an acceptable way to meet the limit.
        expect(Number(maxLength)).toBeLessThanOrEqual(100);
        expect((await input.inputValue()).length).toBeLessThanOrEqual(100);
        return;
      }
      const pending = waitForDeveloperApi(dev.page, /\/api\/developer\/projects\/[^/]+\/keys$/);
      await dev.action('create-key', card).click();
      const response = await pending;
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toBe('The key name can be at most 100 characters.');
      await expect(card.getByRole('alert')).toContainText('at most 100 characters', { timeout: t(20000) });
    } finally {
      await deleteProjectQuietly(page, projectId);
    }
  });

  test.describe('key value controls', () => {

    test('N-C17: a key is masked by default, shows and hides, and Copy puts it on the clipboard', async ({ account, gw, target, baseURL }) => {
      test.setTimeout(t(120000));
      const { page, context } = await account('keys', 'twoTabs');
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
      const dev = await openDeveloperSettings(page);
      const name = uniqueName('E2E N-C17 copy');
      let projectId: string | undefined;
      try {
        projectId = await createProjectInUi(dev, name, SITE_A);
        const card = dev.projectCard(name);
        const key = await createKeyInUi(dev, card, 'N-C17 copy');
        const row = keyRow(card, 'N-C17 copy');
        const code = row.locator('.devPocKeyValue code');
        const show = row.locator('[data-agent-action="show-key"]');

        await expect(code).toHaveText(/^sfr_(test_)?•{12}$/);
        await expect(show).toHaveAttribute('aria-pressed', 'false');
        await expect(show).toHaveAccessibleName('Show key');

        await show.click();
        await expect(show).toHaveAttribute('aria-pressed', 'true');
        await expect(show).toHaveAccessibleName('Hide key');
        expect((await code.textContent()) === key.value, 'the shown value is the key').toBe(true);

        await show.click();
        await expect(code).toHaveText(/^sfr_(test_)?•{12}$/);
        await expect(show).toHaveAttribute('aria-pressed', 'false');

        await row.locator('[data-agent-action="copy-key"]').click();
        await expect(row.locator('.devPocCopied')).toHaveText('Copied');
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied === key.value, 'the clipboard holds the key').toBe(true);

        const works = await poll(() => probeKey(gw, target, copied), isAllowed, { timeoutMs: 10000 });
        expect(works.elapsedMs, `the copied key works at the gateway: ${probeSummary(works.last)}`).toBeDefined();
      } finally {
        await deleteProjectQuietly(page, projectId);
      }
    });

    test('N-C17: leaving during "Setting up your key" still lists the key exactly once', async ({ account }) => {
      test.setTimeout(t(120000));
      const { page } = await account('keys', 'twoTabs');
      const dev = await openDeveloperSettings(page);
      const name = uniqueName('E2E N-C17 leave');
      const label = 'N-C17 leave';
      let projectId: string | undefined;
      try {
        projectId = await createProjectInUi(dev, name, SITE_A);
        const card = dev.projectCard(name);
        await dev.action('new-key', card).first().click();
        await card.locator('#devPocKeyLabel').fill(label);
        const pending = waitForDeveloperApi(dev.page, /\/api\/developer\/projects\/[^/]+\/keys$/);
        await dev.action('create-key', card).click();
        const settingUp = card.getByRole('status').filter({ hasText: 'Setting up your key…' });
        await expect(settingUp).toBeVisible();
        expect((await pending).status()).toBe(200);
        const stillSettingUp = await settingUp.isVisible();
        test.info().annotations.push({ type: 'N-C17 navigation', description: `left while "Setting up your key" was ${stillSettingUp ? 'showing' : 'already gone (slow server)'}` });

        await page.goto('/texts', { waitUntil: 'domcontentloaded' });
        await dev.goto();
        await dev.expandProject(name);
        const reloaded = dev.projectCard(name);
        await expect(keyRow(reloaded, label)).toHaveCount(1);
        await expect(counter(reloaded)).toHaveText('1 of 5 keys');
      } finally {
        await deleteProjectQuietly(page, projectId);
      }
    });
  });
});
