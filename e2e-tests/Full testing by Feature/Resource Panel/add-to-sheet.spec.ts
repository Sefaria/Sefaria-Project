import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Add to Sheet (RP-130 → RP-133).
 *
 * Mode anchor: `.addToSourceSheetBox`. Reached from Tools by clicking
 * `data-name="Add to Sheet"`. Source: AddToSourceSheet.jsx
 * (`AddToSourceSheetBox` class).
 *
 * Auth gating: ConnectionsPanel.jsx:687 routes the button click to
 * `toggleSignUpModal(SignUpModalKind.AddToSheet)` when `!Sefaria._uid`,
 * otherwise to `setConnectionsMode("Add To Sheet")`.
 *
 * RP-131 (actually add a source) creates real persistent state on the QA
 * user's account. To stay idempotent we intercept the `/api/sheets/<id>/add`
 * call so production isn't polluted. The test still proves the UI navigation
 * and the request payload contain the expected ref.
 */

test.describe('Resource Panel — Add to Sheet — Logged out', () => {
  test('RP-130: Clicking Add to Sheet prompts a sign-up / log-in', async ({ context }) => {
    const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().toolsButton('Add to Sheet').click();
    await pm.onResourcePanel().expectAddToSheetSignUpModal();
  });
});

test.describe('Resource Panel — Add to Sheet — Logged in', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openAddToSheet();
  });

  test('RP-131: An existing sheet can be selected and the add action POSTs the source', async () => {
    // Intercept the add-source endpoint so production doesn't actually persist.
    let intercepted = false;
    let body: string | null = null;
    await page.route('**/api/sheets/**/add', async (route) => {
      intercepted = true;
      body = route.request().postData();
      // Reply with a sheet-shaped payload so the React component completes its happy path.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999999, sources: [{ ref: 'Genesis 1:1' }], status: 'ok' }),
      });
    });

    await pm.onResourcePanel().openSheetPickerDropdown();
    const optionCount = await pm.onResourcePanel().getSheetOptionCount();
    expect(optionCount).toBeGreaterThan(0); // QA user has at least one sheet
    await pm.onResourcePanel().clickFirstSheetOption();
    await pm.onResourcePanel().confirmAddToSheet();
    await page.waitForTimeout(t(3000));
    expect(intercepted).toBeTruthy();
    // jQuery's `$.post` urlencodes the body with `+` for spaces (not %20).
    // So decoded form is `Genesis+1:1` — normalize before matching.
    const decoded = decodeURIComponent(body ?? '').replace(/\+/g, ' ');
    expect(decoded).toContain('Genesis 1:1');
  });

  test('RP-132: The version selector is part of the request when versions exist for the text', async () => {
    // RP-132 asserts that "the correct version information [is] passed when
    // adding source." On Genesis 1:1 the panel's `addToSourceSheet()`
    // serializes `version-he` and/or `version-en` into the source JSON
    // (AddToSourceSheet.jsx:259-260). Note that when the currently-loaded
    // panel languages share the same direction, `handleSameDirectionVersions`
    // POSTs one request per language with `version-<lang>` per call — both
    // requests carry version metadata.
    const bodies: string[] = [];
    await page.route('**/api/sheets/**/add', async (route) => {
      const b = route.request().postData();
      if (b) bodies.push(b);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999999, sources: [], status: 'ok' }),
      });
    });
    await pm.onResourcePanel().openSheetPickerDropdown();
    await pm.onResourcePanel().clickFirstSheetOption();
    await pm.onResourcePanel().confirmAddToSheet();
    await page.waitForTimeout(t(4000));
    expect(bodies.length).toBeGreaterThan(0);
    // At least one of the POSTed bodies must reference version metadata.
    const decoded = bodies.map((b) => b.replace(/\+/g, ' ')).join('\n');
    expect(decoded).toMatch(/version-(he|en)/);
  });

  test('RP-133: Cancel returns the panel to Resources without adding the source', async () => {
    // The Add To Sheet panel doesn't have a discrete "Cancel" button in the
    // current build — the back button in the panel header is the cancel
    // affordance. Clicking it returns to Resources without firing the
    // add-source endpoint.
    let posted = false;
    await page.route('**/api/sheets/**/add', async (route) => {
      posted = true;
      await route.continue();
    });
    await pm.onResourcePanel().clickBack();
    await pm.onResourcePanel().expectMode('Resources');
    expect(posted).toBeFalsy();
  });
});
