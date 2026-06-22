/**
 * Library Topics — Cross-Module Behavior (LIB-017 → LIB-020).
 *
 * These tests traverse the Library and Voices modules for the same topic slug,
 * verifying that the slug is shared, content type differs (sources vs sheets),
 * language preference persists across the module switch, and deep-link params
 * (?sort=) are honoured with graceful fallback for unknown params.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const SLUG = 'torah';
const TITLE_EN = 'Torah';
const LIB = MODULE_URLS.EN.LIBRARY;
const VOICES = MODULE_URLS.EN.VOICES;

test.describe('Library Topics — cross-module behavior', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('LIB-017: Same topic slug on Voices renders sheets (content type differs from Library sources)', async () => {
    // The CSV envisions a "View Sheets" button on the Library topic page. The
    // Library topic page does NOT expose a dedicated per-topic "View Sheets"
    // affordance — cross-module navigation for a topic is via the shared slug.
    // We assert the meaningful contract: the same slug on Voices renders SHEETS
    // (not text sources), i.e. the module switch changes content type cleanly.
    test.setTimeout(t(120000));
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().expectSourcesHaveMetadata(1);

    // Cross to Voices for the same slug — it should render sheet cards.
    await pm.onVoicesTopic().open(VOICES, SLUG);
    const sheetCount = await pm.onVoicesTopic().getSheetCount();
    expect(sheetCount, 'Voices topic page should render sheets for the shared slug').toBeGreaterThan(0);
    await expect(page).toHaveURL(new RegExp(`/topics/${SLUG}`));
  });

  test('LIB-018: Topic slug is consistent across modules (same title, different content)', async () => {
    test.setTimeout(t(120000));
    // Library: title + sources.
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().expectTitleText(TITLE_EN);
    await pm.onLibraryTopic().expectSourcesHaveMetadata(1);

    // Voices: same slug, same title, but sheets instead of sources.
    await pm.onVoicesTopic().open(VOICES, SLUG);
    await pm.onVoicesTopic().expectTitleText(TITLE_EN);
    await expect(page).toHaveURL(new RegExp(`/topics/${SLUG}`));
  });

  test('LIB-019: Hebrew language preference persists when navigating Library → Voices', async ({ context }) => {
    test.setTimeout(t(120000));
    const hePage = await goToPageWithLang(context, MODULE_URLS.HE.LIBRARY, LANGUAGES.HE);
    const hePm = new PageManager(hePage, LANGUAGES.HE);
    await hideAllModalsAndPopups(hePage);
    await hePm.onLibraryTopic().open(MODULE_URLS.HE.LIBRARY, SLUG);
    await expect(hePage.locator('body')).toHaveClass(/interface-hebrew/);

    // Navigate to the Voices topic page (different module, same parent .il domain).
    await hePage.goto(`${MODULE_URLS.HE.VOICES}/topics/${SLUG}`);
    await hideAllModalsAndPopups(hePage);
    await expect(hePage.locator('body')).toHaveClass(/interface-hebrew/, { timeout: t(15000) });
  });

  test('LIB-020: Deep-link sort param is applied; unknown params fall back gracefully', async () => {
    test.setTimeout(t(120000));
    // ?sort=Chronological — the topic page reads the sort param on mount.
    await pm.onLibraryTopic().open(LIB, SLUG, { sort: 'Chronological' });
    const chronoFirst = await pm.onLibraryTopic().firstSourceRefHref();
    await pm.onLibraryTopic().open(LIB, SLUG, { sort: 'Relevance' });
    const relevanceFirst = await pm.onLibraryTopic().firstSourceRefHref();
    expect(chronoFirst, 'deep-linked sort should actually re-order the list').not.toBe(relevanceFirst);

    // Unknown param must not break the page — it should load normally.
    await pm.onLibraryTopic().open(LIB, SLUG, { query: 'bogusparam=whatever' });
    await pm.onLibraryTopic().expectTitleText(TITLE_EN);
    await pm.onLibraryTopic().expectSourcesHaveMetadata(1);
  });
});
