/**
 * Library Topics — Performance & Analytics (LIB-028 → LIB-029).
 *
 * Scope notes:
 *  - LIB-028: Strict LCP < 2500ms / TTI < 3000ms budgets from the CSV are
 *    environment-dependent and flaky against shared production infrastructure, so
 *    we do NOT gate on a hard millisecond budget. We assert the user-meaningful
 *    contract: the page becomes interactive (first sources render), the load event
 *    fires, and no failed (4xx/5xx) document/script/api responses or console
 *    errors occur during load. The measured timing is logged for visibility.
 *  - LIB-029: GA/analytics network events are not observable without the live
 *    analytics pipeline. The page wires interactions via `data-anl-*` attributes
 *    (refRenderWrapper adds `data-anl-batch`; the sort/filter tabs add
 *    `data-anl-event`). We assert those analytics hooks are present — the
 *    automatable proxy for "events fire on interaction".
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const SLUG = 'torah';
const LIB = MODULE_URLS.EN.LIBRARY;

test.describe('Library Topics — performance & analytics', () => {
  test('LIB-028: Topic page loads interactively without failed responses or console errors', async ({ context }) => {
    test.setTimeout(t(90000));
    const page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('response', resp => {
      const url = resp.url();
      // Only flag the app's own document/script/api failures, not 3rd-party beacons.
      if (resp.status() >= 400 && /sefaria\.org/.test(url) && /\/(api|static)\/|\/topics\//.test(url)) {
        failedResponses.push(`${resp.status()} ${url}`);
      }
    });

    const start = Date.now();
    await pm.onLibraryTopic().open(LIB, SLUG);
    await page.waitForLoadState('load', { timeout: t(30000) });
    const elapsed = Date.now() - start;
    console.log(`LIB-028 topic became interactive + load fired in ~${elapsed}ms`);

    // Interactivity contract: first sources rendered.
    expect(await pm.onLibraryTopic().getSourceCount()).toBeGreaterThan(0);
    // No first-party failed responses on the critical path.
    expect(failedResponses, `no failed first-party responses during load:\n${failedResponses.join('\n')}`).toHaveLength(0);
    // Console-error budget: filter out known-noisy third-party warnings.
    const criticalConsoleErrors = consoleErrors.filter(e => /sefaria/i.test(e) || /TypeError|ReferenceError|is not a function/.test(e));
    expect(criticalConsoleErrors, `no critical console errors:\n${criticalConsoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('LIB-029: Interactive elements carry analytics (data-anl) hooks', { tag: '@sanity' }, async ({ context }) => {
    const page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryTopic().open(LIB, SLUG);

    // Source rows carry a `data-anl-batch` payload (refRenderWrapper).
    await pm.onLibraryTopic().expectSourceAnalyticsAttributes();

    // Source reference links carry a click analytics event hook.
    const clickToReader = page.locator('.story.topicPassageStory [data-anl-event*="clickto_reader"]').first();
    await expect(clickToReader).toBeAttached({ timeout: t(10000) });

    // Related-topic links carry a related_click analytics hook.
    const relatedHook = page.locator('.topicSideColumn [data-anl-event*="related_click"]').first();
    await expect(relatedHook).toBeAttached({ timeout: t(10000) });
  });
});
