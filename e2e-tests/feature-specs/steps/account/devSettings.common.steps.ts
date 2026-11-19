// Shared steps and helpers for the Developer Settings stories
// (features/account/developer-settings-behavior-specs.feature).
//
// - Given-steps put the test account in a known state through the developer API
//   (developerApi.ts), then open Developer Settings.
// - Copy is checked by translation key: a sentence like
//     Then the page reads "Get a free API key" [developer.welcome.header]
//   reads the key's value from the running page; the English in quotes is documentation.
//   A sentence with no key falls back to the quoted words.
// - Other step files in this folder import { dev, ... } from here. A sentence must be defined in
//   exactly one file: check this one before adding a step elsewhere.
import { Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Given, When, Then, After, expect, Visitor } from '../fixtures';
import { DeveloperApi, DevProject } from './developerApi';
import { DeveloperSettingsPage } from '../../../pages/developerSettingsPage';
import { t } from '../../../globals';

export type Dev = {
  page: Page;
  ds: DeveloperSettingsPage;
  api: DeveloperApi;
};

/** Notes the Developer Settings steps keep for later steps in the same scenario. */
export type DevNotes = {
  /** Full key values by key label (from the API, which returns a value only on creation). */
  keyValues?: Record<string, string>;
  /** Project ids by project name. */
  projectIds?: Record<string, string>;
  /** The project a scenario is about when a sentence doesn't name one. */
  currentProject?: string;
  /** The key a scenario is about when a sentence doesn't name one. */
  currentKey?: string;
  /** The account lock this scenario holds (released after it). */
  lockDir?: string;
  [k: string]: unknown;
};

export const notes = (visitor: Visitor): DevNotes => visitor.notes as DevNotes;

/**
 * The page, page object and API for the current visitor, opening Developer Settings first if
 * no Sefaria page is open yet (the API needs the session's csrftoken cookie).
 */
export async function dev(visitor: Visitor): Promise<Dev> {
  const page = await visitor.page();
  if (!page.url().includes(DeveloperSettingsPage.PATH)) {
    await visitor.goto(visitor.urlFor('Library', DeveloperSettingsPage.PATH));
  }
  const pm = await visitor.pm();
  return { page, ds: pm.onDeveloperSettingsPage(), api: new DeveloperApi(page) };
}

// --- One scenario per test account at a time ----------------------------------------------
//
// The stories reset and rebuild the test account's projects, so two scenarios on the same
// account must not overlap, across workers and the desktop and phone projects alike. A
// directory lock per account serializes them; the rest of the suite still runs in parallel.

const LOCK_WAIT_MS = 10 * 60 * 1000;
const LOCK_STALE_MS = 3 * 60 * 1000;

