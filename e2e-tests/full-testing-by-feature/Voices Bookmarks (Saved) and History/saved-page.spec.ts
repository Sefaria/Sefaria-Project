import { test, expect, Page } from '@playwright/test';
import { goToPageWithUser } from '../../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';
import { SHEETS } from './test-sheets';

/**
 * Voices Bookmarks — the /saved page (`UserHistoryPanel` → list of `SheetBlock`s).
 *
 * Each row is a `.storySheetListItem` with an inline `.saveButton` (toggles the
 * bookmark directly, no modal), a `.sheetTitle a` link, and an author byline.
 *
 * The QA account's saved list is shared server-side state across parallel
 * workers; every test owns disjoint sheets and cleans up in afterEach. Ordering
 * assertions are RELATIVE (tolerant of interleaved entries from other workers).
 */
test.describe('Voices Bookmarks — /saved page', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test.afterEach(async () => {
    await pm?.onVoicesBookmarks().clearSavedSheets([
      SHEETS.removeFromSaved.id,
      SHEETS.orderA.id, SHEETS.orderB.id, SHEETS.orderC.id,
      SHEETS.persistence.id, SHEETS.navigation.id,
      SHEETS.displayA.id, SHEETS.displayB.id,
    ]).catch(() => { /* page may be closed; ignore */ });
  });

  test('VBM-005: Unbookmarking via the inline icon removes the entry from /saved', { tag: '@sanity' }, async () => {
    const { id } = SHEETS.removeFromSaved;
    const vb = pm.onVoicesBookmarks();

    await vb.setSheetSaved(id, true);
    await vb.gotoSaved();
    await vb.expectSavedEntryPresent(id);
    await vb.expectSavedEntrySaveState(id, true);

    // Click the row's bookmark icon → it flips to the outline (unsaved) state.
    await vb.clickSavedEntrySaveButton(id);
    await vb.expectSavedEntrySaveState(id, false);

    // After a refresh the row is gone from the list.
    await vb.gotoSaved();
    await vb.expectSavedEntryAbsent(id);
  });

  test('VBM-006: Newest bookmark appears above older ones on /saved', { tag: '@sanity' }, async () => {
    const { orderA, orderB, orderC } = SHEETS;
    const vb = pm.onVoicesBookmarks();

    // Clean slate for these three, then bookmark A → B → C with spacing so the
    // server time_stamps (second resolution) are strictly increasing.
    await vb.clearSavedSheets([orderA.id, orderB.id, orderC.id]);
    await vb.setSheetSaved(orderA.id, true);
    await page.waitForTimeout(t(1200));
    await vb.setSheetSaved(orderB.id, true);
    await page.waitForTimeout(t(1200));
    await vb.setSheetSaved(orderC.id, true);

    await vb.gotoSaved();
    // Most recent first: C, then B, then A (relative order, interleaving-tolerant).
    await vb.expectSavedRelativeOrder([orderC.id, orderB.id, orderA.id]);
  });

  test('VBM-008: Clicking a /saved entry navigates to the correct sheet', async () => {
    const { id, titleWord } = SHEETS.navigation;
    const vb = pm.onVoicesBookmarks();

    await vb.setSheetSaved(id, true);
    await vb.gotoSaved();
    await vb.expectSavedEntryPresent(id);

    await vb.clickSavedEntryLinkAndExpectNavigation(id);
    await expect(page).toHaveURL(new RegExp(`/sheets/${id}(\\b|$)`), { timeout: t(15000) });
    // The sheet's title text is present once the sheet page renders.
    await expect(page.locator('body')).toContainText(titleWord, { timeout: t(20000) });
  });

  test('VBM-010: /saved shows the correct title and author for each bookmark', async () => {
    const { displayA, displayB } = SHEETS;
    const vb = pm.onVoicesBookmarks();

    await vb.setSheetSaved(displayA.id, true);
    await vb.setSheetSaved(displayB.id, true);
    await vb.gotoSaved();

    await vb.expectSavedEntryHasTitleAndAuthor(displayA.id, displayA.titleWord);
    await vb.expectSavedEntryHasTitleAndAuthor(displayB.id, displayB.titleWord);

    expect(await vb.savedEntryAuthor(displayA.id)).toContain(displayA.author);
    expect(await vb.savedEntryAuthor(displayB.id)).toContain(displayB.author);
  });
});

/**
 * VBM-007 — bookmarks are server-side and persist into a brand-new browser
 * session. Seed a bookmark in one context, then open a second, independent
 * context (fresh cookies from the same account) and confirm it is still on /saved.
 */
test.describe('Voices Bookmarks — persistence', () => {
  test('VBM-007: Bookmarks persist across a new browser session', async ({ context, browser }) => {
    const { id, titleWord } = SHEETS.persistence;

    // Session 1: bookmark the sheet.
    const page1 = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    const vb1 = new PageManager(page1, LANGUAGES.EN).onVoicesBookmarks();
    await vb1.setSheetSaved(id, true);

    // Session 2: a fresh, independent browser context for the same account.
    const context2 = await browser.newContext();
    try {
      const page2 = await goToPageWithUser(context2, `${MODULE_URLS.EN.VOICES}/saved`, BROWSER_SETTINGS.enUser);
      const vb2 = new PageManager(page2, LANGUAGES.EN).onVoicesBookmarks();
      await vb2.waitForSavedRendered();
      await vb2.expectSavedEntryPresent(id);
      await vb2.expectSavedEntryHasTitleAndAuthor(id, titleWord);
    } finally {
      // Teardown from session 1's still-open page.
      await vb1.clearSavedSheets([id]).catch(() => {});
      await context2.close();
    }
  });
});
