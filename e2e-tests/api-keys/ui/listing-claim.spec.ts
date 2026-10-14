import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import { Page } from '@playwright/test';
import { test, expect, pageFetch } from '../fixtures';
import { REPO_ROOT, findAccount, loadManifest } from '../env';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { openAccount } from './session-wait';
import { t } from '../../globals';

const SUITE = 'projects';
const OWNER = 'listingOwner';

type Listing = { id: number; name: string; ownerId: number | null; isPublished: boolean; consentToDisplay: boolean; deleted: boolean };

/** Runs listing_fixtures.py with the local stack's Django settings and returns its JSON line. */
function listingFixture(...args: string[]): Listing {
  const python = process.env.APIKEYS_STACK_PYTHON || path.join(os.homedir(), '.pyenv/versions/senv/bin/python');
  const env = { ...process.env, PYTHONPATH: path.join(REPO_ROOT, 'auth-service/dev/local-stack'), DJANGO_SETTINGS_MODULE: 'django_settings' };
  delete env.FRONT_END_URL;
  delete env.CI_RUN;
  const run = spawnSync(python, [path.join(__dirname, 'listing_fixtures.py'), ...args], { cwd: REPO_ROOT, env, encoding: 'utf-8', timeout: 60000 });
  const last = (run.stdout || '').trim().split('\n').pop() || '';
  if (run.status !== 0 || !last.startsWith('{')) {
    throw new Error(`listing_fixtures.py ${args[0]} failed (${run.status}): ${(run.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
  }
  return JSON.parse(last);
}

function createListing(name: string, consent: 'yes' | 'no' = 'yes'): Listing {
  return listingFixture('create', '--email', findAccount(SUITE, OWNER).email, '--name', name, '--marker', loadManifest().marker, '--consent', consent);
}

const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

async function state(page: Page) {
  const response = await pageFetch(page, '/api/developer/state');
  expect(response.status, response.text).toBe(200);
  return response.json;
}

/** Dismisses every listing still waiting for an answer, so each test starts with none pending. */
async function clearPendingListings(page: Page) {
  for (let i = 0; i < 20; i++) {
    const pending = (await state(page)).yourListing;
    if (!pending) return;
    const response = await pageFetch(page, `/api/developer/listings/${pending.id}/dismiss`, { method: 'POST' });
    expect(response.status, response.text).toBe(200);
  }
  throw new Error('More than 20 listings pending for the listing owner.');
}

async function openDeveloper(page: Page): Promise<DeveloperSettingsPage> {
  const dev = new DeveloperSettingsPage(page, 'english');
  await dev.goto();
  await expect(page.locator('.devPocPage .devPocPageHeader')).toBeVisible({ timeout: t(30000) });
  return dev;
}

test.describe('developer settings: "Is this your project?"', () => {
  test.describe.configure({ mode: 'default' });

  let page: Page;
  let dev: DeveloperSettingsPage;

  test.beforeEach(async ({ target, account }) => {
    test.skip(target.name !== 'local', 'Listing fixtures are made through the local stack database.');
    ({ page } = await openAccount(account, SUITE, OWNER));
    dev = new DeveloperSettingsPage(page, 'english');
    await dev.goto();
    await clearPendingListings(page);
  });

  test('N-C14: "Yes, add it" adds the listing as a linked public project', async () => {
    const listing = createListing(unique('N-C14 yes'));
    await openDeveloper(page);

    const dialog = dev.listingDialog();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Is this your project?' })).toBeVisible();
    await expect(dialog.locator('.devPocListingSummary')).toContainText(listing.name);
    await expect(dev.action('claim-listing', dialog)).toBeFocused();

    const claim = dev.waitForApi(`listings/${listing.id}/claim`);
    await dev.action('claim-listing', dialog).click();
    const response = await claim;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe(String(listing.id));

    await expect(dialog).toHaveCount(0);
    const card = dev.projectCard(listing.name);
    await expect(card.locator('button.devPocProjectToggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page).toHaveURL(new RegExp(`/settings/developer/projects/${listing.id}$`));
    await expect(card).toContainText(`Public: this is the ${listing.name} listing on Powered by Sefaria.`);
    await card.getByRole('button', { name: 'Edit project' }).click();
    await expect(card.locator('.devPocLinked')).toContainText('Linked');

    const row = listingFixture('show', '--id', String(listing.id));
    expect(row.ownerId).toBe(findAccount(SUITE, OWNER).id);
    expect(row.consentToDisplay).toBe(true);
  });

  test('N-C14: "No, it\'s not mine" stops the question for good', async () => {
    const listing = createListing(unique('N-C14 no'));
    await openDeveloper(page);

    const dismiss = dev.waitForApi(`listings/${listing.id}/dismiss`);
    await dev.action('not-my-listing', dev.listingDialog()).click();
    expect((await dismiss).status()).toBe(200);
    await expect(dev.listingDialog()).toHaveCount(0);

    await openDeveloper(page);
    await expect(page.locator('.devPocSectionHeading').first()).toBeVisible();
    await expect(dev.listingDialog()).toHaveCount(0);
    expect((await state(page)).yourListing).toBeNull();
    const row = listingFixture('show', '--id', String(listing.id));
    expect(row.ownerId).toBeNull();
    await expect(dev.projectCard(listing.name)).toHaveCount(0);
  });

  test('N-C14: "Not now" and Escape hide the question until the next visit, without a request', async () => {
    const listing = createListing(unique('N-C14 later'));
    const listingCalls: string[] = [];
    page.on('request', r => { if (/\/api\/developer\/listings\//.test(r.url())) listingCalls.push(r.url()); });

    await openDeveloper(page);
    await dev.action('listing-not-now', dev.listingDialog()).click();
    await expect(dev.listingDialog()).toHaveCount(0);

    await openDeveloper(page);
    await expect(dev.listingDialog()).toBeVisible();
    await expect(dev.listingDialog()).toContainText(listing.name);
    await page.keyboard.press('Escape');
    await expect(dev.listingDialog()).toHaveCount(0);

    await openDeveloper(page);
    await expect(dev.listingDialog()).toContainText(listing.name);
    expect(listingCalls).toEqual([]);
    expect(listingFixture('show', '--id', String(listing.id)).ownerId).toBeNull();
  });

  test('N-C14: two listings are asked about one after the other', async () => {
    const older = createListing(unique('N-C14 first'));
    const newer = createListing(unique('N-C14 second'));
    await openDeveloper(page);

    await expect(dev.listingDialog()).toContainText(newer.name);
    const claim = dev.waitForApi(`listings/${newer.id}/claim`);
    await dev.action('claim-listing', dev.listingDialog()).click();
    expect((await claim).status()).toBe(200);

    await expect(dev.listingDialog()).toContainText(older.name);
    await expect(dev.projectCard(newer.name)).toHaveCount(1);
    const dismiss = dev.waitForApi(`listings/${older.id}/dismiss`);
    await dev.action('not-my-listing', dev.listingDialog()).click();
    expect((await dismiss).status()).toBe(200);
    await expect(dev.listingDialog()).toHaveCount(0);
  });

  test('N-C14: a listing another account claimed first shows "No such listing." and refreshes the state @known-gap N-C14', async () => {
    const listing = createListing(unique('N-C14 race'));
    await openDeveloper(page);
    await expect(dev.listingDialog()).toContainText(listing.name);

    listingFixture('give', '--id', String(listing.id), '--to', findAccount(SUITE, 'otherAccount').email);

    const claim = dev.waitForApi(`listings/${listing.id}/claim`);
    await dev.action('claim-listing', dev.listingDialog()).click();
    const response = await claim;
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toBe('No such listing.');

    await expect(page.locator('.devPocNotice[role="status"]')).toContainText('No such listing.');
    await expect(dev.projectCard(listing.name)).toHaveCount(0);
    await expect(dev.listingDialog(), 'the dialog still asks about a listing the server no longer offers').toHaveCount(0, { timeout: t(5000) });
  });

  test('N-C14: another account cannot claim or dismiss this account\'s listing', async ({ account }) => {
    const listing = createListing(unique('N-C14 other'));
    const other = await openAccount(account, SUITE, 'otherAccount');
    await new DeveloperSettingsPage(other.page, 'english').goto();

    for (const action of ['claim', 'dismiss']) {
      const response = await pageFetch(other.page, `/api/developer/listings/${listing.id}/${action}`, { method: 'POST' });
      expect(response.status, `${action}: ${response.text}`).toBe(404);
      expect(response.json.error).toBe('No such listing.');
    }
    expect(listingFixture('show', '--id', String(listing.id)).ownerId).toBeNull();
    expect((await state(other.page)).projects.some((p: any) => p.id === String(listing.id))).toBe(false);

    await openDeveloper(page);
    await expect(dev.listingDialog()).toContainText(listing.name);
  });

  test('N-C9: double-clicking "Yes, add it" claims once with no error notice @known-gap S6', async () => {
    const listing = createListing(unique('N-C9 claim'));
    await openDeveloper(page);
    const statuses: number[] = [];
    page.on('response', r => { if (new URL(r.url()).pathname === `/api/developer/listings/${listing.id}/claim`) statuses.push(r.status()); });

    await dev.action('claim-listing', dev.listingDialog()).dblclick();
    await expect(dev.projectCard(listing.name)).toHaveCount(1, { timeout: t(15000) });
    await page.waitForTimeout(2000);

    expect((await state(page)).projects.filter((p: any) => p.id === String(listing.id)).length).toBe(1);
    await expect(page.locator('.devPocNotice[role="status"]'), `claim responses: ${JSON.stringify(statuses)}`).toHaveCount(0);
  });

  test('N-C14: claiming a listing whose submitter said No keeps it unpublished and private @known-gap N-D8', async () => {
    const listing = createListing(unique('N-C14 no consent'), 'no');
    expect(listing.isPublished).toBe(false);
    await openDeveloper(page);

    const claim = dev.waitForApi(`listings/${listing.id}/claim`);
    await dev.action('claim-listing', dev.listingDialog()).click();
    expect((await claim).status()).toBe(200);

    const row = listingFixture('show', '--id', String(listing.id));
    expect(row.ownerId).toBe(findAccount(SUITE, OWNER).id);
    expect({ isPublished: row.isPublished, consentToDisplay: row.consentToDisplay }).toEqual({ isPublished: false, consentToDisplay: false });
    await expect(dev.projectCard(listing.name)).toContainText('Private: not shown on Powered by Sefaria.');
  });
});
