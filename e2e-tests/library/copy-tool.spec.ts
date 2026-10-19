import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups, getPathAndParams } from '../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS, librarySearchUrl } from '../constants';
import { GENESIS_LEVEL_LABELS, seedCopyToolPendingTarget } from '../pages/copyToolPage';

/**
 * Copy Tool (`static/js/CopyTool.jsx` + `static/js/sefaria/copyTool.js`) —
 * 2026-09-28 revision: the right-click menu / dialog / "previous settings"
 * shortcut are LOGGED-IN only. An anonymous user right-clicking gets the
 * ordinary browser context menu. An anonymous user who copies library text
 * the regular way (select + Ctrl/Cmd+C — a native `copy` event, unrelated to
 * the right-click menu) gets the Copy Tool sign-up pitch on their SECOND such
 * copy, once per browser; the copy itself is never blocked.
 *
 * Fixture: Genesis 1:1 (`/Genesis.1.1?lang=bi`) — bilingual so both the
 * Source and Translation checkboxes are checked by default (`target.shown` in
 * `getTargetFromEvent` reads visibility of `.contentSpan.primary` /
 * `.contentSpan.translation`, both rendered under `lang=bi`) and both spans
 * are on-screen for the real-selection anonymous tests. Verified via
 * `GET /api/v3/texts/Genesis.1.1?version=primary&version=translation` and
 * `GET /api/texts/Genesis.1.1?context=0` (CLAUDE.md rule §2.13): Genesis has
 * `sectionNames: ["Chapter", "Verse"]`, `textDepth: 2`, `sectionRef: "Genesis 1"`,
 * and the default English translation's text for 1:1 contains "earth" — the
 * word CT-008 asserts on, chosen as a near-universal token across Genesis 1:1
 * translations rather than tied to one specific version's exact wording.
 *
 * NAMING RISK: the anonymous copy counter and "pitch already shown" flag are
 * localStorage keys that may still be renamed by the team implementing the
 * feature (see `e2e-tests/pages/copyToolPage.ts`'s file-level comment). Every
 * anonymous test below is written to depend only on observable UI/DOM state
 * (menu presence, the pitch modal, `copyTool.pending` — confirmed stable) so
 * it needs no changes if those two keys are renamed.
 *
 * The tool is Library-only and multiPanel-only (`copyToolEnabled()` in
 * ReaderApp.jsx), hence this folder (not voices/) and no mobile coverage.
 */

const GENESIS_URL = `${MODULE_URLS.EN.LIBRARY}/Genesis.1.1?lang=bi`;
const GENESIS_1_1 = 'Genesis 1:1';

test.describe('Library Copy Tool — English, anonymous', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, GENESIS_URL, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('CT-001: right-click a segment never opens the Copy Tool menu (logged-in only feature)', async () => {
    await pm.onCopyTool().rightClickSegment(GENESIS_1_1);
    await pm.onCopyTool().expectMenuNeverAppears();
  });

  test('CT-002: the sign-up pitch appears on the second regular copy, not the first or a third', async () => {
    const expectedPath = getPathAndParams(page.url());

    // First real copy (select text + press the OS copy shortcut): no pitch.
    await pm.onCopyTool().copySegmentText(GENESIS_1_1);
    await pm.onCopyTool().expectPitchNeverAppears();

    // Second real copy: the pitch appears.
    await pm.onCopyTool().copySegmentText(GENESIS_1_1);
    await pm.onCopyTool().expectSignUpModalVisible();
    await pm.onCopyTool().expectSignUpLinksCarryNextParam(expectedPath);

    const pending = await pm.onCopyTool().getPendingTarget();
    expect(pending?.target?.ref).toBe(GENESIS_1_1);

    // Closed via the generic × (the old "Not now, just copy" button is gone).
    await pm.onCopyTool().closeSignUpModal();

    // Third real copy: the pitch does not reappear (shown once per browser).
    await pm.onCopyTool().copySegmentText(GENESIS_1_1);
    await pm.onCopyTool().expectPitchNeverAppears();
  });

  test('CT-003: the Tools panel "Copy" button opens the sign-up pitch for an anonymous user', async () => {
    // Same anonymous gating pattern as the existing Notes / Add to Sheet
    // Tools buttons (ConnectionsPanel.jsx: `!Sefaria._uid ? toggleSignUpModal(...) : ...`).
    await pm.onResourcePanel().clickFirstSegmentToOpen();
    await pm.onResourcePanel().toolsButton('Copy').click();
    await pm.onCopyTool().expectSignUpModalVisible();
  });
});