async function lockAccount(visitor: Visitor, account: string): Promise<void> {
  const n = notes(visitor);
  if (n.lockDir) return;
  const dir = path.join(os.tmpdir(), `sefaria-e2e-${account.replace(/[^a-z0-9]+/gi, '-')}.lock`);
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(dir);
      n.lockDir = dir;
      return;
    } catch {
      try {
        if (Date.now() - fs.statSync(dir).mtimeMs > LOCK_STALE_MS) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* released meanwhile */
      }
      if (Date.now() - start > LOCK_WAIT_MS) throw new Error(`Timed out waiting for the ${account} test account`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

After(async ({ visitor }) => {
  const dir = notes(visitor).lockDir as string | undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Logs in as the "new developer" test account (no profile, email not confirmed). */
export async function asNewDeveloper(visitor: Visitor): Promise<Dev> {
  await lockAccount(visitor, process.env.PLAYWRIGHT_DEV_NEW_USER_EMAIL ?? 'dev-new-user');
  visitor.who = 'new developer';
  return dev(visitor);
}

/** Logs in as the developer test account and deletes all of its projects. */
export async function asDeveloper(visitor: Visitor): Promise<Dev> {
  await lockAccount(visitor, process.env.PLAYWRIGHT_DEV_USER_EMAIL ?? 'dev-user');
  visitor.who = 'developer';
  const d = await dev(visitor);
  await d.api.reset();
  return d;
}

/** Reloads Developer Settings so the page shows what the API set up. */
export async function reloadHome(visitor: Visitor): Promise<Dev> {
  const d = await dev(visitor);
  await d.ds.open();
  return d;
}

export async function addProject(
  visitor: Visitor,
  name: string,
  fields: Partial<DevProject> & Record<string, unknown> = {}
): Promise<DevProject> {
  const d = await dev(visitor);
  const project = await d.api.createProject({ name, ...(fields as any) });
  const n = notes(visitor);
  n.projectIds = { ...(n.projectIds ?? {}), [name]: String(project.id) };
  n.currentProject = name;
  return project;
}

export async function addKey(visitor: Visitor, projectName: string, label: string) {
  const d = await dev(visitor);
  const projectId = notes(visitor).projectIds?.[projectName];
  if (!projectId) throw new Error(`No project "${projectName}" was set up in this scenario`);
  const key = await d.api.createKey(projectId, label);
  const n = notes(visitor);
  n.keyValues = { ...(n.keyValues ?? {}), [label]: key.value };
  n.currentKey = label;
  return key;
}

export function projectId(visitor: Visitor, name?: string): string {
  const n = notes(visitor);
  const key = name ?? n.currentProject;
  const id = key ? n.projectIds?.[key] : undefined;
  if (!id) throw new Error(`No project ${key ?? '(none)'} was set up in this scenario`);
  return id;
}

/** The text a sentence's quoted words and optional [translation.key] stand for. */
export async function copyFor(visitor: Visitor, quoted: string | undefined, key: string | undefined): Promise<string> {
  if (key) return (await dev(visitor)).ds.str(key);
  if (quoted === undefined) throw new Error('A sentence needs quoted words or a [translation.key]');
  return quoted;
}

// --- The account ---------------------------------------------------------------------------

Given('a developer with a profile', async ({ visitor }) => {
  await asDeveloper(visitor);
  await reloadHome(visitor);
});

Given('a developer with a profile and no projects', async ({ visitor }) => {
  await asDeveloper(visitor);
  await reloadHome(visitor);
});

Given('a developer on the home page', async ({ visitor }) => {
  await asDeveloper(visitor);
  await addProject(visitor, 'Verse a Day', { websiteUrl: 'example.com' });
  await addKey(visitor, 'Verse a Day', 'Daily email');
  await reloadHome(visitor);
});

Given(
  'a developer with a profile and a project {string} with a key {string}',
  async ({ visitor }, projectName: string, keyLabel: string) => {
    await asDeveloper(visitor);
    await addProject(visitor, projectName);
    await addKey(visitor, projectName, keyLabel);
    await reloadHome(visitor);
  }
);

Given('a project {string}', async ({ visitor }, projectName: string) => {
  await asDeveloper(visitor);
  await addProject(visitor, projectName, { websiteUrl: 'example.com', organization: 'Example Org' });
  await reloadHome(visitor);
});

Given(/^(.+)'s website is (\S+)$/, async ({ visitor }, projectName: string, site: string) => {
  const d = await dev(visitor);
  await d.api.updateProject(projectId(visitor, projectName), { websiteUrl: site });
  await reloadHome(visitor);
});

// --- Opening and reading pages -------------------------------------------------------------

When('the visitor opens Developer Settings', async ({ visitor }) => {
  await reloadHome(visitor);
});

Then(
  /^the (?:page|home page) reads "([^"]*)"(?: \[([^\]]+)\])?$/,
  async ({ visitor }, quoted: string, key?: string) => {
    const { ds } = await dev(visitor);
    await ds.expectText(await copyFor(visitor, quoted, key));
  }
);

When(
  /^the (?:visitor|developer) clicks "([^"]*)"(?: \[([^\]]+)\])?$/,
  async ({ visitor }, quoted: string, key?: string) => {
    const { page, ds } = await dev(visitor);
    const name = await copyFor(visitor, quoted, key);
    const target = page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true }));
    await expect(target.first()).toBeVisible({ timeout: t(15000) });
    await target.first().click();
    void ds;
  }
);

Then('no success message appears', async ({ visitor }) => {
  const { page } = await dev(visitor);
  // Developer Settings never shows a confirmation toast (Penina, 2026-11-12).
  await page.waitForTimeout(t(1000));
  await expect(page.locator('.devE-toast')).toHaveCount(0);
});
