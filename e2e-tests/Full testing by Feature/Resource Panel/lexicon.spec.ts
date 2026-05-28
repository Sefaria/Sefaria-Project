import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Lexicon (RP-050 → RP-058).
 *
 * Behavior in ConnectionsPanel.componentDidUpdate:
 *   if (selectedWords && /[\s:֐-׿.]+/.test(selectedWords)
 *       && selectedWords.split(" ").length < 3
 *       && srefs.length === 1) {
 *     setConnectionsMode("Lexicon");
 *   }
 *
 * Auto-trigger: 1–2 Hebrew words selected. 3+ does not auto-trigger. Clearing
 * the selection returns to "Resources". The selection auto-trigger requires
 * the panel to already be open against a single segment.
 *
 * RP-055 uses `Berakhot.2a` because that text is heavily annotated with
 * inline named-entity links (`<a data-slug="rabbi-eliezer">…</a>`) —
 * verified 8 such links on production on 2026-05-12.
 */
test.describe('Resource Panel — Lexicon — English interface, Hebrew text', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    // The lexicon auto-trigger condition requires `srefs.length === 1`, i.e.
    // the panel must be open against a single segment before the selection
    // is registered. See ConnectionsPanel.componentDidUpdate.
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
  });

  test('RP-050: Selecting 1 Hebrew word auto-opens the Lexicon with definitions', async () => {
    await pm.onResourcePanel().selectHebrewWordInMainReader();
    await pm.onResourcePanel().expectLexiconOpen();
    await pm.onResourcePanel().expectLexiconHasResults();
  });

  test('RP-051: Selecting 2 Hebrew words auto-opens the Lexicon for the phrase', async () => {
    await pm.onResourcePanel().selectHebrewWords(2);
    await pm.onResourcePanel().expectLexiconOpen();
  });

  test('RP-052: Selecting more than 3 Hebrew words does NOT auto-open the Lexicon', async () => {
    await pm.onResourcePanel().selectHebrewWords(4);
    await page.waitForTimeout(t(700));
    const lexiconVisible = await page.locator('.connectionsPanel .lexicon-content, .connectionsPanel .lexicon-instructions')
      .first().isVisible({ timeout: t(2000) }).catch(() => false);
    expect(lexiconVisible).toBeFalsy();
  });

  test('RP-053: Lexicon entry shows a headword plus definitions', async () => {
    await pm.onResourcePanel().selectHebrewWordInMainReader();
    await pm.onResourcePanel().expectLexiconOpen();
    await pm.onResourcePanel().expectLexiconHeadword();
  });

  test('RP-054: BDB dictionary entry is present in the lexicon results', async () => {
    // Genesis 1:1's first word "בְּרֵאשִׁית" tokenizes to start with the
    // prefix בְּ, which lookups against the Klein Dictionary but not BDB.
    // The SECOND word "בָּרָא" reliably returns two BDB entries (BDB
    // Augmented Strong + BDB Dictionary). Verified via the /api/words API.
    await pm.onResourcePanel().selectHebrewWordAtIndex(1);
    await pm.onResourcePanel().expectLexiconOpen();
    const bdbAttribution = page.locator(
      '.connectionsPanel .entry .attribution :text-matches("BDB", "i")'
    ).first();
    await expect(bdbAttribution).toBeVisible({ timeout: t(15000) });
  });

  test('RP-056: Manual lexicon search rejects non-Hebrew input with an invalid-entry message', async () => {
    await pm.onResourcePanel().openLexiconManual();
    await pm.onResourcePanel().typeInLexiconSearch('xqzqz1234');
    const invalidMessage = page.locator(
      '.connectionsPanel :text-matches("Invalid entry", "i")'
    ).first();
    await expect(invalidMessage).toBeVisible({ timeout: t(10000) });
  });

  test('RP-057: Clearing the selection returns the panel to Resources mode', async () => {
    // Open Lexicon via the proven programmatic select (used by RP-050/051).
    await pm.onResourcePanel().selectHebrewWordInMainReader();
    await pm.onResourcePanel().expectLexiconOpen();
    // Deselect with a *real* mouse click outside any segment. Native events
    // pass through React's synthetic-event delegation reliably and update
    // `selectedWords` to "", letting `ConnectionsPanel.componentDidUpdate`
    // reset the mode from Lexicon back to Resources.
    await pm.onResourcePanel().clickOutsideSegmentToDeselect();
    await pm.onResourcePanel().expectMode('Resources');
  });

  test('RP-058: Manual dictionary search returns results for a valid Hebrew word', async () => {
    await pm.onResourcePanel().openLexiconManual();
    await pm.onResourcePanel().typeInLexiconSearch('שלום');
    await pm.onResourcePanel().expectLexiconHasResults();
  });
});

/**
 * RP-055: Named-entity click. Uses `Berakhot.2a` — annotated with inline
 * `<a data-slug>` links for Rabbi Eliezer, Rabban Gamliel, etc. Clicking
 * such a link sets `selectedNamedEntity` on the panel, which causes
 * `LexiconBox` to load the topic and render `.named-entity-wrapper`.
 */
test.describe('Resource Panel — Lexicon — named entity', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Berakhot.2a`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
  });

  test('RP-055: Clicking an inline named-entity link opens the entity in the panel', async () => {
    const { slug } = await pm.onResourcePanel().clickFirstNamedEntity();
    expect(slug).toBeTruthy();
    await pm.onResourcePanel().expectNamedEntityResult();
  });
});