test.describe('Library Copy Tool — English, logged-in user', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    // enUser is the shared standard-account session; nothing below mutates
    // its server-side auth state (no logout / re-login / password change —
    // CLAUDE.md rule §2.21), only per-context localStorage and clipboard, so
    // it's safe to run this describe block at full parallelism.
    page = await goToPageWithUser(context, GENESIS_URL, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('CT-004: fresh session — right-click a segment shows only "Copy…"', async () => {
    await pm.onCopyTool().rightClickSegment(GENESIS_1_1);
    await pm.onCopyTool().expectOnlyCopyEllipsisItem();
  });

  test('CT-005: Shift+right-click a segment never opens the Copy Tool menu', async () => {
    await pm.onCopyTool().rightClickSegment(GENESIS_1_1, { shift: true });
    await pm.onCopyTool().expectMenuNeverAppears();
  });

  test('CT-006: "Copy…" opens the dialog — title, level radios, language checkboxes, populated preview', async () => {
    await pm.onCopyTool().rightClickSegment(GENESIS_1_1);
    await pm.onCopyTool().clickCopyEllipsis();

    await pm.onCopyTool().expectDialogOpenForRef(GENESIS_1_1);
    await pm.onCopyTool().expectLevelRadiosVisible();
    await pm.onCopyTool().expectLanguageCheckboxesPresent();

    await pm.onCopyTool().waitForPreviewNonEmpty();
    expect((await pm.onCopyTool().previewText()).length).toBeGreaterThan(0);
  });

  test('CT-007: selecting Chapter updates the title to the chapter ref and previews multiple segments', async () => {
    await pm.onCopyTool().rightClickSegment(GENESIS_1_1);
    await pm.onCopyTool().clickCopyEllipsis();
    await pm.onCopyTool().expectDialogOpenForRef(GENESIS_1_1);
    await pm.onCopyTool().waitForPreviewNonEmpty();

    await pm.onCopyTool().selectLevel(GENESIS_LEVEL_LABELS.section); // "Chapter"

    await expect.poll(
      () => pm.onCopyTool().getDialogTitleRef(),
      { timeout: t(15000) },
    ).toBe('Genesis 1');

    // Genesis 1 has 31 verses — the preview must show more than the single
    // paragraph a segment-level copy would produce (rule §2.11: wait for the
    // actual re-rendered children, not just the still-mounted `.copyToolPreview`).
    await expect.poll(
      () => pm.onCopyTool().previewParagraphCount(),
      { timeout: t(20000) },
    ).toBeGreaterThan(1);
  });

  test('CT-008: Copy writes formatted text plus a citation to the clipboard', async ({ context, browserName }) => {
    // Clipboard READ permissions are a Chromium-only Playwright capability —
    // a harness limitation, not a product gap. (Writing via the dialog's
    // "Copy" button uses the async Clipboard API and works on every browser;
    // only reading it back afterward to assert on content needs the grant.)
    test.skip(browserName !== 'chromium', 'clipboard-read permission grants are Chromium-only in Playwright');

    await pm.onCopyTool().grantClipboardPermissions(context);
    await pm.onCopyTool().rightClickSegment(GENESIS_1_1);
    await pm.onCopyTool().clickCopyEllipsis();
    await pm.onCopyTool().expectDialogOpenForRef(GENESIS_1_1);
    await pm.onCopyTool().waitForPreviewNonEmpty();

    await pm.onCopyTool().clickCopyButton();
    await pm.onCopyTool().waitForCopiedToast();

    const clipboard = await pm.onCopyTool().readClipboardText();
    expect(clipboard.toLowerCase()).toContain('earth');
    expect(clipboard).toContain(`— ${GENESIS_1_1}`);
  });

  test('CT-009: after a copy, the menu offers "Copy with previous settings"', async () => {
    // Seed the settings a completed dialog copy leaves behind rather than
    // depending on a real clipboard write succeeding first (see
    // `seedPreviousDialogSettingsNow`'s doc comment) — this key is independent
    // of the anonymous-gating rework, so it's safe to seed directly.
    await pm.onCopyTool().seedPreviousDialogSettingsNow();

    await pm.onCopyTool().rightClickSegment(GENESIS_1_1);
    await pm.onCopyTool().expectPreviousSettingsItemVisible();
  });

  test('CT-010: the Tools panel "Copy" button opens the dialog for the selected segment', async () => {
    const ref = await pm.onResourcePanel().clickFirstSegmentToOpen();
    await pm.onResourcePanel().toolsButton('Copy').click();
    await pm.onCopyTool().expectDialogOpenForRef(ref);
  });
});

test.describe('Library Copy Tool — English, logged-in user, search results', () => {
  test('CT-011: right-clicking a search result snippet opens the menu, and "Copy…" opens the dialog', async ({ context }) => {
    const page = await goToPageWithUser(context, librarySearchUrl('shabbat'), BROWSER_SETTINGS.enUser);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);

    const ref = await pm.onCopyTool().rightClickSearchResult();
    expect(ref).toBeTruthy();

    await pm.onCopyTool().expectMenuVisible();
    await pm.onCopyTool().clickCopyEllipsis();
    await pm.onCopyTool().expectDialogOpenForRef(ref!);
  });
});

test.describe('Library Copy Tool — English, logged-in user, resume pending copy', () => {
  test('CT-012: a pending copy request reopens the dialog on load and clears the pending key', async ({ context }) => {
    await seedCopyToolPendingTarget(context, GENESIS_1_1);
    const page = await goToPageWithUser(context, GENESIS_URL, BROWSER_SETTINGS.enUser);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);

    // resumePendingCopy() runs on ReaderApp mount for a logged-in user and
    // opens the dialog directly — no right-click needed.
    await pm.onCopyTool().expectDialogOpenForRef(GENESIS_1_1);

    const pending = await pm.onCopyTool().getPendingTarget();
    expect(pending).toBeNull();
  });
});
