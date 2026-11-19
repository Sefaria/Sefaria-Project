import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { developersUrl } from '../../pages/developers/developersCommon';
import { DESCRIBE } from './gallery-entry';

// The server side of the port (PLAN §2.14 items 2 and 6): real status codes, noindex on the charts page, and a
// same-origin projects API. Against the real data: the first published project is read from the listing.
test.describe(`${DESCRIBE} (server)`, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, developersUrl('/powered-by'), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('DEV-GAL-110: a project URL with a stale name answers 301 to the canonical slug', async () => {
    const gallery = pm.onDevelopersGallery();
    await gallery.waitForProjects();
    const [first] = await gallery.projectCards();
    expect(first).toBeDefined();
    const canonical = first!.href;
    const id = canonical.match(/\/projects\/(\d+)/)![1];
    const stale = await gallery.httpGet(`/powered-by/projects/${id}-not-the-name`);
    expect(stale.status).toBe(301);
    expect(new URL(stale.location!, developersUrl('/')).pathname).toBe(canonical);
    expect((await gallery.httpGet(canonical)).status).toBe(200);
  });

  test('DEV-GAL-111: an unknown project id answers a real 404', async () => {
    const response = await pm.onDevelopersGallery().httpGet('/powered-by/projects/999999999-no-such-project');
    expect(response.status).toBe(404);
    expect(response.body).toContain('Project not found');
  });

  test('DEV-GAL-112: the charts page is served noindex, and the gallery index is not', async () => {
    const gallery = pm.onDevelopersGallery();
    const charts = await gallery.httpGet('/powered-by/charts');
    expect(charts.status).toBe(200);
    expect(charts.body).toMatch(/<meta name="robots" content="noindex/);
    const index = await gallery.httpGet('/powered-by');
    expect(index.status).toBe(200);
    expect(index.body).not.toMatch(/<meta name="robots" content="noindex/);
  });

  test('DEV-GAL-113: the gallery reads its projects from the same origin', async () => {
    const gallery = pm.onDevelopersGallery();
    const requests = gallery.recordProjectsRequests();
    await gallery.open('/powered-by?view=list');
    await gallery.waitForProjects();
    await expect.poll(() => requests.length, { timeout: t(10000) }).toBeGreaterThan(0);
    for (const url of requests) expect(new URL(url).origin).toBe(new URL(developersUrl('/')).origin);
  });
});
