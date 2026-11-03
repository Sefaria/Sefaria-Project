import { expect, Locator, Page, BrowserContext } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { t } from '../globals';

/**
 * Copy Tool — right-click menu + dialog (logged-in users), and the sign-up
 * pitch shown to anonymous users on their second regular (native) copy.
 *
 * Source:
 * - static/js/CopyTool.jsx — `CopyToolMenu` (`.copyToolMenu[role="menu"]`,
 *   items `role="menuitem"`), `CopyToolDialog` (`.copyToolDialog[role="dialog"]`,
 *   title `#copyToolTitle` with the ref in a nested `.copyToolRef` span,
 *   radio group `copyToolLevel`, language checkboxes, `.copyToolPreview`),
 *   `CopyToolToast` (`.copyToolToast[role="status"]`).
 * - static/js/sefaria/copyTool.js — `getTargetFromEvent` (right-click target
 *   detection on `.readerPanel .segment[data-ref]` or a search result
 *   `.textResult[data-ref] .snippet`), the pending-request stash
 *   (`copyTool.pending`, unrenamed per the product owner) resumed after login.
 * - static/js/ReaderApp.jsx — `handleCopyToolContextMenu` (right-click menu
 *   is logged-in only as of the 2026-09-28 revision; Shift+right-click and
 *   right-clicks on real links still fall through to the native menu),
 *   `showCopyToolPitch` (opens `SignUpModal` with `SignUpModalKind.CopyTool`),
 *   `resumePendingCopy` (runs on mount for a logged-in user), the existing
 *   `handleCopyEvent` native `copy`-event listener (predates this feature —
 *   formats clipboard HTML for paste — now also the hook for the anonymous
 *   one-pitch-per-browser gating on a real Ctrl/Cmd+C).
 *
 * NAMING RISK (flagged for the product owner): the anonymous copy counter and
 * the "pitch already shown" flag are new/renamed localStorage keys this POM
 * does NOT read or assert on directly — every anonymous test below drives the
 * gating purely through real UI actions (select text, press the OS copy
 * shortcut, look at the resulting DOM) rather than seeding or reading those
 * keys, so it stays correct regardless of what they end up being named. Only
 * `copyTool.pending` is asserted on by name below, per the product owner's
 * confirmation that it is NOT being renamed. If that changes, update
 * `PENDING_STORAGE_KEY` below — it is the single place that name is spelled.
 *
 * The tool is Library-only and multiPanel-only (`copyToolEnabled()` in
 * ReaderApp.jsx), so every action here assumes a desktop viewport on
 * www.<sandbox> — never voices.*.
 */

export type CopyToolLevel = 'word' | 'segment' | 'section';
export type CopyToolLanguage = 'source' | 'translation';

/** The one localStorage key name this POM depends on — see NAMING RISK above. */
const PENDING_STORAGE_KEY = 'copyTool.pending';

/**
 * English level-radio labels for a Genesis ref. `levelLabel()` in CopyTool.jsx
 * renders "Word" for the word level and the book's own `sectionNames` for the
 * others — for Genesis that's `["Chapter", "Verse"]` (verified against
 * `GET /api/v3/texts/Genesis.1.1`, `sectionNames`/`textDepth`). A spec
 * targeting a different book must not reuse this map.
 */
export const GENESIS_LEVEL_LABELS: Record<CopyToolLevel, string> = {
  word: 'Word',
  segment: 'Verse',
  section: 'Chapter',
};

const LANGUAGE_LABELS: Record<CopyToolLanguage, string> = {
  source: 'Source',
  translation: 'Translation',
};

/**
 * Seed a pending copy request — the state `stashPending()` leaves behind when
 * a user is shown the sign-up pitch — so a logged-in test can verify
 * `resumePendingCopy()` (ReaderApp.jsx componentDidMount) reopens the dialog
 * automatically. Same pre-navigation ordering rule as
 * `seedPreviousDialogSettings`.
 */
