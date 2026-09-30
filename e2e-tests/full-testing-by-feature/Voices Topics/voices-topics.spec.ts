/**
 * Voices Topics — end-to-end tests against `voices.<sandbox>/topics/<slug>`.
 * Source spec: e2e-tests/.claude/VOICES_TOPICS_TEST_PLAN.csv (TOV-001 → TOV-019).
 *
 * All assertions are anchored on the React component tree from
 * `Sefaria-Project/static/js/TopicPage.jsx` and `Story.jsx` (SheetBlock).
 * Production data was verified on 2026-05-25 via /api/topics/torah.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const TOPIC_SLUG = 'torah';
const TOPIC_TITLE_EN = 'Torah';
const TOPIC_TITLE_HE = 'תורה';

// =============================================================================
// Topic Display & Content (TOV-001 → TOV-005)
// =============================================================================
test.describe('Voices Topics — display & content (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('TOV-001: Topic page loads with core content', { tag: '@sanity' }, async () => {
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().expectTitleText(TOPIC_TITLE_EN);
    await pm.onVoicesTopic().expectDescriptionPresent(100);
    await pm.onVoicesTopic().expectImageVisibleWithAlt();
    await expect(page).toHaveURL(new RegExp(`/topics/${TOPIC_SLUG}`));
  });

  test('TOV-003: Topic image displays and scales across desktop / tablet / mobile viewports', { tag: '@sanity' }, async () => {
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().expectImageVisibleWithAlt();

    // Tablet — still desktop chrome (843px breakpoint not crossed).
    await pm.onVoicesTopic().withViewport(768, 1024, async () => {
      await pm.onVoicesTopic().expectImageVisibleWithAlt();
    });

    // Mobile — below 843px. Voices switches to mobile chrome (deep mobile-UI
    // coverage lives in the mobile config / mobile suite per CLAUDE.md §20),
    // but the topic image itself must remain mounted, have a src, and keep
    // its alt for screen-reader users. We assert exactly that, scoped to the
    // <img> rather than the surrounding mobile shell.
    await pm.onVoicesTopic().withViewport(375, 667, async () => {
      await pm.onVoicesTopic().expectImageVisibleWithAlt();
    });
  });

  test('TOV-004: Sheets list shows on the topic page (per-sheet metadata)', { tag: '@sanity' }, async () => {
    // The CSV item is "topic metadata" (creation date, view count, contributor).
    // Voices does NOT expose creation date / view count at the topic-page
    // level — that data lives inside each sheet. So this test asserts the
    // observable metadata path: ≥1 sheet card renders with title + author byline.
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    const count = await pm.onVoicesTopic().getSheetCount();
    expect(count).toBeGreaterThan(0);
    await pm.onVoicesTopic().expectSheetsHaveMetadata();
  });

  test('TOV-005: Topic title stays in DOM after scrolling the page', async () => {
    // The site header is `position: static` (not sticky) per the React shell —
    // so this test scopes the assertion to the topic title remaining in DOM
    // after a scroll, which is the user-meaningful guarantee for tall lists.
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(t(800));
    await pm.onVoicesTopic().expectTitleStillInDom();
  });
});

// =============================================================================
// Language support (TOV-002 — re-emitted per language)
// =============================================================================
test.describe('Voices Topics — language support (TOV-002)', () => {
  test('TOV-002a: English interface renders English title + description', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().expectTitleText(TOPIC_TITLE_EN);
    await pm.onVoicesTopic().expectDescriptionPresent(100);
    await expect(page.locator('body')).toHaveClass(/interface-english/);
  });

  test('TOV-002b: Hebrew interface renders Hebrew title', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.HE.VOICES, LANGUAGES.HE);
    const pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onVoicesTopic().open(MODULE_URLS.HE.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().expectTitleText(TOPIC_TITLE_HE);
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
  });
});

// =============================================================================
// Sheet listing & interaction (TOV-006, TOV-007, TOV-009, TOV-010, TOV-011)
// =============================================================================
test.describe('Voices Topics — sheet listing & interaction', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('TOV-006: Sheets display with title, author, byline metadata', async () => {
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().expectSheetsHaveMetadata();
  });

  test('TOV-007: Click a sheet → navigates to /sheets/<id>', { tag: '@sanity' }, async () => {
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().clickFirstSheetAndExpectNavigation();
    await expect(page).toHaveURL(/\/sheets\/\d+/);
  });

  test('TOV-009: Anonymous view shows only published sheets (no draft markers)', async () => {
    // CSV's "logged-in author sees own drafts on topic page" leg is intentionally
    // NOT automated — the feature does not exist on the topic page. Django's
    // `sheets_by_tag_api` hardcodes `public=True` regardless of the requester's
    // session (sourcesheets/views.py:948,960), so drafts never appear in
    // /topics/<slug> for ANY user. Author drafts are surfaced on the profile
    // page (`/profile/<slug>`), which is out of scope for this suite.
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().expectNoDraftMarkers();
  });

  test('TOV-010a: Sort param (Relevance vs Newest vs Views) changes the first sheet', { tag: '@sanity' }, async () => {
    test.setTimeout(t(150000));
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG, { sort: 'Relevance' });
    const relevance = await pm.onVoicesTopic().firstSheetTitle();

    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG, { sort: 'Newest' });
    const newest = await pm.onVoicesTopic().firstSheetTitle();

    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG, { sort: 'Views' });
    const views = await pm.onVoicesTopic().firstSheetTitle();

    // At least one sort must produce a different first-title than the others —
    // strict three-way uniqueness would over-constrain (a sheet could share the
    // top spot of two sort orders), so we assert that the set has size ≥ 2.
    const distinct = new Set([relevance, newest, views]);
    expect(distinct.size, `sort orders should not all yield the same first sheet`).toBeGreaterThanOrEqual(2);
  });

  test('TOV-010b: Sort UI — click filter tab → click "Newest" → list reorders + URL + active class', { tag: '@sanity' }, async () => {
    test.setTimeout(t(120000));
    // Start in default (Relevance) order; capture the first sheet for the baseline.
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    const before = await pm.onVoicesTopic().firstSheetTitle();

    // Open the filter strip and switch sort via the dropdown UI.
    await pm.onVoicesTopic().openFilterStrip();
    await pm.onVoicesTopic().clickSortOption('Newest');

    // Three observable outcomes after the click:
    //   1. URL param updates (Voices's FilterableList syncs to URL).
    //   2. The `.active` class moves to Newest.
    //   3. The first sheet title changes from the Relevance baseline.
    await pm.onVoicesTopic().expectSortUrlParam('Newest', page);
    await pm.onVoicesTopic().expectActiveSortOption('Newest');
    const after = await pm.onVoicesTopic().firstSheetTitle();
    expect(after, `clicking Newest should re-order the list (was: ${before})`).not.toBe(before);
  });
});

test.describe('Voices Topics — sheet language preference (TOV-011)', () => {
  test('TOV-011a: Hebrew interface surfaces Hebrew-titled sheets first', { tag: '@sanity' }, async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.HE.VOICES, LANGUAGES.HE);
    const pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onVoicesTopic().open(MODULE_URLS.HE.VOICES, TOPIC_SLUG);
    const titles = await pm.onVoicesTopic().firstNSheetTitles(5);
    // sheetSort (TopicPage.jsx:135) prioritises he-titled rows when interfaceLang === 'hebrew'.
    // First title must contain at least one Hebrew letter.
    expect(titles[0], `first hebrew-interface title should have hebrew chars: ${JSON.stringify(titles[0])}`)
      .toMatch(/[֐-׿]/);
  });

  test('TOV-011b: English interface surfaces English-titled sheets first', async ({ context }) => {
    // The mirror of 11a — `sheetSort` flips polarity when interfaceLang ===
    // 'english' (TopicPage.jsx:145–148): `(aTLangHe + aLangHe) - (bTLangHe + bLangHe)`
    // so en-titled rows sort earlier. Asserting on the first title is a
    // single-row check; for `torah` on production the top-relevance row
    // already happens to be English-titled, so the test could pass for the
    // wrong reason. To guard against that, we assert the stronger contract:
    // of the first 5 surfaced sheets, the **majority** must be en-titled —
    // a true regression in `sheetSort`'s en branch would push hebrew titles
    // upward and trip this counter.
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    const titles = await pm.onVoicesTopic().firstNSheetTitles(5);
    const hebrewBlock = /[֐-׿]/;
    const enLeading = titles.filter(t => !hebrewBlock.test(t)).length;
    expect(enLeading, `en-interface first-5 titles should be majority english-titled (got: ${JSON.stringify(titles)})`)
      .toBeGreaterThanOrEqual(3);
  });
});

// =============================================================================
// Topic discovery & navigation (TOV-012, TOV-015, TOV-016)
// =============================================================================
test.describe('Voices Topics — discovery & navigation', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('TOV-012: Related topics list — links display and navigate', async () => {
    await pm.onVoicesTopic().open(MODULE_URLS.EN.VOICES, TOPIC_SLUG);
    await pm.onVoicesTopic().expectSidebarHasRelatedSection();
    const { href } = await pm.onVoicesTopic().clickFirstRelatedTopic();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  // TOV-015 moved to voices-topics-landing.spec.ts — Trending Topics is a
  // sidebar module on the `/topics` landing page (`TopicsPage.jsx`, Voices
  // branch). It does NOT appear on `/topics/<slug>` pages, whose sidebar
  // (`TopicSideColumn`) only renders Related Topics. Keeping TOV-015 in the
  // landing-page spec preserves the original CSV intent.

  test('TOV-016: A–Z browse — letter pages load and alphabet links work', { tag: '@sanity' }, async () => {
    await pm.onVoicesTopic().openAllTopicsForLetter(MODULE_URLS.EN.VOICES, 'a');
    await pm.onVoicesTopic().expectAllTopicsLetterPagePopulated(1);
    await pm.onVoicesTopic().clickAlphabetLetterAndExpectUrl(MODULE_URLS.EN.VOICES, 'b');
    await expect(page).toHaveURL(/\/topics\/all\/b/);
  });
});

// =============================================================================
// Cross-module behavior (TOV-019)
// =============================================================================
test.describe('Voices Topics — cross-module language persistence (TOV-019)', () => {
  test('TOV-019: Hebrew preference persists when navigating Voices → Library', async ({ context }) => {
    test.setTimeout(t(120000));
    const page = await goToPageWithLang(context, MODULE_URLS.HE.VOICES, LANGUAGES.HE);
    const pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onVoicesTopic().open(MODULE_URLS.HE.VOICES, TOPIC_SLUG);
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);

    // Navigate to Library topic page (different module, same parent domain).
    await page.goto(`${MODULE_URLS.HE.LIBRARY}/topics/${TOPIC_SLUG}`);
    await hideAllModalsAndPopups(page);
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/, { timeout: t(15000) });
  });
});
