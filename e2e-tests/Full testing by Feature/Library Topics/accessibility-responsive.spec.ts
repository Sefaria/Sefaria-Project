/**
 * Library Topics — Accessibility & Responsive (LIB-024 → LIB-027).
 *
 * Notes on scope:
 *  - LIB-025 (screen reader) cannot be fully automated in Playwright — assistive
 *    technology (NVDA/JAWS/VoiceOver) is not driveable here. We assert the
 *    automatable a11y substructure (single meaningful h1, image alt text) as the
 *    proxy contract; full AT verification stays a manual audit (CLAUDE.md §13:
 *    skips reserved for harness limitations — this is one).
 *  - LIB-026/LIB-027 run as viewport-resize structural checks in the desktop
 *    project (same approach as Voices Topics TOV-003). Deep mobile-chrome flows
 *    live in the separate mobile config (CLAUDE.md §20).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const SLUG = 'torah';
const LIB = MODULE_URLS.EN.LIBRARY;

test.describe('Library Topics — accessibility & responsive', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('LIB-024: Keyboard navigation reaches interactive elements and opens a source via Enter', async () => {
    test.setTimeout(t(90000));
    await pm.onLibraryTopic().open(LIB, SLUG);

    // Tabbing from the top should land focus on a visible, interactive element.
    let focusedInteractive = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0;
        return visible ? el.tagName.toLowerCase() : null;
      });
      if (tag === 'a' || tag === 'button' || tag === 'input') {
        focusedInteractive = true;
        break;
      }
    }
    expect(focusedInteractive, 'Tab should move focus onto a visible interactive element').toBe(true);

    // A source reference link must be keyboard-activatable (focus + Enter navigates).
    const refLink = page.locator('.story.topicPassageStory .headerWithAdminButtons a').first();
    const href = await refLink.getAttribute('href');
    await refLink.focus();
    await expect(refLink).toBeFocused({ timeout: t(5000) });
    await Promise.all([
      page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t(25000) }),
      page.keyboard.press('Enter'),
    ]);
  });

  test('LIB-025: Topic page exposes accessible heading + image structure (a11y substructure)', async () => {
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().expectAccessibleHeadingStructure();
    // Topic image carries alt text for screen readers.
    await pm.onLibraryTopic().expectImageVisibleWithAlt();
  });

  test('LIB-026: Topic page is usable at a 375px mobile viewport (no horizontal scroll)', async () => {
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().withViewport(375, 667, async () => {
      await pm.onLibraryTopic().expectTitleStillInDom();
      await pm.onLibraryTopic().expectNoHorizontalScroll();
      // Source cards remain rendered (stacked) at mobile width.
      expect(await pm.onLibraryTopic().getSourceCount()).toBeGreaterThan(0);
    });
  });

  test('LIB-027: Topic page reflows cleanly at a 768px tablet viewport', async () => {
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().withViewport(768, 1024, async () => {
      await pm.onLibraryTopic().expectTitleStillInDom();
      await pm.onLibraryTopic().expectNoHorizontalScroll();
      await pm.onLibraryTopic().expectImageVisibleWithAlt();
      expect(await pm.onLibraryTopic().getSourceCount()).toBeGreaterThan(0);
    });
    // Landscape rotation (1024px) — content must survive the reflow.
    await pm.onLibraryTopic().withViewport(1024, 768, async () => {
      await pm.onLibraryTopic().expectNoHorizontalScroll();
      expect(await pm.onLibraryTopic().getSourceCount()).toBeGreaterThan(0);
    });
  });
});
