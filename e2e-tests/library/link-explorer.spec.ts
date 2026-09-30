import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * Link Explorer (`/explore`) hover, tooltip, and drill-down behavior.
 *
 * Regression coverage for the Chrome 144 breakage of `moveToFront()` in
 * `static/js/explore.js`. Chrome 144 shipped "boundary event dispatch tracks
 * node removal" (Interop 2025): once the element under the pointer is removed
 * from the DOM, the browser stops delivering mouseout / mousemove / click to
 * it. The old `moveToFront()` raised the hovered arc with
 * `parentNode.appendChild(this)` — a remove-and-reinsert — so every hovered arc
 * went deaf, leaving highlights stuck on, the tooltip parked at its default
 * (0,0) position, and clicks doing nothing.
 *
 * The four tests split into two kinds, and the difference matters when reading
 * a failure:
 *
 *   LEX-001 asserts the underlying invariant — the hovered arc is never
 *   detached. It fails against unfixed code on ANY Chromium version, because
 *   the detach is a DOM fact rather than an event-dispatch consequence.
 *
 *   LEX-002 / LEX-003 / LEX-004 assert the user-visible symptoms, and they do
 *   NOT catch this defect — measured, not assumed. Replayed against the
 *   known-unfixed production bundle they fail under playwright-core 1.56 with
 *   Chromium 145, but pass under 1.62 with Chromium 145 or 151, at every
 *   `mouse.move` step count tried (1, 5, 25). The detach still happens there
 *   (LEX-001 still fails); Playwright's synthetic input simply re-establishes
 *   the hover chain that a real pointer does not, so the symptom never
 *   surfaces. Treat them as coverage of ordinary hover / tooltip / drill-down
 *   behavior — they would catch a highlight that never applies or a click
 *   handler that vanishes — and never as a reason to weaken LEX-001.
 *
 *   Filed upstream as microsoft/playwright#42270, with a minimal repro.
 */
test.describe('Library Link Explorer — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    // The explorer fetches every book-to-book link count and renders ~1,000 SVG
    // arcs before anything is hoverable, which outruns the default budget on a
    // cold cauldron.
    test.setTimeout(t(120000));

    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/explore`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLinkExplorer().waitForArcsRendered();
  });

  test('LEX-001: hovering an arc never detaches it from the DOM', async () => {
    const detachments = await pm.onLinkExplorer().detachmentsWhileHoveringAnArc();

    expect(
      detachments,
      'the hovered arc was removed from #links; a browser stops sending ' +
        'mouseout/mousemove/click to a node detached under the pointer, which ' +
        'strands the highlight and the tooltip and kills the click',
    ).toBe(0);
  });

  test('LEX-002: highlight clears when the pointer leaves the arc', async () => {
    await pm.onLinkExplorer().hoverAnArc();
    expect(await pm.onLinkExplorer().activeArcCount()).toBeGreaterThan(0);

    await pm.onLinkExplorer().movePointerClearOfArcs();

    await expect
      .poll(() => pm.onLinkExplorer().activeArcCount(), { timeout: t(10000) })
      .toBe(0);
  });

  test('LEX-003: tooltip hides when the pointer leaves the arc', async () => {
    await pm.onLinkExplorer().hoverAnArc();
    await expect
      .poll(() => pm.onLinkExplorer().tooltipIsShowing(), { timeout: t(10000) })
      .toBe(true);

    await pm.onLinkExplorer().movePointerClearOfArcs();

    await expect
      .poll(() => pm.onLinkExplorer().tooltipIsShowing(), { timeout: t(10000) })
      .toBe(false);
  });

  test('LEX-004: clicking an arc drills into the two books it joins', async () => {
    await pm.onLinkExplorer().hoverAnArc();
    await pm.onLinkExplorer().clickHoveredArc();

    // _getHistory() appends one path segment per opened book (explore.js:1139),
    // so drilling into an arc yields /explore/<Book>/<Book>.
    await expect(page).toHaveURL(/\/explore\/[^/]+\/[^/]+/, { timeout: t(15000) });
  });
});
