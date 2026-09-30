/**
 * Library Topics — Text Source Listing & Interaction (LIB-006 → LIB-011).
 *
 * Target surface: www.<sandbox>/topics/<slug> sources tabs (Notable Sources +
 * Sources), rendered by TopicTextPassage (`.story.topicPassageStory`).
 *
 * Verified against production 2026-06-15 (/topics/torah): default tab "Notable
 * Sources" renders 19 curated sources; the "Sources" tab streams pages of ~20
 * (19 → 259 after scrolling); source sort options are ['Relevance', 'Chronological'].
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const SLUG = 'torah';
const LIB = MODULE_URLS.EN.LIBRARY;

test.describe('Library Topics — source listing & interaction', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('LIB-006: Sources display with reference + text-passage metadata', async () => {
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().expectSourcesHaveMetadata();
    // Anonymous view never surfaces draft/unpublished markers (publication
    // filtering is server-side; same contract as Voices Topics TOV-009).
    await pm.onLibraryTopic().expectNoDraftMarkers();
  });

  test('LIB-007: Click a source → opens reader at /<Ref>; back button returns to topic', { tag: '@sanity' }, async () => {
    test.setTimeout(t(90000));
    await pm.onLibraryTopic().open(LIB, SLUG);
    const { href } = await pm.onLibraryTopic().clickFirstSourceAndExpectReader();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // Back button returns to the topic page.
    await page.goBack();
    await hideAllModalsAndPopups(page);
    await expect(page).toHaveURL(new RegExp(`/topics/${SLUG}`), { timeout: t(20000) });
    await pm.onLibraryTopic().expectTitleStillInDom();
  });

  test('LIB-008: Sources paginate via infinite scroll (count grows on scroll)', { tag: '@sanity' }, async () => {
    test.setTimeout(t(120000));
    await pm.onLibraryTopic().open(LIB, SLUG);
    // Switch to the full "Sources" tab — Notable Sources is a small curated set;
    // the streaming/pagination behaviour lives on the broader Sources tab.
    await pm.onLibraryTopic().switchToTab('Sources');
    const before = await pm.onLibraryTopic().getSourceCount();
    const after = await pm.onLibraryTopic().scrollToLoadMore(8);
    expect(after, `scrolling should append more sources (started at ${before})`).toBeGreaterThan(before);
  });

  test('LIB-009: Filter strip text input narrows the source list', { tag: '@sanity' }, async () => {
    // The CSV row describes "source filtering by text type or language". The
    // Library Sources tab exposes a text filter in its filter strip (FilterableList
    // filterFunc → refFilter, which matches ref / en / he / category). A term that
    // matches nothing must empty the list; clearing the filter must restore it.
    // (We avoid asserting on a specific matching token since which sources are
    // loaded into the FilterableList at filter time is data-order-dependent.)
    test.setTimeout(t(90000));
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().switchToTab('Sources');
    const baseline = await pm.onLibraryTopic().getSourceCount();
    expect(baseline).toBeGreaterThan(0);

    await pm.onLibraryTopic().openFilterStrip();
    await pm.onLibraryTopic().typeFilter('zzzznomatch12345');
    const noMatch = await pm.onLibraryTopic().getSourceCount();
    expect(noMatch, 'a non-matching filter term should empty the source list').toBe(0);

    // Clearing the filter restores the list.
    await pm.onLibraryTopic().typeFilter('');
    const restored = await pm.onLibraryTopic().getSourceCount();
    expect(restored, 'clearing the filter should restore the source list').toBeGreaterThan(0);
  });

  test('LIB-010a: Sort param (Relevance vs Chronological) reorders the first source', { tag: '@sanity' }, async () => {
    test.setTimeout(t(120000));
    await pm.onLibraryTopic().open(LIB, SLUG, { sort: 'Relevance' });
    const relevanceFirst = await pm.onLibraryTopic().firstSourceRefHref();

    await pm.onLibraryTopic().open(LIB, SLUG, { sort: 'Chronological' });
    const chronoFirst = await pm.onLibraryTopic().firstSourceRefHref();

    expect(chronoFirst, 'Relevance and Chronological should not yield the same first source')
      .not.toBe(relevanceFirst);
  });

  test('LIB-010b: Sort UI — open filter strip → click "Chronological" → list reorders + active class', async () => {
    test.setTimeout(t(120000));
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().switchToTab('Sources');
    const before = await pm.onLibraryTopic().firstSourceRefHref();

    await pm.onLibraryTopic().openFilterStrip();
    await pm.onLibraryTopic().expectSortOptions(['Relevance', 'Chronological']);
    await pm.onLibraryTopic().clickSortOption('Chronological');

    await pm.onLibraryTopic().expectActiveSortOption('Chronological');
    const after = await pm.onLibraryTopic().firstSourceRefHref();
    expect(after, `clicking Chronological should re-order the list (was ${before})`).not.toBe(before);
  });

  test('LIB-011: Source-language toggle changes the displayed source language', { tag: '@sanity' }, async () => {
    // CSV: "source language preference affects display". Library exposes the "A"
    // popover (LangSelectInterface: Source / Translation / Source-with-Translation).
    // On an English interface the default is "Translation" (English text), so the
    // baseline view shows little/no Hebrew. Selecting "Source" must flip the
    // rendered source text to Hebrew. We assert the Hebrew-content fraction rises.
    test.setTimeout(t(120000));
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().switchToTab('Sources');

    // Baseline = default (Translation / English).
    const baselineHebrew = await pm.onLibraryTopic().hebrewFractionOfFirstSources(6);

    // Switch the source display to Hebrew ("Source").
    await pm.onLibraryTopic().openLangToggle();
    await pm.onLibraryTopic().selectSourceLanguage('source');
    const sourceHebrew = await pm.onLibraryTopic().hebrewFractionOfFirstSources(6);

    expect(sourceHebrew, 'selecting "Source" should render more Hebrew text than the Translation default')
      .toBeGreaterThan(baselineHebrew);
  });
});
