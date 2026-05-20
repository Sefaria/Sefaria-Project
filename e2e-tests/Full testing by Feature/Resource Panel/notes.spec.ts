import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

// IMPORTANT: `BROWSER_SETTINGS.enUser` is *anonymous* English (user: null);
// `BROWSER_SETTINGS.enUser` is the logged-in primary user — that's the one to
// use here. (CLAUDE.md §4 table is misleading on this point.)

/**
 * Resource Panel — Notes (RP-120 → RP-124).
 *
 * Mode anchor: `.addNoteBox`. Reached from Resources by clicking
 * `data-name="Notes"`. Source: ConnectionsPanel.jsx AddNoteBox (line 1239),
 * MyNotes (line 1361), and Misc.jsx LoginPrompt / Note.
 *
 * Auth gating: `AddNoteBox.render` returns `<div class="addNoteBox">
 * <LoginPrompt /></div>` when `!Sefaria._uid` — RP-120 verifies that.
 *
 * RP-121 / RP-122 / RP-123 form a natural create-edit-delete sequence: they
 * each create their own data (or reuse from previous step) so the suite
 * stays idempotent. We use a unique marker per test run (`Date.now()`) to
 * isolate from prior runs that may have left orphan notes.
 */

const noteMarker = () => `<AUTO TEST RP-Notes ${Date.now()}>`;

test.describe('Resource Panel — Notes — Logged out', () => {
  test('RP-120: Clicking Notes prompts a sign-up / log-in', async ({ context }) => {
    // When logged out, the Notes click handler is
    //   () => toggleSignUpModal(SignUpModalKind.Notes)
    // which mounts the SignUpModal *instead of* entering Notes mode in the
    // panel. So we click the button directly and assert on the modal — not
    // via `openNotes()`/`expectMode('Notes')`.
    const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().toolsButton('Notes').click();
    // The SignUpModal renders as #interruptingMessageBox.sefariaModalBox
    // (Misc.jsx:1977) with a /register link.
    await expect(page.locator('#interruptingMessageBox.sefariaModalBox').first())
      .toBeVisible({ timeout: t(10000) });
    await expect(page.locator('#interruptingMessage a[href^="/register"]').first())
      .toBeVisible({ timeout: t(5000) });
  });
});

test.describe('Resource Panel — Notes — Logged in', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openNotes();
  });

  test('RP-121: A new note is saved and appears in My Notes for the segment', async () => {
    const text = `${noteMarker()} RP-121 add`;
    await pm.onResourcePanel().addNote(text);
    await pm.onResourcePanel().expectNoteInMyNotes(text);
    // Clean up so the suite doesn't accumulate state.
    await pm.onResourcePanel().clickEditNote(text);
    await pm.onResourcePanel().deleteCurrentlyEditedNote();
    await page.waitForTimeout(t(1500));
    expect(await pm.onResourcePanel().hasNoteWithText(text)).toBeFalsy();
  });

  test('RP-122: An existing note can be edited and the new text is shown', async () => {
    const initial = `${noteMarker()} RP-122 initial`;
    const edited = `${noteMarker()} RP-122 edited`;
    await pm.onResourcePanel().addNote(initial);
    await pm.onResourcePanel().expectNoteInMyNotes(initial);

    await pm.onResourcePanel().clickEditNote(initial);
    await pm.onResourcePanel().saveEditedNote(edited);
    await pm.onResourcePanel().expectNoteInMyNotes(edited);

    // Clean up.
    await pm.onResourcePanel().clickEditNote(edited);
    await pm.onResourcePanel().deleteCurrentlyEditedNote();
    await page.waitForTimeout(t(1500));
    expect(await pm.onResourcePanel().hasNoteWithText(edited)).toBeFalsy();
  });

  test('RP-123: Deleting a note removes it from the list', async () => {
    const text = `${noteMarker()} RP-123 delete`;
    await pm.onResourcePanel().addNote(text);
    await pm.onResourcePanel().expectNoteInMyNotes(text);

    await pm.onResourcePanel().clickEditNote(text);
    await pm.onResourcePanel().deleteCurrentlyEditedNote();
    await page.waitForTimeout(t(2000));
    expect(await pm.onResourcePanel().hasNoteWithText(text)).toBeFalsy();
  });

  test('RP-124: "Go to My Notes" link points at /texts/notes', async () => {
    const link = pm.onResourcePanel().goToMyNotesLink();
    await expect(link).toBeVisible({ timeout: t(10000) });
    await expect(link).toHaveAttribute('href', /\/texts\/notes/);
  });
});
