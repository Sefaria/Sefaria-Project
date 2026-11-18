import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { ENDPOINTS, RECORDED_TEXTS_200, RECORDED_TEXTS_404, enterBlank, enterPortal } from '../developers-entry';

// Try It (PLAN §6.2 E). Every test but DEV-TRY-001 answers the API call with a recorded response
// (fulfillApiWith), so nothing reaches www.sefaria.org; DEV-TRY-001 calls production, as the brief asks.

test.describe('Developers Try It, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterBlank(context));
  });

  async function open(path: string = ENDPOINTS.texts.path) {
    await pm.onDevelopersShell().openPath(path);
    await expect.poll(() => pm.onDevelopersReference().methodBadge(), { timeout: t(15000) }).toBeTruthy();
  }

  test(
    'DEV-TRY-001: Try It on get-v3-texts with Genesis 1:1 shows status 200 and JSON',
    { tag: ['@sanity', '@pr'] },
    async () => {
      test.slow();
      const tryIt = pm.onDevelopersTryIt();
      const reference = pm.onDevelopersReference();
      const watched = await tryIt.watchApiRequests();
      await open();
      await reference.fillParameter('path', 'tref', 'Genesis 1:1');
      await tryIt.clickTryIt();
      await tryIt.waitForResult();
      expect((await tryIt.responseStatus()).code).toBe(200);
      const body = JSON.parse(await tryIt.responseBodyText());
      expect(body.ref).toBe('Genesis 1:1');
      expect(watched.requests[0].url).toMatch(/^https:\/\/www\.sefaria\.org\/api\/v3\/texts\/Genesis%201(%3A|:)1/);
    }
  );

  test('DEV-TRY-002: Clicking Try It shows a loading state, then the status with a green dot', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200, delayMs: 1500 });
    await open();
    await tryIt.clickTryIt();
    await expect.poll(() => tryIt.isLoading(), { timeout: t(5000) }).toBe(true);
    await tryIt.waitForResult();
    const status = await tryIt.responseStatus();
    expect(status.code).toBe(200);
    expect(status.dotColor).toBe('rgb(18, 202, 147)');
  });

  test('DEV-TRY-003: The response shows the JSON with line numbers and fold markers', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    expect(JSON.parse(await tryIt.responseBodyText())).toEqual(JSON.parse(RECORDED_TEXTS_200));
    expect(await tryIt.hasLineNumbers()).toBe(true);
    expect(await tryIt.hasFoldMarkers()).toBe(true);
  });

  test('DEV-TRY-004: A reference that does not exist shows a red 404 dot and the error message', async () => {
    const tryIt = pm.onDevelopersTryIt();
    const reference = pm.onDevelopersReference();
    await tryIt.fulfillApiWith({ status: 404, body: RECORDED_TEXTS_404 });
    await open();
    await reference.fillParameter('path', 'tref', 'Notabook 1:1');
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    const status = await tryIt.responseStatus();
    expect(status.code).toBe(404);
    const [r, g, b] = status.dotColor.match(/\d+/g)!.map(Number);
    expect(r, status.dotColor).toBeGreaterThan(Math.max(g, b) + 80);
    expect(await tryIt.responseBodyText()).toContain('Could not find title in reference');
  });

  test('DEV-TRY-005: The status dropdown lists the examples and "Clear Response"; clearing empties the card', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    const entries = await tryIt.openStatusMenu();
    expect(entries).toContain('200 - Esther 1.1');
    expect(entries[entries.length - 1]).toBe('Clear Response');
    await tryIt.clearResponse();
    expect(await pm.onDevelopersReference().responseExampleLabel()).toBeNull();
  });

  test('DEV-TRY-006: "Headers" opens a modal with RESPONSE and REQUEST sections and a Close button', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200, headers: { 'x-e2e': 'recorded' } });
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    const headers = await tryIt.openHeadersModal();
    expect(headers.response['content-type']).toMatch(/application\/json/);
    expect(Object.keys(headers.request).map((k) => k.toLowerCase())).toContain('accept');
    expect(await tryIt.isHeadersModalOpen()).toBe(true);
    await tryIt.closeHeadersModal();
    expect(await tryIt.isHeadersModalOpen()).toBe(false);
  });

  test('DEV-TRY-007: The request fires even when required fields are empty', async () => {
    const tryIt = pm.onDevelopersTryIt();
    const reference = pm.onDevelopersReference();
    const capture = await tryIt.fulfillApiWith({ status: 404, body: RECORDED_TEXTS_404 });
    await open();
    await reference.fillParameter('path', 'tref', '');
    await tryIt.clickTryIt();
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBe(1);
    expect(capture.requests[0].url).toMatch(/^https:\/\/www\.sefaria\.org\/api\/v3\/texts\//);
  });

  test('DEV-TRY-008: The request URL is built from the form with each value encoded', async () => {
    const tryIt = pm.onDevelopersTryIt();
    const reference = pm.onDevelopersReference();
    const capture = await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await open();
    await reference.fillParameter('path', 'tref', 'Genesis 1:1');
    await reference.fillParameter('query', 'version', 'english|The Contemporary Torah');
    await reference.selectEnumValue('query', 'return_format', 'text_only');
    await tryIt.clickTryIt();
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBe(1);
    const url = new URL(capture.requests[0].url);
    expect(url.origin).toBe('https://www.sefaria.org');
    expect(decodeURIComponent(url.pathname)).toBe('/api/v3/texts/Genesis 1:1');
    expect(url.searchParams.get('version')).toBe('english|The Contemporary Torah');
    expect(url.searchParams.get('return_format')).toBe('text_only');
    expect(capture.requests[0].method).toBe('GET');
  });

  test('DEV-TRY-009: A POST with a body sends the filled-in JSON', async () => {
    const tryIt = pm.onDevelopersTryIt();
    const reference = pm.onDevelopersReference();
    const capture = await tryIt.fulfillApiWith({ status: 202, body: JSON.stringify({ task_id: 'e2e-task' }) });
    await open(ENDPOINTS.findRefs.path);
    await reference.expandBodyObject('text');
    await reference.fillParameter('body', 'text.body', 'See Genesis 1:1 for the beginning.');
    await reference.fillParameter('body', 'text.title', 'e2e');
    await tryIt.clickTryIt();
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBe(1);
    expect(capture.requests[0].method).toBe('POST');
    expect(capture.requests[0].headers['content-type']).toMatch(/application\/json/);
    expect(JSON.parse(capture.requests[0].body ?? '{}')).toMatchObject({
      text: { body: 'See Genesis 1:1 for the beginning.', title: 'e2e' },
    });
    await tryIt.waitForResult();
    expect((await tryIt.responseStatus()).code).toBe(202);
  });

  test('DEV-TRY-010: A new row appears at once in Recent Requests; clicking it selects it', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await open();
    expect(await tryIt.recentRequests()).toEqual([]);
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    const rows = await tryIt.recentRequests();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'GET', status: 200, when: 'Less than a minute ago', selected: false });
    await tryIt.selectRecentRequest(0);
    expect((await tryIt.recentRequests())[0].selected).toBe(true);
  });

  test('DEV-TRY-011: Recent Requests survive a reload in the same browser', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 404, body: RECORDED_TEXTS_404 });
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    await open();
    const rows = await tryIt.recentRequests();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(404);
  });

  test('DEV-TRY-012: The Try It button is #612854 and turns blue on hover', async () => {
    await open();
    const colors = await pm.onDevelopersTryIt().tryItButtonColors();
    expect(colors.normal).toBe('rgb(97, 40, 84)');
    const [r, g, b] = colors.hover.match(/\d+/g)!.map(Number);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  test('DEV-TRY-013: No elapsed time is shown', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200, delayMs: 300 });
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    expect(await tryIt.hasElapsedTime()).toBe(false);
  });

  test('DEV-TRY-014: The response copy button copies the body and says "Copied!"', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    expect(await tryIt.copyResponse()).toBe('Copied!');
    expect(JSON.parse(await pm.onDevelopersReference().clipboardText())).toEqual(JSON.parse(RECORDED_TEXTS_200));
  });

  test('DEV-TRY-015: The result is announced to screen readers', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    await expect.poll(() => tryIt.liveRegionText(), { timeout: t(5000) }).toBe('Response 200');
  });

  test('DEV-TRY-016: A request that fails without a response shows an error, not a crash', async () => {
    const tryIt = pm.onDevelopersTryIt();
    await tryIt.failApiRequests();
    await open();
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    const rows = await tryIt.recentRequests();
    expect(rows[0].status).toBe(0);
    expect(await pm.onDevelopersShell().pageTitle()).toBe(ENDPOINTS.texts.title);
  });
});

test.describe('Developers Try It, English (fresh browser)', () => {
  test('DEV-TRY-017: Recent Requests are empty in another browser', async ({ browser, context }) => {
    const first = await enterPortal(context, ENDPOINTS.texts.path);
    await first.pm.onDevelopersTryIt().fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await first.pm.onDevelopersTryIt().clickTryIt();
    await first.pm.onDevelopersTryIt().waitForResult();
    expect(await first.pm.onDevelopersTryIt().recentRequests()).toHaveLength(1);
    const other = await browser.newContext();
    try {
      const second = await enterPortal(other, ENDPOINTS.texts.path);
      expect(await second.pm.onDevelopersTryIt().recentRequests()).toEqual([]);
    } finally {
      await other.close();
    }
  });
});
