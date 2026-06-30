import { expect, Page, Locator } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { MODULE_URLS } from '../constants';

/**
 * Voices Bookmarks / Saved-list POM.
 *
 * Surfaces under test (all on the Voices module, `voices.<sandbox>`):
 *  - **Sheet page** (`/sheets/<id>`): the bookmark control lives in the 3-dot
 *    "Options" menu as a "Save"/"Remove" item. Source: `SheetContent.jsx`
 *    renders `<SheetOptions editable={false}>` → `SheetOptions.jsx` →
 *    `SaveButtonWithText` inside a `DropdownMenuItemWithCallback`. Clicking it
 *    opens a `SaveModal` (`SheetModals.jsx`) that toggles the save and shows
 *    "Saved sheet." / "Sheet no longer saved.".
 *  - The /saved page (bold): `UserHistoryPanel.jsx` → list of `SheetBlock`s. Each row is
 *    a `.storySheetListItem` whose `.saveLine` carries an inline `.saveButton`
 *    (`SaveButton` in `Misc.jsx`) that toggles the bookmark directly (no modal).
 *
 * Icon state is read from the bookmark `<img>` `src` (language-invariant):
 *   filled  = `/static/icons/bookmark-filled.svg`  → saved
 *   outline = `/static/icons/bookmark.svg`         → not saved
 *
 * Both `/saved` and `/history` are rendered by `UserHistoryPanel.jsx` into the
 * same `.savedHistoryList` container with the same `SheetBlock` rows, so the row
 * helpers below (`listEntry…`) drive either page; the public `saved*` / `history*`
 * methods are thin, page-named wrappers over them.
 *
 * History recording: viewing a sheet fires `saveLastPlace` on mount, and a
 * 3-second scroll-intent timer (`checkIntentTimer`, ReaderApp.jsx) re-records on
 * dwell. Tests seed a history row deterministically via `seedSheetHistory` rather
 * than relying on that timing.
 */
