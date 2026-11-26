import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, enterPortal } from '../developers-entry';

// The redirect table of PLAN §2.4 (ReadMe's built-in redirects and the portal's own). The URL-parity crawl
// against live's recorded statuses (§6.4, url-parity.spec.ts) is W17's.
test.describe('Developers Redirects, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  const location = (headers: Record<string, string>) => {
    const value = headers['location'] ?? '';
    return value.startsWith('/') ? value : new URL(value).pathname + new URL(value).search;
  };

  // The @sanity/@pr journey of this table is W17's DEV-RDR-001 (url-parity.spec.ts); this is the browser-free
  // check of the same four rows with their exact status codes, in the full suite only.
  test('DEV-RDR-101: /docs, /reference, /docs/getting-started and /v1.0/docs/welcome redirect as specified', async () => {
    const copy = pm.onDevelopersCopyPage();
    const expected: [string, number, string][] = [
      ['/docs', 301, '/docs/welcome'],
      ['/reference', 301, '/reference/getting-started'],
      ['/docs/getting-started', 301, '/docs/welcome'],
      ['/v1.0/docs/welcome', 302, '/docs/welcome'],
    ];
    for (const [path, status, target] of expected) {
      const result = await copy.httpGet(path);
      expect(result.status, path).toBe(status);
      expect(location(result.headers), path).toBe(target);
    }
  });

  test('DEV-RDR-102: /docs/ redirects to /docs, and a docs page with a trailing slash to the page', async () => {
    const copy = pm.onDevelopersCopyPage();
    const docs = await copy.httpGet('/docs/');
    expect(docs.status).toBe(301);
    expect(location(docs.headers)).toBe('/docs');
    const welcome = await copy.httpGet('/docs/welcome/');
    expect(welcome.status).toBe(301);
    expect(location(welcome.headers)).toBe('/docs/welcome');
  });

  test('DEV-RDR-103: /v1.0 goes home and /v1.0/<rest> to /<rest>', async () => {
    const copy = pm.onDevelopersCopyPage();
    const root = await copy.httpGet('/v1.0');
    expect(root.status).toBe(302);
    expect(location(root.headers)).toBe('/');
    const reference = await copy.httpGet('/v1.0/reference/get-v3-texts');
    expect(reference.status).toBe(302);
    expect(location(reference.headers)).toBe('/reference/get-v3-texts');
  });

  test('DEV-RDR-104: A custom page with a trailing slash is served directly', async () => {
    const result = await pm.onDevelopersCopyPage().httpGet(`${DOC_PAGES.contact}/`);
    expect(result.status).toBe(200);
  });

  test("DEV-RDR-105: /login sends the visitor to the library host's login", async () => {
    const result = await pm.onDevelopersCopyPage().httpGet('/login');
    expect(result.status).toBe(302);
    expect(result.headers['location']).toMatch(/\/login/);
  });

  test('DEV-RDR-106: Following /docs in the browser lands on the welcome page', async () => {
    await pm.onDevelopersShell().openPath('/docs');
    await expect(page).toHaveURL(/\/docs\/welcome$/, { timeout: t(15000) });
    expect(await pm.onDevelopersShell().pageTitle()).toBe("Welcome to Sefaria's Technical Documentation");
  });

  test('DEV-RDR-107: An unknown address that is not in the redirect table is a 404', async () => {
    expect((await pm.onDevelopersCopyPage().httpGet('/reference/no-such-endpoint-e2e')).status).toBe(404);
  });
});
