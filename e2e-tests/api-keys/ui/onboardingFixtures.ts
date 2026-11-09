import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import path from 'path';
import { Browser, BrowserContext, Page, Response, expect } from '@playwright/test';
import { REPO_ROOT, TargetName, authFile, baseURLFor } from '../env';
import { prepareContext } from '../session';
import type { AccountSession } from '../fixtures';
import { latestConfirmationLink, linkPath } from '../mail';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { t } from '../../globals';

/**
 * Puts onboarding-suite accounts into known states through onboarding_fixtures.py (local stack
 * only), and the browser steps the onboarding and email-change specs share.
 */

export type OnboardingRole = 'unverified' | 'unverifiedResend' | 'expiredLink' | 'ssoVerified' | 'ssoUnverified';
export type FixtureState = 'F1' | 'F2' | 'F4' | 'F5' | 'F7';

export type AccountFacts = {
  id: number;
  email: string;
  emailVerified: boolean;
  addresses: { email: string; verified: boolean; primary: boolean }[];
  sso: string[];
  developerEnabled: boolean;
  hasProfile: boolean;
  confirmationSentAt: string | null;
  sends: number;
};

const PYTHON = process.env.APIKEYS_STACK_PYTHON || path.join(os.homedir(), '.pyenv', 'versions', 'senv', 'bin', 'python');
const SCRIPT = path.join(__dirname, 'onboarding_fixtures.py');

async function runFixture(args: string[]): Promise<any> {
  const { stdout: output } = await promisify(execFile)(PYTHON, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PYTHONPATH: path.join(REPO_ROOT, 'auth-service', 'dev', 'local-stack'),
      DJANGO_SETTINGS_MODULE: 'django_settings',
      APIKEYS_TARGET: 'local',
      PYTHONWARNINGS: 'ignore',
    },
    encoding: 'utf-8',
    timeout: 120000,
  });
  const line = output.trim().split('\n').filter(l => l.startsWith('{')).pop();
  if (!line) throw new Error(`onboarding_fixtures.py ${args[0]} printed no JSON.`);
  return JSON.parse(line);
}

export const fixtures = {
  reset: (role: OnboardingRole, state: FixtureState, opts: { sends?: number; sendsAgeMinutes?: number } = {}): Promise<AccountFacts> =>
    runFixture(['reset', '--role', role, '--state', state,
      ...(opts.sends ? ['--sends', String(opts.sends), '--sends-age-minutes', String(opts.sendsAgeMinutes ?? 30)] : [])]),
  verify: (role: OnboardingRole): Promise<AccountFacts> => runFixture(['verify', '--role', role]),
  dropSso: (role: OnboardingRole): Promise<AccountFacts> => runFixture(['drop-sso', '--role', role]),
  restoreSso: (role: OnboardingRole): Promise<AccountFacts> => runFixture(['restore-sso', '--role', role]),
  show: (role: OnboardingRole): Promise<AccountFacts> => runFixture(['show', '--role', role]),
  expiredLink: (role: OnboardingRole): Promise<{ email: string; path: string }> => runFixture(['expired-link', '--role', role]),
};

/**
 * Waits for the setup's storage state of an account. A parallel run of apikeys-setup rewrites
 * the .auth directory, so a file can be missing for a few seconds.
 */
export async function sessionReady(role: OnboardingRole, timeoutMs = 120000) {
  const file = authFile('onboarding', role);
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file) && Date.now() < deadline) await new Promise(r => setTimeout(r, 1000));
}

type AccountFixture = (suite: string, role: string) => Promise<AccountSession>;

/** The account fixture, waiting out a parallel apikeys-setup that is rewriting the sessions. */
export async function openAs(account: AccountFixture, role: OnboardingRole): Promise<AccountSession> {
  const deadline = Date.now() + 120000;
  for (;;) {
    await sessionReady(role);
    try {
      return await account('onboarding', role);
    } catch (e) {
      if (!/^No session for/.test(String((e as Error).message)) || Date.now() > deadline) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

/** A context with no session, as when the emailed link is opened in another browser. */
export async function anonymousContext(browser: Browser, target: TargetName): Promise<BrowserContext> {
  const baseURL = baseURLFor(target);
  const context = await browser.newContext({ baseURL, locale: 'en-US' });
  await prepareContext(context, baseURL);
  return context;
}

export async function openDeveloperTab(page: Page): Promise<DeveloperSettingsPage> {
  const dev = new DeveloperSettingsPage(page, 'english');
  await dev.goto();
  return dev;
}

/** Get started → "Confirm your email" region → "Email me a confirmation link". */
export async function askForLink(dev: DeveloperSettingsPage): Promise<Response> {
  await dev.clickGetStarted();
  await expect(dev.page.getByRole('region', { name: 'Confirm your email', exact: true })).toBeVisible();
  return dev.sendConfirmation();
}

export function checkYourEmail(page: Page) {
  return page.getByRole('region', { name: 'Check your email' });
}

/** The newest confirmation link mailed to `email` since `since`, as a path on the target. */
export async function mailedLinkPath(target: TargetName, email: string, since: Date): Promise<string> {
  const link = await latestConfirmationLink(target, email, { since, timeoutMs: t(20000) });
  const url = new URL(link);
  expect(url.host, 'the link is built from the host the request came in on').toBe('www.gateway.test:10080');
  return linkPath(link);
}

export async function expectThankYouPage(page: Page) {
  await expect(page).toHaveURL(/\/settings\/developer\/email-confirmed$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Thank you for confirming your email' })).toBeVisible();
  await expect(page.locator('[data-agent-action="continue-to-developer-settings"]')).toBeVisible();
}

export async function expectLinkPage(page: Page, title: string) {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** "About you": accept the terms and continue, then expect the empty projects view. */
export async function finishAboutYou(dev: DeveloperSettingsPage) {
  await expect(dev.onboardingCard().getByRole('heading', { name: 'About you' })).toBeVisible();
  await dev.fillProfile({ description: 'End-to-end onboarding run.' });
  const saved = await dev.saveProfile();
  expect(saved.status()).toBe(200);
  await expect(dev.newProjectButton()).toBeVisible();
}

/** Whatever the page shows as an error or notice, as text, for assertion messages. */
export async function visibleMessages(page: Page): Promise<string> {
  const texts = await page.locator('.settingsPanel:not([hidden]) [role="alert"], .settingsPanel:not([hidden]) [role="status"], .settingsPanel:not([hidden]) .devPocNotice, .settingsPanel:not([hidden]) .devPocWarning')
    .allInnerTexts();
  return texts.map(s => s.trim()).filter(Boolean).join(' | ') || '(none)';
}

/** Mailpit stamps messages to the second; start the window a little early. */
export function sinceNow(): Date {
  return new Date(Date.now() - 2000);
}