export class VoicesBookmarksPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private static readonly BOOKMARK_FILLED = '/static/icons/bookmark-filled.svg';
  private static readonly BOOKMARK_OUTLINE = '/static/icons/bookmark.svg';

  // ----------------------------------------------------------------------------
  // Navigation (the page is already authenticated via goToPageWithUser; these
  // are in-session navigations that keep the Django session cookie).
  //
  // These surfaces are Voices-only, so navigations use the ABSOLUTE Voices base
  // URL rather than a relative path. A relative `page.goto('/saved')` resolves
  // against the running project's `baseURL`, which is the Voices module for the
  // `*-voices-bookmarks` projects but the LIBRARY module for the tag-scoped
  // `*-sanity` projects (playwright.config.ts) — under sanity a relative goto
  // would land on www.* and the Voices /saved entries would be absent.
  // ----------------------------------------------------------------------------

  /** Absolute base URL of the Voices module for this POM's language. */
  private get voicesBase(): string {
    return this.language === LANGUAGES.HE ? MODULE_URLS.HE.VOICES : MODULE_URLS.EN.VOICES;
  }

  /** Navigate to a sheet page and dismiss any overlays. */
  async gotoSheet(sheetId: number): Promise<void> {
    await this.page.goto(`${this.voicesBase}/sheets/${sheetId}`);
    await hideAllModalsAndPopups(this.page);
  }

  /** Navigate to the /saved page and wait for it to render. */
  async gotoSaved(): Promise<void> {
    await this.page.goto(`${this.voicesBase}/saved`);
    await hideAllModalsAndPopups(this.page);
    await this.waitForSavedRendered();
  }

  /** Navigate to the /history page and wait for it to render. */
  async gotoHistory(): Promise<void> {
    await this.page.goto(`${this.voicesBase}/history`);
    await hideAllModalsAndPopups(this.page);
    await this.waitForSavedRendered();
  }

  // ----------------------------------------------------------------------------
  // Sheet-page 3-dot "Options" → Save / Remove
  // ----------------------------------------------------------------------------

  /**
   * The sheet's 3-dot Options dropdown. The page has three `.headerDropdownMenu`
   * wrappers (module switcher, user menu, sheet options); we scope to the one
   * containing the language-invariant ellipses icon.
   */
  private get sheetOptionsMenu(): Locator {
    return this.page.locator('.headerDropdownMenu', {
      has: this.page.locator('img[src="/static/icons/ellipses.svg"]'),
    });
  }

  private get optionsButton(): Locator {
    return this.sheetOptionsMenu.locator('img[src="/static/icons/ellipses.svg"]');
  }

  /** The Save/Remove item inside the open Options dropdown. */
  private get sheetSaveItem(): Locator {
    return this.sheetOptionsMenu.locator('.dropdownItem', {
      has: this.page.locator('img[src*="bookmark"]'),
    });
  }

  private get sheetSaveItemImg(): Locator {
    return this.sheetSaveItem.locator('img[src*="bookmark"]');
  }

  /** The save-confirmation modal message ("Saved sheet." / "Sheet no longer saved."). */
  private get saveModalMessage(): Locator {
    return this.page.locator('.dialogModal .modalMessage');
  }

  /** Open the sheet's 3-dot Options menu and wait for the Save item to appear. */
  async openSheetOptionsMenu(): Promise<void> {
    await expect(this.optionsButton).toBeVisible({ timeout: t(15000) });
    await this.optionsButton.scrollIntoViewIfNeeded();
    await this.optionsButton.click();
    await expect(this.sheetSaveItem).toBeVisible({ timeout: t(5000) });
  }

  /** Assert the Options-menu Save item reflects the given saved state (icon + label). */
  async expectSheetMenuSaveState(saved: boolean): Promise<void> {
    const expectedSrc = saved
      ? VoicesBookmarksPage.BOOKMARK_FILLED
      : VoicesBookmarksPage.BOOKMARK_OUTLINE;
    await expect(this.sheetSaveItemImg).toHaveAttribute('src', expectedSrc, { timeout: t(5000) });
    await expect(this.sheetSaveItem).toContainText(saved ? 'Remove' : 'Save', { timeout: t(5000) });
  }

  /** Click the Save/Remove item; opens the save-confirmation modal. */
  async clickSheetSaveItem(): Promise<void> {
    await this.sheetSaveItem.click();
  }

  /** Assert the save-confirmation modal shows the expected message. */
  async expectSaveModalMessage(expected: string | RegExp): Promise<void> {
    await expect(this.saveModalMessage).toBeVisible({ timeout: t(10000) });
    await expect(this.saveModalMessage).toContainText(expected, { timeout: t(10000) });
  }

  /**
   * Assert the sign-up / log-in prompt appeared instead of a save (anonymous
   * users). Source: `SheetOptions.jsx` opens `toggleSignUpModal(Save)` →
   * `SignUpModal` (`Misc.jsx`) renders `#interruptingMessageBox` with the Save-kind
   * heading "Want to return to this text?".
   */
  async expectSignupPromptForSave(): Promise<void> {
    await expect(this.page.locator('#interruptingMessageBox')).toBeVisible({ timeout: t(10000) });
    await expect(this.page.locator('#interruptingMessage h2'))
      .toContainText('Want to return to this text?', { timeout: t(5000) });
  }

  /** Dismiss the save-confirmation modal (Escape) and wait for it to close. */
  async closeSaveModal(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.page.locator('.dialogModal[open]')).toHaveCount(0, { timeout: t(5000) });
  }

  /**
   * Full "bookmark from the sheet page" flow: open menu → confirm the unsaved
   * state → click Save → confirm the modal reports success. Leaves the modal open
   * (callers usually navigate to /saved next, or call closeSaveModal()).
   */
  async bookmarkViaSheetMenu(): Promise<void> {
    await this.openSheetOptionsMenu();
    await this.expectSheetMenuSaveState(false);
    await this.clickSheetSaveItem();
    await this.expectSaveModalMessage('Saved sheet.');
  }

  /** Full "unbookmark from the sheet page" flow (precondition: sheet is saved). */
  async unbookmarkViaSheetMenu(): Promise<void> {
    await this.openSheetOptionsMenu();
    await this.expectSheetMenuSaveState(true);
    await this.clickSheetSaveItem();
    await this.expectSaveModalMessage(/no longer saved/i);
  }

  // ----------------------------------------------------------------------------
  // Shared list helpers — /saved and /history both render a `.savedHistoryList`
  // of `SheetBlock` rows (UserHistoryPanel.jsx), so these drive either page.
  // ----------------------------------------------------------------------------

  private get savedList(): Locator {
    return this.page.locator('.savedHistoryList');
  }

  private get savedEmptyMessage(): Locator {
    return this.page.locator('.savedHistoryMessage');
  }

  private get listEntries(): Locator {
    return this.page.locator('.savedHistoryList .storySheetListItem');
  }

  /** The list row for a specific sheet (matched by its `/sheets/<id>` link). */
  private listEntry(sheetId: number): Locator {
    return this.listEntries.filter({
      has: this.page.locator(`.sheetTitle a[href="/sheets/${sheetId}"]`),
    });
  }

  /**
   * Click a row's inline bookmark icon (toggles the bookmark). The icon is
   * `visibility: hidden` until the row is hovered
   * (`.savedHistoryList .story:hover .saveButton` in s2.css), so hover first.
   * Takes a row Locator so callers can scope to a unique (/saved) or first-of-many
   * (/history, which keeps duplicate rows per sheet) row.
   */
  private async clickEntrySaveButton(row: Locator): Promise<void> {
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    const btn = row.locator('.saveButton');
    await expect(btn).toBeVisible({ timeout: t(10000) });
    await btn.click();
  }

  private async expectEntrySaveState(row: Locator, saved: boolean): Promise<void> {
    const expectedSrc = saved
      ? VoicesBookmarksPage.BOOKMARK_FILLED
      : VoicesBookmarksPage.BOOKMARK_OUTLINE;
    await expect(row.locator('.saveButton img'))
      .toHaveAttribute('src', expectedSrc, { timeout: t(8000) });
  }

  /** Wait until /saved or /history rendered either its list or empty-state message. */
  async waitForSavedRendered(): Promise<void> {
    await expect(this.savedList.or(this.savedEmptyMessage)).toBeVisible({ timeout: t(15000) });
  }

  /** Assert the Saved/History nav tabs render on the /saved page. */
  async expectSavedNavTabs(): Promise<void> {
    await expect(this.page.locator('.navTitleTab[href="/saved"]')).toBeVisible({ timeout: t(10000) });
    await expect(this.page.locator('.navTitleTab[href="/history"]')).toBeVisible({ timeout: t(10000) });
  }

  async expectSavedEntryPresent(sheetId: number): Promise<void> {
    await expect(this.listEntry(sheetId)).toBeVisible({ timeout: t(15000) });
  }

  async expectSavedEntryAbsent(sheetId: number): Promise<void> {
    await expect(this.listEntry(sheetId)).toHaveCount(0, { timeout: t(10000) });
  }

  /** Assert the inline bookmark icon on a /saved row reflects the given state. */
  async expectSavedEntrySaveState(sheetId: number, saved: boolean): Promise<void> {
    await this.expectEntrySaveState(this.listEntry(sheetId), saved);
  }

  /** Click the inline bookmark icon on a /saved row (toggles the bookmark). */
  async clickSavedEntrySaveButton(sheetId: number): Promise<void> {
    await this.clickEntrySaveButton(this.listEntry(sheetId));
  }

  async savedEntryTitle(sheetId: number): Promise<string> {
    return (await this.listEntry(sheetId).locator('.sheetTitle a').innerText()).trim();
  }

  async savedEntryAuthor(sheetId: number): Promise<string> {
    return (await this.listEntry(sheetId).locator('.authorName a').first().innerText()).trim();
  }

  /** Assert a /saved row shows a non-empty, non-"undefined" title and author link. */
  async expectSavedEntryHasTitleAndAuthor(sheetId: number, titleSubstring?: string): Promise<void> {
    const entry = this.listEntry(sheetId);
    await expect(entry).toBeVisible({ timeout: t(15000) });
    const title = await this.savedEntryTitle(sheetId);
    expect(title.length, `sheet ${sheetId} title should not be blank`).toBeGreaterThan(0);
    expect(title.toLowerCase(), `sheet ${sheetId} title should not be "undefined"`).not.toBe('undefined');
    if (titleSubstring) {
      expect(title, `sheet ${sheetId} title should contain "${titleSubstring}"`).toContain(titleSubstring);
    }
    await expect(entry.locator('.authorName a').first()).toBeVisible({ timeout: t(5000) });
    const author = await this.savedEntryAuthor(sheetId);
    expect(author.length, `sheet ${sheetId} author should not be blank`).toBeGreaterThan(0);
    expect(author.toLowerCase()).not.toBe('undefined');
  }

  /** Click a /saved row's title link; assert navigation to that sheet. */
  async clickSavedEntryLinkAndExpectNavigation(sheetId: number): Promise<void> {
    const link = this.listEntry(sheetId).locator('.sheetTitle a');
    await expect(link).toBeVisible({ timeout: t(10000) });
    await Promise.all([
      this.page.waitForURL(new RegExp(`/sheets/${sheetId}(\\b|$)`), { timeout: t(20000) }),
      link.click(),
    ]);
  }

  /** Return the sheet ids currently listed on /saved, in display (top→bottom) order. */
  async savedSheetIdsInOrder(): Promise<number[]> {
    await this.waitForSavedRendered();
    const hrefs = await this.listEntries.locator('.sheetTitle a').evaluateAll(
      els => els.map(a => (a as HTMLAnchorElement).getAttribute('href') || ''),
    );
    return hrefs
      .map(h => {
        const m = h.match(/\/sheets\/(\d+)/);
        return m ? Number(m[1]) : NaN;
      })
      .filter(n => !Number.isNaN(n));
  }

  /**
   * Assert that, among the /saved list, the given sheet ids appear in this exact
   * relative order (top→bottom). Tolerant of other entries interleaved between
   * them — important because the QA account's saved list is shared server-side
   * state that concurrent workers may also be writing to.
   */
  async expectSavedRelativeOrder(orderedSheetIds: number[]): Promise<void> {
    const all = await this.savedSheetIdsInOrder();
    const positions = orderedSheetIds.map(id => all.indexOf(id));
    for (let i = 0; i < orderedSheetIds.length; i++) {
      expect(positions[i], `sheet ${orderedSheetIds[i]} should be present on /saved`).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i - 1],
        `sheet ${orderedSheetIds[i - 1]} (pos ${positions[i - 1]}) should appear before sheet ${orderedSheetIds[i]} (pos ${positions[i]})`,
      ).toBeLessThan(positions[i]);
    }
  }

  // ----------------------------------------------------------------------------
  // /history page (same `.savedHistoryList` rows as /saved)
  // ----------------------------------------------------------------------------

  // History keeps DUPLICATE rows per sheet (non-consecutive views aren't deduped),
  // so all /history helpers target the first (newest) matching row.

  async expectHistoryEntryPresent(sheetId: number): Promise<void> {
    await expect(this.listEntry(sheetId).first()).toBeVisible({ timeout: t(20000) });
  }

  /** Assert the inline bookmark icon on the newest /history row reflects the given state. */
  async expectHistoryEntrySaveState(sheetId: number, saved: boolean): Promise<void> {
    await this.expectEntrySaveState(this.listEntry(sheetId).first(), saved);
  }

  /** Click the inline bookmark icon on the newest /history row (toggles the bookmark). */
  async clickHistoryEntrySaveButton(sheetId: number): Promise<void> {
    await this.clickEntrySaveButton(this.listEntry(sheetId).first());
  }

  // ----------------------------------------------------------------------------
  // Server-side state setup / teardown (the feature is the real save backend; we
  // can't mock it, so tests seed and clean up their own bookmarks via the same
  // API the UI uses — Sefaria.toggleSavedItem → POST /api/profile/sync).
  // ----------------------------------------------------------------------------

  /**
   * Seed a (non-saved) reading-history entry for a sheet via the same endpoint
   * the reader uses (`POST /api/profile/sync`), so /history has a deterministic
   * row to act on without depending on the 3-second scroll-intent timer. The
   * fresh `time_stamp` puts it at the top of the list.
   */
  async seedSheetHistory(sheetId: number): Promise<void> {
    await this.page.evaluate(async (id) => {
      const S = (window as any).Sefaria;
      await new Promise((resolve) => {
        (window as any).$.post(
          S.apiHost + '/api/profile/sync?no_return=1&annotate=1',
          {
            user_history: JSON.stringify([
              { ref: `Sheet ${id}`, versions: {}, time_stamp: Math.floor(Date.now() / 1000) },
            ]),
            client: 'web',
          },
        ).always(() => resolve(null));
      });
    }, sheetId);
  }

  /**
   * Drop un-renderable rows from the `/api/profile/user_history` responses that
   * back /saved and /history, so the list renders deterministically.
   *
   * The shared QA account's history accumulates rows for sheets that later get
   * deleted. The server annotates such a row with no `ownerName`, and the row's
   * `SheetBlock` → `ProfilePic` then throws on `name.trim()` (no guard) — with no
   * error boundary that blanks the whole /history page, so `.savedHistoryList`
   * never appears. There is no reliable server-side cleanup we can drive from a
   * test: the only history-wipe path (toggling the `reading_history` setting) is
   * undone moments later when the client re-syncs its in-memory history back.
   *
   * So we sanitize at the network layer (per CLAUDE.md rule 18): fetch the real
   * response and filter out only the crash-inducing rows (a sheet item with no
   * `ownerName`). All other real data — including the seeded target row, which
   * has a valid owner — passes through untouched, and the bookmark toggle +
   * /saved verification still hit the real save backend. Install before the
   * first navigation that loads the list.
   */
  async sanitizeHistoryResponses(): Promise<void> {
    await this.page.route('**/api/profile/user_history**', async (route) => {
      const response = await route.fetch();
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        await route.fulfill({ response });
        return;
      }
      const sanitized = Array.isArray(body)
        ? body.filter((item: any) => !(item?.is_sheet && !item?.ownerName))
        : body;
      await route.fulfill({ response, json: sanitized });
    });
  }

  /** Whether the given sheet is currently saved (reads the client-side store). */
  async isSheetSaved(sheetId: number): Promise<boolean> {
    return await this.page.evaluate(
      (id) => !!(window as any).Sefaria.getSavedItem({ ref: `Sheet ${id}`, versions: {} }),
      sheetId,
    );
  }

  /** Force the given sheet into the desired saved state (no-op if already there). */
  async setSheetSaved(sheetId: number, saved: boolean): Promise<void> {
    await this.page.evaluate(async ({ id, want }) => {
      const S = (window as any).Sefaria;
      const ref = `Sheet ${id}`;
      const isSaved = !!S.getSavedItem({ ref, versions: {} });
      if (isSaved !== want) {
        await S.toggleSavedItem({ ref, versions: {} });
      }
    }, { id: sheetId, want: saved });
  }

  /** Ensure all the given sheets are NOT saved (used for setup + teardown). */
  async clearSavedSheets(sheetIds: number[]): Promise<void> {
    await this.page.evaluate(async (ids) => {
      const S = (window as any).Sefaria;
      for (const id of ids) {
        const ref = `Sheet ${id}`;
        if (S.getSavedItem({ ref, versions: {} })) {
          await S.toggleSavedItem({ ref, versions: {} });
        }
      }
    }, sheetIds);
  }
}
