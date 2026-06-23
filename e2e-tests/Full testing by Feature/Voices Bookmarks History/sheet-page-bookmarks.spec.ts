import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser } from '../../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';
import { SHEETS } from './test-sheets';

/**
 * Voices Bookmarks — the bookmark control on a Source Sheet page.
 *
 * On Voices the bookmark lives in the sheet's 3-dot "Options" menu as a
 * "Save"/"Remove" item (source: `SheetOptions.jsx`). Clicking it opens a
 * confirmation modal that toggles the save and reports "Saved sheet." /
 * "Sheet no longer saved."
 *
 * State note: the QA account's saved list is real server-side state shared by
 * all parallel workers, so every test owns a DISJOINT sheet (see test-sheets.ts)
 * and cleans up after itself in afterEach. Preconditions are seeded via the same
 * API the UI uses, then the sheet is (re)loaded so the rendered menu reflects the
 * seeded state.
 */
test.describe('Voices Bookmarks — sheet page (logged in)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('VBM-001: Bookmarking a sheet from its page adds it to /saved', async () => {
    const { id, titleWord } = SHEETS.create;
    const vb = pm.onVoicesBookmarks();

    // Clean precondition: not saved, then load the sheet fresh so the menu reflects it.
    await vb.setSheetSaved(id, false);
    await vb.gotoSheet(id);

    // Bookmark via the 3-dot Options → Save item; confirm the success modal.
    await vb.bookmarkViaSheetMenu();
    await vb.closeSaveModal();

    // The sheet now appears on /saved with a filled bookmark icon.
    await vb.gotoSaved();
    await vb.expectSavedEntryPresent(id);
    await vb.expectSavedEntryHasTitleAndAuthor(id, titleWord);
    await vb.expectSavedEntrySaveState(id, true);
  });

  test.afterEach(async () => {
    // Teardown — leave the account's saved list as we found it.
    await pm?.onVoicesBookmarks().clearSavedSheets([
      SHEETS.create.id, SHEETS.iconSaved.id, SHEETS.iconUnsaved.id, SHEETS.removeFromSheet.id,
    ]).catch(() => { /* page may be closed; ignore */ });
  });

  test('VBM-003: Bookmark icon reflects saved vs unsaved state on page load', async () => {
    const vb = pm.onVoicesBookmarks();

    // Seed one sheet saved and one unsaved.
    await vb.setSheetSaved(SHEETS.iconSaved.id, true);
    await vb.setSheetSaved(SHEETS.iconUnsaved.id, false);

    // Saved sheet → menu shows a filled icon + "Remove" with no interaction.
    await vb.gotoSheet(SHEETS.iconSaved.id);
    await vb.openSheetOptionsMenu();
    await vb.expectSheetMenuSaveState(true);

    // Unsaved sheet → menu shows an outline icon + "Save".
    await vb.gotoSheet(SHEETS.iconUnsaved.id);
    await vb.openSheetOptionsMenu();
    await vb.expectSheetMenuSaveState(false);
  });

  test('VBM-004: Unbookmarking from the sheet page removes it from /saved', async () => {
    const { id } = SHEETS.removeFromSheet;
    const vb = pm.onVoicesBookmarks();

    // Precondition: saved.
    await vb.setSheetSaved(id, true);
    await vb.gotoSheet(id);

    // Unbookmark via the Options menu; confirm the modal.
    await vb.unbookmarkViaSheetMenu();
    await vb.closeSaveModal();

    // It is gone from /saved.
    await vb.gotoSaved();
    await vb.expectSavedEntryAbsent(id);
  });
});

/**
 * VBM-009 — anonymous users are prompted to sign up, not silently bookmarked.
 * Separate describe: logged-out entry, no auth, no saved-state teardown.
 */
test.describe('Voices Bookmarks — sheet page (logged out)', () => {
  test('VBM-009: Clicking Save while logged out shows the sign-up prompt', async ({ context }) => {
    const page = await goToPageWithLang(context, `${MODULE_URLS.EN.VOICES}/sheets/${SHEETS.anon.id}`, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    const vb = pm.onVoicesBookmarks();

    await vb.openSheetOptionsMenu();
    await vb.clickSheetSaveItem();

    // A sign-up prompt appears; no save modal / silent bookmark.
    await vb.expectSignupPromptForSave();
    await expect(page.locator('.dialogModal .modalMessage')).toHaveCount(0);
  });
});
