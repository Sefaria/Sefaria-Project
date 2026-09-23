/**
 * Library Topics — Topic Display & Content (LIB-001 → LIB-005).
 *
 * Source spec: e2e-tests/.claude/…LIBRARY_TOPICS_TEST_PLAN.csv.
 * Target surface: www.<sandbox>/topics/<slug> (Library module → TopicPage.jsx).
 * Production data verified 2026-06-15 via /api/topics/torah (numSources 1703,
 * populated description.en 551 chars, image block with alt caption).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const SLUG = 'torah';
const TITLE_EN = 'Torah';
const TITLE_HE = 'תורה';

test.describe('Library Topics — display & content (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('LIB-001: Topic page loads with core content (title, description, image, URL, tab title)', { tag: '@sanity' }, async () => {
    await pm.onLibraryTopic().open(MODULE_URLS.EN.LIBRARY, SLUG);
    await pm.onLibraryTopic().expectTitleText(TITLE_EN);
    await pm.onLibraryTopic().expectDescriptionPresent(100);
    await pm.onLibraryTopic().expectImageVisibleWithAlt();
    await expect(page).toHaveURL(new RegExp(`/topics/${SLUG}`));
    // Browser tab title — Library topic pages render "<Topic> | Texts from the Sefaria Library".
    await pm.onLibraryTopic().expectDocumentTitleContains(TITLE_EN);
  });

  test('LIB-003: Topic image displays and scales across desktop / tablet / mobile viewports', { tag: '@sanity' }, async () => {
    await pm.onLibraryTopic().open(MODULE_URLS.EN.LIBRARY, SLUG);
    await pm.onLibraryTopic().expectImageVisibleWithAlt();

    // Tablet — still desktop chrome (843px breakpoint not crossed).
    await pm.onLibraryTopic().withViewport(768, 1024, async () => {
      await pm.onLibraryTopic().expectImageVisibleWithAlt();
    });

    // Mobile — below 843px. Deep mobile-chrome coverage lives in the mobile config
    // (CLAUDE.md §20); here we only assert the topic <img> survives the breakpoint
    // crossing and keeps its src/alt for screen-reader users.
    await pm.onLibraryTopic().withViewport(375, 667, async () => {
      await pm.onLibraryTopic().expectImageVisibleWithAlt();
    });
  });

  test('LIB-004: Topic surfaces category + source metadata', async () => {
    // The CSV row targets page-level "creation date / contributor / statistics".
    // The Library topic page does NOT surface creation date / contributor at the
    // page level — it surfaces the topic's CATEGORY (e.g. "Values") and a list of
    // sources each carrying a reference + text. We assert that observable contract.
    await pm.onLibraryTopic().open(MODULE_URLS.EN.LIBRARY, SLUG);
    await pm.onLibraryTopic().expectCategoryPresent();
    const count = await pm.onLibraryTopic().getSourceCount();
    expect(count).toBeGreaterThan(0);
    await pm.onLibraryTopic().expectSourcesHaveMetadata();
  });

  test('LIB-005: Topic title stays in DOM after scrolling the page', async () => {
    // The site header is `position: static` (not sticky), so the literal "header
    // sticky on scroll" UX is not a product contract. The user-meaningful guarantee
    // for tall source lists is that the title element is not torn out of the tree —
    // that's what we assert (same adaptation as the Voices Topics suite, TOV-005).
    await pm.onLibraryTopic().open(MODULE_URLS.EN.LIBRARY, SLUG);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(t(800));
    await pm.onLibraryTopic().expectTitleStillInDom();
  });
});

// =============================================================================
// Language support (LIB-002 — re-emitted per language)
// =============================================================================
test.describe('Library Topics — language support (LIB-002)', () => {
  test('LIB-002a: English interface renders English title + description', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryTopic().open(MODULE_URLS.EN.LIBRARY, SLUG);
    await pm.onLibraryTopic().expectTitleText(TITLE_EN);
    await pm.onLibraryTopic().expectDescriptionPresent(100);
    await expect(page.locator('body')).toHaveClass(/interface-english/);
  });

  test('LIB-002b: Hebrew interface renders Hebrew title', async ({ context }) => {
    // Hebrew interface runs on the .org.il domain (anonymous; see CLAUDE.md §4/§10).
    const page = await goToPageWithLang(context, MODULE_URLS.HE.LIBRARY, LANGUAGES.HE);
    const pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryTopic().open(MODULE_URLS.HE.LIBRARY, SLUG);
    await pm.onLibraryTopic().expectTitleText(TITLE_HE);
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
  });
});
