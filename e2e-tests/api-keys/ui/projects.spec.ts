import { Page } from '@playwright/test';
import { test, expect, pageFetch } from '../fixtures';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { openAccount } from './session-wait';
import { t } from '../../globals';

const SUITE = 'projects';

const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

async function openDeveloper(page: Page, path = DeveloperSettingsPage.PATH): Promise<DeveloperSettingsPage> {
  const dev = new DeveloperSettingsPage(page, 'english');
  await dev.goto(path);
  await expect(page.locator('.devPocPage .devPocPageHeader')).toBeVisible({ timeout: t(30000) });
  return dev;
}

async function state(page: Page) {
  const response = await pageFetch(page, '/api/developer/state');
  expect(response.status, response.text).toBe(200);
  return response.json;
}

async function createProjectThroughApi(page: Page, project: Record<string, unknown>): Promise<number> {
  const response = await pageFetch(page, '/api/developer/projects', {
    method: 'POST',
    body: { project: { description: 'Temporary end-to-end test project.', organization: '', aiAssisted: false, visibility: 'private', ...project } },
  });
  expect(response.status, response.text).toBe(200);
  return response.json.projectId;
}

test.describe('developer settings: projects', () => {
  test.beforeEach(async ({ target }) => {
    test.skip(target.name !== 'local', 'The projects suite runs on the local stack.');
  });

  test('N-C9: double-clicking "Create project" makes exactly one project and no error notice', async ({ account }) => {
    const { page } = await openAccount(account, SUITE, 'setUp');
    const dev = await openDeveloper(page);
    const name = unique('N-C9 double click');

    const posts: number[] = [];
    page.on('response', r => {
      if (r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/developer/projects') posts.push(r.status());
    });

    await dev.newProjectButton().click();
    await dev.fillNewProject({ name, description: 'Created by a double click.', website: 'https://n-c9.example.com', visibility: 'private' });
    await dev.action('create-project', dev.newProjectPanel()).dblclick();

    await expect(dev.projectCard(name).first()).toBeVisible({ timeout: t(15000) });
    await page.waitForTimeout(2000);
    const named = (await state(page)).projects.filter((p: any) => p.name === name);
    expect(named.length, `POST /api/developer/projects answered ${JSON.stringify(posts)}`).toBe(1);
    await expect(dev.projectCard(name)).toHaveCount(1);
    await expect(page.locator('.devPocNotice[role="status"]')).toHaveCount(0);
  });

  test('N-C13 (S10): Back from /settings/developer/projects/<id> collapses the card', async ({ account }) => {
    const { page } = await openAccount(account, SUITE, 'setUp');
    await openDeveloper(page);
    const name = unique('N-C13 back');
    await createProjectThroughApi(page, { name });

    const dev = await openDeveloper(page);
    const toggle = dev.projectCard(name).locator('button.devPocProjectToggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page).toHaveURL(/\/settings\/developer\/projects\/\d+$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/developer$/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: t(5000) });
  });

  test('N-C13 (S10): reloading /settings/developer/projects/<id> opens that card', async ({ account }) => {
    const { page } = await openAccount(account, SUITE, 'setUp');
    await openDeveloper(page);
    const name = unique('N-C13 reload');
    const id = await createProjectThroughApi(page, { name });

    const dev = await openDeveloper(page, `/settings/developer/projects/${id}`);
    await expect(dev.projectCard(name).locator('button.devPocProjectToggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('N-C13 (S12): Account Cancel after switching tabs leaves settings', async ({ account }) => {
    const { page } = await openAccount(account, SUITE, 'setUp');
    await page.goto('/texts', { waitUntil: 'domcontentloaded' });
    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    const dev = new DeveloperSettingsPage(page, 'english');
    await expect(page.locator('#accountSettingsPage')).toBeVisible({ timeout: t(30000) });

    await dev.developerTabLink().click();
    await expect(page).toHaveURL(/\/settings\/developer$/);
    await dev.accountTabLink().click();
    await expect(page).toHaveURL(/\/settings\/account$/);

    await page.locator('#accountSettingsPage').getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page).not.toHaveURL(/\/settings\//, { timeout: t(10000) });
  });

  test('N-C13 (S12): Account Cancel with no tab switch goes back to the page before settings', async ({ account }) => {
    const { page } = await openAccount(account, SUITE, 'setUp');
    await page.goto('/texts', { waitUntil: 'domcontentloaded' });
    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#accountSettingsPage')).toBeVisible({ timeout: t(30000) });

    await page.locator('#accountSettingsPage').getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page).toHaveURL(/\/texts$/, { timeout: t(10000) });
  });

  test('C4 (UI): a restriction follows a website change, and clearing the website is refused while a key is restricted', async ({ account }) => {
    const { page } = await openAccount(account, SUITE, 'otherAccount');
    await openDeveloper(page);
    const name = unique('C4 website');
    const label = unique('c4 key');
    const id = await createProjectThroughApi(page, { name, websiteUrl: 'https://c4-old.example.com' });
    const key = await pageFetch(page, `/api/developer/projects/${id}/keys`, { method: 'POST', body: { label } });
    expect(key.status, key.text).toBe(200);
    const keyId = key.json.keyId;

    const dev = await openDeveloper(page, `/settings/developer/projects/${id}`);
    const card = dev.projectCard(name);
    await expect(card.locator('button.devPocProjectToggle')).toHaveAttribute('aria-expanded', 'true');

    const restrict = dev.waitForApi(new RegExp(`/api/developer/keys/${keyId}$`));
    await dev.restrictionSwitch(card, label).click();
    expect((await restrict).status()).toBe(200);
    await expect(dev.restrictionSwitch(card, label)).toBeChecked();
    await expect(card.locator(`#devPocRestrictionSummary-${keyId}`)).toContainText('https://c4-old.example.com');

    await card.getByRole('button', { name: 'Edit project' }).click();
    await card.locator('#devPocProjectUrl').fill('https://c4-new.example.com');
    let save = dev.waitForApi(`projects/${id}`);
    await dev.action('save-project', card).click();
    expect((await save).status()).toBe(200);
    await expect(dev.restrictionSwitch(card, label)).toBeChecked();
    await expect(card.locator(`#devPocRestrictionSummary-${keyId}`)).toContainText('https://c4-new.example.com');
    await expect(card.locator(`#devPocRestrictionSummary-${keyId}`)).not.toContainText('c4-old');
    let row = (await state(page)).projects.find((p: any) => p.id === id).keys.find((k: any) => k.id === keyId);
    expect(row.restrictToWebsite).toBe(true);

    const refusal = 'Turn off the website restriction on your keys before removing the website.';
    await card.getByRole('button', { name: 'Edit project' }).click();
    await card.locator('#devPocProjectUrl').fill('');
    save = dev.waitForApi(`projects/${id}`);
    await dev.action('save-project', card).click();
    await dev.action('save-without-website').click();
    expect((await save).status()).toBe(400);

    await expect(card.locator('.devPocWarning[role="alert"]')).toContainText(refusal);
    await expect(card.locator('#devPocProjectUrl')).toHaveValue('');
    let after = (await state(page)).projects.find((p: any) => p.id === id);
    expect(after.websiteUrl).toBe('https://c4-new.example.com');
    expect(after.keys.find((k: any) => k.id === keyId).restrictToWebsite).toBe(true);

    // The way through: turn the restriction off on the key, then clear the website.
    await card.getByRole('button', { name: 'Cancel' }).click();
    const unrestrict = dev.waitForApi(new RegExp(`/api/developer/keys/${keyId}$`));
    await dev.restrictionSwitch(card, label).click();
    expect((await unrestrict).status()).toBe(200);
    await expect(dev.restrictionSwitch(card, label)).not.toBeChecked();

    await card.getByRole('button', { name: 'Edit project' }).click();
    await card.locator('#devPocProjectUrl').fill('');
    save = dev.waitForApi(`projects/${id}`);
    await dev.action('save-project', card).click();
    await dev.action('save-without-website').click();
    expect((await save).status()).toBe(200);

    await expect(dev.restrictionSwitch(card, label)).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Add your website' })).toBeVisible();
    after = (await state(page)).projects.find((p: any) => p.id === id);
    expect(after.websiteUrl).toBeFalsy();
    expect(after.keys.find((k: any) => k.id === keyId).restrictToWebsite).toBe(false);
  });
});
