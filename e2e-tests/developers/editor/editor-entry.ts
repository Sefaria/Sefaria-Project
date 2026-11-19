/**
 * Entry for the DEV-EDIT suites. The editor is staff only (PLAN §2.11, §2.3.5), so tests need a signed-in
 * staff account:
 *
 * - On a sandbox: the `enAdmin` storage state written by global-setup.ts (the library login; its session
 *   cookie is shared with the developers host). This is C7's "Given I am logged in as staff".
 * - On the standalone portal (no library host, no Sefaria login): set `E2E_DEVPORTAL_STAFF_USERNAME` /
 *   `E2E_DEVPORTAL_STAFF_PASSWORD` (a staff user of the standalone database) and, for the non-staff
 *   refusal, `E2E_DEVPORTAL_USER_USERNAME` / `E2E_DEVPORTAL_USER_PASSWORD`; the helper signs in through
 *   the developers host's Django admin login. See README.md.
 *
 * When neither is available the helper throws, so the test fails with the reason rather than passing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserContext, Page } from '@playwright/test';
import { goToPageWithUser } from '../../utils';
import { BROWSER_SETTINGS } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { developersUrl } from '../../pages/developers/developersCommon';
import { enterBlank } from '../developers-entry';

/** A per-run prefix for the hidden pages real-write tests create (PLAN §5.2.2 "Writes"). */
export const RUN_ID = `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

type Profile = { file: string; lang: string };

async function enterAs(
  context: BrowserContext,
  profile: Profile,
  env: { username: string; password: string },
  pagePath: string
): Promise<{ page: Page; pm: PageManager }> {
  if (fs.existsSync(path.join(__dirname, '..', '..', profile.file))) {
    const page = await goToPageWithUser(context, developersUrl(pagePath), profile);
    return { page, pm: new PageManager(page, profile.lang) };
  }
  // A session id of the standalone database (the Django admin login admits staff only, so this is how a
  // local run signs in a non-staff account): E2E_DEVPORTAL_USER_SESSION / E2E_DEVPORTAL_STAFF_SESSION.
  const session = process.env[env.username.replace(/_USERNAME$/, '_SESSION')];
  if (session) {
    const { hostname } = new URL(developersUrl('/'));
    await context.addCookies([{ name: 'sessionid', value: session, domain: hostname, path: '/' }]);
    const { page, pm } = await enterBlank(context);
    await pm.onDevelopersEditor().open();
    if (pagePath !== '/editor') await pm.onDevelopersShell().openPath(pagePath);
    return { page, pm };
  }
  const username = process.env[env.username];
  const password = process.env[env.password];
  if (!username || !password) {
    throw new Error(
      `No ${profile.file} (global-setup needs PLAYWRIGHT_* credentials) and no ${env.username}/${env.password} ` +
        'for the standalone portal: this editor test needs a signed-in account (see e2e-tests/developers/editor/README.md).'
    );
  }
  const { page, pm } = await enterBlank(context);
  await pm.onDevelopersEditor().signInWithPassword(username, password, pagePath);
  return { page, pm };
}

export function enterEditorAsStaff(context: BrowserContext, pagePath = '/editor') {
  return enterAs(
    context,
    BROWSER_SETTINGS.enAdmin,
    { username: 'E2E_DEVPORTAL_STAFF_USERNAME', password: 'E2E_DEVPORTAL_STAFF_PASSWORD' },
    pagePath
  );
}

export function enterAsNonStaff(context: BrowserContext, pagePath = '/editor') {
  return enterAs(
    context,
    BROWSER_SETTINGS.enUser,
    { username: 'E2E_DEVPORTAL_USER_USERNAME', password: 'E2E_DEVPORTAL_USER_PASSWORD' },
    pagePath
  );
}
