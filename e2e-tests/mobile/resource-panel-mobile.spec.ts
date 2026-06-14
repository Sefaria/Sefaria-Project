import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * Resource Panel — Mobile single-panel layout (RPM-0xx).
 *
 * Renders against the mobile viewport configured in `playwright.mobile.config.ts`
 * (Pixel 5 / iPhone 13). In this layout `multiPanel === false`, so
 * `ConnectionsPanel` renders as `.connectionsPanel.textList.singlePanel` with
 * its own `<ConnectionsPanelHeader>` (no `.readerPanelBox.sidebar` wrapper —
 * see `pages/mobileResourcePanelPage.ts`).
 *
 * Covers two pieces of mobile-only functionality:
 *
 *  - RPM-001/002/006/007: the circled-X close button added to the mobile
 *    Resources/Lexicon header (ConnectionsPanelHeader.jsx `showCloseButton`,
 *    `Misc.jsx` `CloseButton`, ReaderPanel.jsx `closeConnectionsInPanel`).
 *
 *  - RPM-003/004/005: long-press-to-open-Lexicon (TextColumn.jsx
 *    `handleTouchStart` / `handleLongPress` / `getWordAtPoint`, and
 *    ReaderPanel.jsx `setSelectedWords` → `openConnectionsInPanel` for the
 *    case where no connections panel is open yet).
 */
test.describe('Resource Panel — Mobile (English interface, Hebrew text)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileResourcePanel().waitForReaderReady();
  });

  test('RPM-001: Tapping a segment opens the Resources panel with a close button', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');
    await pm.onMobileResourcePanel().expectCloseButtonVisible();
  });

  test('RPM-002: Tapping the circled-X in Resources mode closes the panel', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');
    await pm.onMobileResourcePanel().tapCloseButton();
    await pm.onMobileResourcePanel().expectMode('Text');
  });

  test('RPM-003: Long-pressing a Hebrew word with no panel open opens the Lexicon directly', async () => {
    const word = await pm.onMobileResourcePanel().longPressWord('Genesis 1:1');
    expect(word).toBeTruthy();
    await pm.onMobileResourcePanel().expectMode('Lexicon');
    await pm.onMobileResourcePanel().expectLexiconHasResults();
  });

  test('RPM-004: Long-press highlights the selected word and clears segment focus', async () => {
    await pm.onMobileResourcePanel().longPressWord('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Lexicon');
    await pm.onMobileResourcePanel().expectWordHighlighted();
    await pm.onMobileResourcePanel().expectNoSegmentFocused();
  });

  test('RPM-005: Long-press while the Resources panel is already open switches it to Lexicon', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');

    await pm.onMobileResourcePanel().longPressWord('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Lexicon');
    await pm.onMobileResourcePanel().expectWordHighlighted();
    await pm.onMobileResourcePanel().expectNoSegmentFocused();
  });

  test('RPM-006: Tapping the circled-X in Lexicon mode closes the panel', async () => {
    await pm.onMobileResourcePanel().longPressWord('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Lexicon');
    await pm.onMobileResourcePanel().tapCloseButton();
    await pm.onMobileResourcePanel().expectMode('Text');
  });

  test('RPM-007: The circled-X close button is vertically centered in the header', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');
    await pm.onMobileResourcePanel().expectCloseButtonVerticallyCentered();
  });
});
