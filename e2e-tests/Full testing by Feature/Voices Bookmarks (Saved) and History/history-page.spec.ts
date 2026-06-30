import { test, expect, Page } from '@playwright/test';
import { goToPageWithUser } from '../../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';
import { SHEETS } from './test-sheets';

/**
 * Voices Bookmarks — bookmarking from a /history row (VBM-002).
 *
 * `/history` is rendered by the same `UserHistoryPanel` as `/saved` — a
 * `.savedHistoryList` of `SheetBlock` rows, each with the same inline
 * `.saveButton`. So this is the /history twin of VBM-005.
 *
 * History recording: a real view fires `saveLastPlace` on mount plus a 3-second
 * scroll-intent re-record (`checkIntentTimer`, ReaderApp.jsx). To get a
 * deterministic, unsaved row to act on we seed one via the same endpoint the
 * reader uses (`POST /api/profile/sync`) — `seedSheetHistory` — rather than
 * relying on dwell timing. History accumulates naturally and isn't torn down;
 * only the bookmark this test creates is cleaned up.
 */
test.describe('Voices Bookmarks — /history page', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test.afterEach(async () => {
    await pm?.onVoicesBookmarks().clearSavedSheets([SHEETS.history.id]).catch(() => {});
  });

  test('VBM-002: Bookmarking a sheet from a /history row adds it to /saved', async () => {
    const { id } = SHEETS.history;
    const vb = pm.onVoicesBookmarks();

    // Clean precondition: not saved, but present in /history. First wipe the
    // account's accumulated reading history (preserving /saved) — it can contain
    // rows for since-deleted sheets whose missing `ownerName` crashes the
    // /history page's ProfilePic render; see clearReadingHistory().
    await vb.setSheetSaved(id, false);
    await vb.clearReadingHistory();
    await vb.seedSheetHistory(id);

    await vb.gotoHistory();
    await vb.expectHistoryEntryPresent(id);
    await vb.expectHistoryEntrySaveState(id, false);

    // Click the row's inline bookmark icon → it flips to filled.
    await vb.clickHistoryEntrySaveButton(id);
    await vb.expectHistoryEntrySaveState(id, true);

    // And the sheet now appears on /saved.
    await vb.gotoSaved();
    await vb.expectSavedEntryPresent(id);
    await vb.expectSavedEntrySaveState(id, true);
  });
});