export const seedCopyToolPendingTarget = async (context: BrowserContext, ref: string): Promise<void> => {
  await context.addInitScript(({ key, refArg }) => {
    try {
      window.localStorage.setItem(key, JSON.stringify({
        target: {
          ref: refArg,
          word: null,
          wordLang: null,
          versions: { source: null, translation: null },
          shown: { source: true, translation: true },
        },
        time: Date.now(),
      }));
    } catch (e) { /* storage denial (private window) */ }
  }, { key: PENDING_STORAGE_KEY, refArg: ref });
};

export class CopyToolPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ============================================================
  // Locators — CopyToolMenu (logged-in only)
  // ============================================================

  private get menu(): Locator {
    return this.page.locator('.copyToolMenu[role="menu"]');
  }

  private get copyEllipsisMenuItem(): Locator {
    return this.menu.getByRole('menuitem', { name: 'Copy…' });
  }

  private get copyPreviousMenuItem(): Locator {
    return this.menu.getByRole('menuitem', { name: 'Copy with previous settings' });
  }

  // ============================================================
  // Locators — CopyToolDialog
  // ============================================================

  private get dialog(): Locator {
    return this.page.locator('.copyToolDialog[role="dialog"]');
  }

  private get dialogTitleRef(): Locator {
    // `<h2 id="copyToolTitle">Copy from <span class="copyToolRef">{titleRef}</span></h2>`
    return this.dialog.locator('#copyToolTitle .copyToolRef');
  }

  private get preview(): Locator {
    return this.dialog.locator('.copyToolPreview');
  }

  /**
   * A specific rendered child inside the preview, not just the outer wrapper
   * (CLAUDE.md rule §2.11 — `.copyToolPreview` mounts immediately; its content
   * streams in once `loadCopyData` resolves). Formatted output renders one
   * `<p>` per line (CopyTool.jsx `render()`); plain/markdown/HTML-source
   * render a single `<pre>`.
   */
  private get previewContent(): Locator {
    return this.preview.locator('p, pre');
  }

  private get copyButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Copy', exact: true });
  }

  languageCheckbox(lang: CopyToolLanguage): Locator {
    return this.dialog.getByRole('checkbox', { name: LANGUAGE_LABELS[lang] });
  }

  // ============================================================
  // Locators — CopyToolToast
  // ============================================================

  private get toast(): Locator {
    return this.page.locator('.copyToolToast[role="status"]');
  }

  // ============================================================
  // Locators — SignUpModal (Misc.jsx), Copy Tool pitch variant
  // ============================================================

  private get signUpModal(): Locator {
    return this.page.locator('#interruptingMessageBox');
  }

  private get signUpModalHeading(): Locator {
    return this.signUpModal.locator('h2');
  }

  private get signUpLink(): Locator {
    return this.signUpModal.getByRole('link', { name: 'Sign Up' });
  }

  private get signInLink(): Locator {
    return this.signUpModal.getByRole('link', { name: 'Sign in' });
  }

  /** Generic modal close (×) — `#interruptingMessageClose`, unrelated to the
   * CopyTool-specific "Not now" button that no longer exists. */
  private get closeButton(): Locator {
    return this.signUpModal.locator('#interruptingMessageClose');
  }

  // ============================================================
  // Segment / search-result targeting
  // (static/js/sefaria/copyTool.js getTargetFromEvent)
  // ============================================================

  /**
   * The source-language span inside a main-reader segment
   * (`.contentSpan.primary`, ContentText.jsx) — a point guaranteed to be real
   * rendered text, so the right-click reliably lands on a word (needed for the
   * "Word" level radio to appear) rather than inter-line whitespace.
   */
  private segmentPrimarySpan(ref: string): Locator {
    return this.page
      .locator(`.readerPanelBox:not(.sidebar) .segment[data-ref="${ref}"] .contentSpan.primary`)
      .first();
  }

  /** The translation-language span inside a main-reader segment — used for
   * real drag-selection (LTR, simpler to reason about than RTL Hebrew). */
  private segmentTranslationSpan(ref: string): Locator {
    return this.page
      .locator(`.readerPanelBox:not(.sidebar) .segment[data-ref="${ref}"] .contentSpan.translation`)
      .first();
  }

  // ============================================================
  // Actions — real text selection + native copy (anonymous flow)
  // ============================================================

  /**
   * Real mouse-drag selection confined to the element's FIRST visual line box
   * (`getClientRects()[0]`), never the bounding-box center: a segment's text
   * commonly wraps onto multiple lines, and the center of a multi-line box
   * falls in the gap *between* lines (hit-tested to a block ancestor, not
   * this element) — dragging there would either fail Playwright's actionability
   * check or land outside real glyphs. Staying inside one line box guarantees
   * every point of the drag is over real text, and creates a genuine browser
   * `Selection` — not a `dispatchEvent` synthetic one — so a real
   * Ctrl/Cmd+C afterward fires an authentic native `copy` event (rule §2.10 /
   * the wiki note on synthetic input masking real-browser behavior).
   */
  private async dragSelectFirstLine(locator: Locator): Promise<void> {
    const points = await locator.evaluate((el) => {
      const rect = el.getClientRects()[0];
      if (!rect) { return null; }
      const y = rect.top + rect.height / 2;
      const pad = Math.max(2, Math.min(6, rect.width * 0.1));
      return { startX: rect.left + pad, endX: rect.right - pad, y };
    });
    if (!points) {
      throw new Error('dragSelectFirstLine: target has no rendered line box to select within');
    }
    await this.page.mouse.move(points.startX, points.y);
    await this.page.mouse.down();
    await this.page.mouse.move(points.endX, points.y, { steps: 10 });
    await this.page.mouse.up();
  }

  /** Select some real text inside a main-reader segment's translation span. */
  async selectSegmentText(ref: string): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    const span = this.segmentTranslationSpan(ref);
    await expect(span).toBeVisible({ timeout: t(15000) });
    await this.dragSelectFirstLine(span);
  }

  /**
   * Press the OS copy shortcut. This is the native, browser-implemented
   * `copy` command (works via the legacy clipboard-event pathway, not the
   * permission-gated async Clipboard API), so — unlike reading the clipboard
   * back — it needs no `context.grantPermissions` and works on every browser.
   */
  async pressCopyShortcut(): Promise<void> {
    const key = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';
    await this.page.keyboard.press(key);
  }

  /** Select a segment's text and copy it in one step. */
  async copySegmentText(ref: string): Promise<void> {
    await this.selectSegmentText(ref);
    await this.pressCopyShortcut();
  }

  // ============================================================
  // Actions — opening the menu (logged-in only)
  // ============================================================

  async rightClickSegment(ref: string, options: { shift?: boolean } = {}): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    const target = this.segmentPrimarySpan(ref);
    await expect(target).toBeVisible({ timeout: t(15000) });
    // Explicit `position` rather than Playwright's default bounding-box
    // center — see `dragSelectFirstLine`'s comment for why a multi-line
    // box's center is unsafe. A few px in from the top-left corner is inside
    // the first line's glyphs either way text direction runs.
    await target.click({
      button: 'right',
      position: { x: 6, y: 6 },
      modifiers: options.shift ? ['Shift'] : [],
    });
  }

  /**
   * Right-click a search-result snippet (Sources tab). Returns the result's
   * `data-ref` so the caller can assert the dialog opens for that exact ref.
   */
  async rightClickSearchResult(index = 0): Promise<string | null> {
    await hideAllModalsAndPopups(this.page);
    const result = this.page.locator('.textResult[data-ref]').nth(index);
    await expect(result).toBeVisible({ timeout: t(20000) });
    const ref = await result.getAttribute('data-ref');
    const snippet = result.locator('.snippet').first();
    await expect(snippet).toBeVisible({ timeout: t(10000) });
    await snippet.click({ button: 'right' });
    return ref;
  }

  async expectMenuVisible(): Promise<void> {
    await expect(this.menu).toBeVisible({ timeout: t(5000) });
  }

  /**
   * Confirm the menu never renders (anonymous right-click, or Shift+right-click
   * for any user). `toHaveCount(0)` would pass instantly on a check taken
   * before a (buggy) late render, so we give any pending React update a
   * moment to settle first — the CLAUDE.md rule §2.6 exception for deliberate
   * pacing on a negative assertion.
   */
  async expectMenuNeverAppears(): Promise<void> {
    await this.page.waitForTimeout(t(1000));
    await expect(this.menu).toHaveCount(0);
  }

  async expectOnlyCopyEllipsisItem(): Promise<void> {
    await this.expectMenuVisible();
    await expect(this.copyEllipsisMenuItem).toBeVisible({ timeout: t(5000) });
    await expect(this.copyPreviousMenuItem).toHaveCount(0);
  }

  async expectPreviousSettingsItemVisible(): Promise<void> {
    await expect(this.copyPreviousMenuItem).toBeVisible({ timeout: t(5000) });
  }

  async clickCopyEllipsis(): Promise<void> {
    await this.copyEllipsisMenuItem.click();
  }

  async clickCopyWithPreviousSettings(): Promise<void> {
    await this.copyPreviousMenuItem.click();
  }

  // ============================================================
  // Actions — dialog
  // ============================================================

  async expectDialogOpenForRef(ref: string): Promise<void> {
    await expect(this.dialog).toBeVisible({ timeout: t(15000) });
    await expect(this.dialogTitleRef).toHaveText(ref, { timeout: t(15000) });
  }

  async getDialogTitleRef(): Promise<string> {
    return (await this.dialogTitleRef.textContent())?.trim() ?? '';
  }

  async expectLevelRadiosVisible(): Promise<void> {
    for (const label of Object.values(GENESIS_LEVEL_LABELS)) {
      await expect(this.dialog.getByRole('radio', { name: label })).toBeVisible({ timeout: t(10000) });
    }
  }

  async expectLanguageCheckboxesPresent(): Promise<void> {
    await expect(this.languageCheckbox('source')).toBeVisible({ timeout: t(10000) });
    await expect(this.languageCheckbox('translation')).toBeVisible({ timeout: t(10000) });
  }

  async selectLevel(label: string): Promise<void> {
    await this.dialog.getByRole('radio', { name: label }).check();
  }

  async waitForPreviewNonEmpty(): Promise<void> {
    await expect(this.previewContent.first()).toBeVisible({ timeout: t(20000) });
  }

  async previewParagraphCount(): Promise<number> {
    return this.previewContent.count();
  }

  async previewText(): Promise<string> {
    return (await this.preview.innerText()).trim();
  }

  async clickCopyButton(): Promise<void> {
    await expect(this.copyButton).toBeEnabled({ timeout: t(15000) });
    await this.copyButton.click();
  }

  // ============================================================
  // Actions — toast
  // ============================================================

  async waitForCopiedToast(): Promise<void> {
    await expect(this.toast).toBeVisible({ timeout: t(10000) });
    await expect(this.toast).toContainText('Copied', { timeout: t(5000) });
  }

  // ============================================================
  // Actions — clipboard (dialog "Copy" button path only; content-reading is
  // Chromium-only — the real-Ctrl+C anonymous flow needs none of this, see
  // `pressCopyShortcut`)
  // ============================================================

  /**
   * `grantPermissions(['clipboard-read', 'clipboard-write'])` is a Chromium-only
   * Playwright capability — it throws on Firefox/WebKit. Callers must only
   * invoke this under `browserName === 'chromium'`.
   */
  async grantClipboardPermissions(context: BrowserContext): Promise<void> {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  }

  async readClipboardText(): Promise<string> {
    return this.page.evaluate(async () => {
      try {
        return (await navigator.clipboard.readText()) ?? '';
      } catch {
        return '';
      }
    });
  }

  // ============================================================
  // Actions — sign-up pitch modal (SignUpModalKind.CopyTool)
  // ============================================================

  async expectSignUpModalVisible(): Promise<void> {
    await expect(this.signUpModal).toBeVisible({ timeout: t(10000) });
    await expect(this.signUpModalHeading).toContainText(
      'Copy texts exactly the way you need them',
      { timeout: t(5000) },
    );
  }

  /**
   * Confirm the pitch never appears (e.g. after a first or third anonymous
   * copy). Same deliberate-pacing rationale as `expectMenuNeverAppears`.
   */
  async expectPitchNeverAppears(): Promise<void> {
    await this.page.waitForTimeout(t(1000));
    await expect(this.signUpModal).toHaveCount(0);
  }

  async expectSignUpModalHidden(): Promise<void> {
    await expect(this.signUpModal).toBeHidden({ timeout: t(10000) });
  }

  /**
   * `nextParam` in Misc.jsx SignUpModal = `"?next=" + encodeURIComponent(Sefaria.util.currentPath())`
   * (pathname + search). `expectedPath` should be `getPathAndParams(page.url())`
   * captured at the moment the modal opened.
   */
  async expectSignUpLinksCarryNextParam(expectedPath: string): Promise<void> {
    const nextParam = `?next=${encodeURIComponent(expectedPath)}`;
    await expect(this.signUpLink).toBeVisible({ timeout: t(5000) });
    await expect(this.signUpLink).toHaveAttribute('href', `/register${nextParam}`);
    await expect(this.signInLink).toHaveAttribute('href', `/login${nextParam}`);
  }

  /** Close the pitch via the generic × close button (the CopyTool-specific
   * "Not now, just copy the plain text" button has been removed). */
  async closeSignUpModal(): Promise<void> {
    await expect(this.closeButton).toBeVisible({ timeout: t(5000) });
    await this.closeButton.click();
    await this.expectSignUpModalHidden();
  }

  // ============================================================
  // localStorage — assert the DOM/state facts directly (CLAUDE.md rule §2)
  // ============================================================

  async getLocalStorageItem(key: string): Promise<string | null> {
    return this.page.evaluate((k) => window.localStorage.getItem(k), key);
  }

  async getLocalStorageJSON<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.getLocalStorageItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  /** `copyTool.pending` — see the NAMING RISK note at the top of this file. */
  async getPendingTarget(): Promise<{ target?: { ref?: string } } | null> {
    return this.getLocalStorageJSON<{ target?: { ref?: string } }>(PENDING_STORAGE_KEY);
  }

  /**
   * Seed the localStorage state one earlier completed dialog copy leaves
   * behind (`copyTool.settings` via `saveSettings()` in sefaria/copyTool.js),
   * so a test can reach the "returning copier" menu state (`showPrevious` on
   * `CopyToolMenu`) deterministically, without needing an actual clipboard
   * write to succeed first (clipboard write permissions are Chromium-only in
   * Playwright — see `grantClipboardPermissions`). This key is unaffected by
   * the anonymous-gating rework (that's a separate counter/flag — see the
   * NAMING RISK note at the top of this file), so its name and shape are
   * assumed stable.
   *
   * Unlike `seedCopyToolPendingTarget`, this can run AFTER the page has
   * already loaded: `hasPreviousSettings()` re-reads localStorage fresh every
   * time the menu is about to render (it's evaluated in the JSX each time
   * `handleCopyToolContextMenu` sets state), not once at mount like
   * `resumePendingCopy()` — so no pre-navigation `addInitScript` or reload
   * is needed here.
   */
  async seedPreviousDialogSettingsNow(): Promise<void> {
    await this.page.evaluate(() => {
      try {
        window.localStorage.setItem('copyTool.settings', JSON.stringify({
          level: 'segment',
          languages: null,
          format: 'formatted',
          citation: true,
          segmentNumbers: false,
          notes: 'omit',
          vowels: 'all',
        }));
      } catch (e) { /* storage denial (private window) — degrades to the fresh-storage case */ }
    });
  }
}
