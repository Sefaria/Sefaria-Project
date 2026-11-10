import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import { Browser, BrowserContext, Page } from '@playwright/test';
import { AccountSession, Target, expect, pageFetch } from '../fixtures';
import { REPO_ROOT, baseURLFor, findAccount, loadManifest, readPassword } from '../env';
import { InterfaceLang, logIn, prepareContext } from '../session';
import { t } from '../../globals';

export const SUITE = 'account';

export type SavedSettings = {
  id: number;
  settings: {
    email_notifications?: string;
    interface_language?: string;
    reading_history?: boolean;
    textual_custom?: string;
    library_assistant?: boolean;
  };
};

/** Runs account_fixtures.py with the local stack's Django settings and returns its JSON line. */
export function accountFixture<T = any>(...args: string[]): T {
  const python = process.env.APIKEYS_STACK_PYTHON || path.join(os.homedir(), '.pyenv/versions/senv/bin/python');
  const env = { ...process.env, PYTHONPATH: path.join(REPO_ROOT, 'auth-service/dev/local-stack'), DJANGO_SETTINGS_MODULE: 'django_settings' };
  delete env.FRONT_END_URL;
  delete env.CI_RUN;
  const run = spawnSync(python, [path.join(__dirname, 'account_fixtures.py'), ...args], { cwd: REPO_ROOT, env, encoding: 'utf-8', timeout: 60000 });
  const last = (run.stdout || '').trim().split('\n').pop() || '';
  if (run.status !== 0 || !last.startsWith('{')) {
    throw new Error(`account_fixtures.py ${args[0]} failed (${run.status}): ${(run.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
  }
  return JSON.parse(last);
}

export const savedSettings = (role: string) => accountFixture<SavedSettings>('show', '--role', role).settings;

export function addListing(role: string, name: string) {
  return accountFixture<{ id: number; name: string }>('listing', '--role', role, '--name', name, '--marker', loadManifest().marker);
}

/** Opens a settings URL and waits until the React page has mounted. */
export async function openSettings(page: Page, path = '/settings/account') {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: t(60000) });
  await expect(page.locator('#accountSettingsPage')).toBeAttached({ timeout: t(45000) });
}

export async function developerState(page: Page) {
  const response = await pageFetch(page, '/api/developer/state');
  expect(response.status, response.text).toBe(200);
  return response.json;
}

/** The option currently selected in one of the Account tab's toggles. */
export async function selectedOption(page: Page, sectionId: string): Promise<string | null> {
  return page.locator(`#${sectionId} .toggleOption.on`).first().getAttribute('data-value');
}

export function other<T extends string>(current: string | null, options: readonly T[]): T {
  return options.find(o => o !== current) ?? options[0];
}

type AccountFixture = (suite: string, role: string, opts?: { host?: string; lang?: InterfaceLang }) => Promise<AccountSession>;

const ownContexts: BrowserContext[] = [];

/**
 * A logged-in page for one of this suite's accounts. Uses the session apikeys-setup captured;
 * when another run's setup has cleared the shared .auth directory meanwhile, logs in afresh.
 */
export async function openAs(
  account: AccountFixture, browser: Browser, target: Target, role: string,
  opts: { host?: string; lang?: InterfaceLang } = {},
): Promise<{ page: Page; context: BrowserContext }> {
  try {
    return await account(SUITE, role, opts);
  } catch (e: any) {
    if (!/No session for|re-seeded after apikeys-setup/.test(String(e?.message))) throw e;
  }
  const seeded = findAccount(SUITE, role);
  const baseURL = opts.host ? baseURLFor(target.name).replace(/www\.gateway\.test/, opts.host) : baseURLFor(target.name);
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: target.name === 'cauldron',
    locale: opts.lang === 'hebrew' ? 'he-IL' : 'en-US',
  });
  ownContexts.push(context);
  await prepareContext(context, baseURL, opts.lang ?? 'english');
  const page = await context.newPage();
  await logIn(page, baseURL, seeded.email, readPassword(), seeded.id);
  return { page, context };
}

export async function closeOwnContexts() {
  while (ownContexts.length) await ownContexts.pop()!.close().catch(() => {});
}
