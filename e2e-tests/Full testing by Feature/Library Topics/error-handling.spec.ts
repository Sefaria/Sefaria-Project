/**
 * Library Topics — Error Handling & Edge Cases (LIB-021 → LIB-023).
 *
 * LIB-022 (empty topic) and LIB-023 (network failure) exercise code paths that
 * production data can't reliably trigger, so they intercept the topic API
 * (CLAUDE.md rule 18: intercept the network call instead of depending on a
 * fragile data state). The interception simulates the empty / failed response
 * and asserts the page degrades gracefully — it does NOT mutate production.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const SLUG = 'torah';
const LIB = MODULE_URLS.EN.LIBRARY;

test.describe('Library Topics — error handling & edge cases', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('LIB-021: Non-existent topic returns a Page Not Found state with a way out', async () => {
    const resp = await page.goto(`${LIB}/topics/nonexistenttopic2026zzz`);
    // The server returns a real 404 for unknown topic slugs.
    expect(resp?.status(), 'unknown topic slug should return HTTP 404').toBe(404);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryTopic().expectNotFoundState();
  });

  test('LIB-022: Topic with no sources renders header gracefully (empty-state)', async ({ context }) => {
    test.setTimeout(t(90000));
    const emptyPage = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    const emptyPm = new PageManager(emptyPage, LANGUAGES.EN);

    // Strip `refs` from the topic API response → the client computes no source
    // tabs → TopicPageTabView renders null (TopicPage.jsx:825). The topic header
    // (title / description / image) must still render and the layout must not break.
    await emptyPage.route('**/api/v2/topics/**', async (route) => {
      try {
        const response = await route.fetch();
        const data = await response.json();
        data.refs = {};
        await route.fulfill({ response, json: data });
      } catch {
        await route.continue();
      }
    });

    await emptyPage.goto(`${LIB}/topics/${SLUG}`);
    await hideAllModalsAndPopups(emptyPage);
    // Header still renders.
    await expect(emptyPage.locator('.topicPanel .navTitle h1')).toBeVisible({ timeout: t(15000) });
    // No source cards — the empty state, not a crash.
    await expect(emptyPage.locator('.story.topicPassageStory')).toHaveCount(0, { timeout: t(10000) });
    // Page is still functional: global Topics nav remains reachable.
    await expect(emptyPage.locator('a[href^="/topics"]').first()).toBeVisible({ timeout: t(10000) });
  });

  test('LIB-023: Topic page degrades gracefully when the topic API fails', async ({ context }) => {
    test.setTimeout(t(90000));
    const failPage = await goToPageWithLang(context, LIB, LANGUAGES.EN);

    // Abort the topic data fetch to simulate a network failure mid-load.
    await failPage.route('**/api/v2/topics/**', route => route.abort());

    await failPage.goto(`${LIB}/topics/${SLUG}`).catch(() => {});
    await hideAllModalsAndPopups(failPage);

    // Sefaria has no explicit "retry" button (the CSV's retry-button premise is
    // not a product feature); the meaningful guarantee is that the app shell does
    // not white-screen — the global header/nav still renders and no source cards
    // appear. We assert the page is not a blank document and Topics nav is reachable.
    await expect(failPage.locator('a[href^="/topics"]').first()).toBeVisible({ timeout: t(15000) });
    await expect(failPage.locator('.story.topicPassageStory')).toHaveCount(0, { timeout: t(10000) });
    const bodyText = (await failPage.locator('body').innerText()).trim();
    expect(bodyText.length, 'page should not be a blank white screen on API failure').toBeGreaterThan(0);
  });
});
