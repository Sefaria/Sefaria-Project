import { BrowserContext, Page, test as base } from '@playwright/test';
import { Manifest, ManifestAccount, TargetName, findAccount, loadManifest, resolveTarget } from './env';
import { Gateway } from './gateway';
import { registryUrl } from './registry';
import { mailpitUrl } from './mail';
import { InterfaceLang, contextAs, storageStateFor } from './session';

/**
 * What a target can do. A spec that needs a missing capability calls
 * test.skip(!target.hasX, '<reason>') instead of failing.
 */
export type Target = {
  name: TargetName;
  hasEcho: boolean;
  hasNginx: boolean;
  hasStripOffListener: boolean;
  hasFlagOffServer: boolean;
  hasRegistry: boolean;
  hasMailbox: boolean;
  mocks: boolean;
  canReadNginxLog: boolean;
  canSwapEnvoyConfig: boolean;
};

export function capabilities(name: TargetName): Target {
  const local = name === 'local';
  return {
    name,
    hasEcho: local,
    hasNginx: true,
    hasStripOffListener: local,
    hasFlagOffServer: local,
    hasRegistry: registryUrl(name) !== undefined,
    hasMailbox: mailpitUrl(name) !== undefined,
    mocks: local ? process.env.DEVELOPER_SETTINGS_MOCKS === 'true' : true,
    canReadNginxLog: true,
    canSwapEnvoyConfig: false,
  };
}

export type AccountSession = {
  account: ManifestAccount;
  context: BrowserContext;
  page: Page;
  /** Storage-state file for the account, for callers that build their own context. */
  storageState: string;
};

type Fixtures = {
  manifest: Manifest;
  target: Target;
  gw: Gateway;
  /**
   * Opens a logged-in context for one of the manifest's accounts. Contexts are closed after
   * the test. Use only your own suite's accounts.
   */
  account: (suite: string, role: string, opts?: { host?: string; lang?: InterfaceLang; stubStrapi?: boolean }) => Promise<AccountSession>;
};

export const test = base.extend<Fixtures>({
  manifest: async ({}, use) => {
    await use(loadManifest());
  },

  target: async ({}, use) => {
    await use(capabilities(resolveTarget()));
  },

  gw: async ({ target }, use) => {
    const gw = await Gateway.create(target.name);
    await use(gw);
    await gw.dispose();
  },

  account: async ({ browser, target }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (suite, role, opts = {}) => {
      const account = findAccount(suite, role);
      const storageState = storageStateFor(suite, role);
      const context = await contextAs(browser, target.name, suite, role, opts);
      opened.push(context);
      const page = await context.newPage();
      return { account, context, page, storageState };
    });
    for (const c of opened) await c.close().catch(() => {});
  },
});

export { expect } from '@playwright/test';

/**
 * Calls a same-origin Django API from the page, so the session cookie, Origin, Referer and CSRF
 * header are the browser's own. Node-side requests carry no browser cookies on the local stack.
 */
export async function pageFetch(
  page: Page,
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<{ status: number; json: any; text: string }> {
  return page.evaluate(async ({ path, method, body }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1];
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRFToken': decodeURIComponent(csrf) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: response.status, json, text };
  }, { path, method, body });
}
