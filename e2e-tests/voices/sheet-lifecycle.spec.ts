/**
 * SHEET LIFECYCLE — feature-coverage tests (SHT-NNN)
 *
 * Complete sheet lifecycle on the Voices module: create, edit, add sources,
 * publish, unpublish, collections, delete. Serial with shared state — SHT-001
 * creates one sheet that SHT-002 … SHT-010 operate on.
 *
 * All ten are @sanity (part of the release-gate suite; see Sanity/README.md).
 */

import { test, expect } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, BROWSER_SETTINGS, t } from '../globals';
import { MODULE_URLS } from '../constants';
import { PageManager } from '../pages/pageManager';
import { SheetEditorPage } from '../pages/sheetEditorPage';

let sheetUrl: string;
let sheetTitle: string;
// Test is serial because it relies on shared state (the sheet created in the first test)
test.describe.serial('Sheet Lifecycle', { tag: '@sanity' }, () => {

  // =================================================================
  // TEST 1: Login and Create Sheet
  // =================================================================
  test('SHT-001: Login and create sheet', async ({ context }) => {
    // Start logged in on Voices module (where sheet creation happens)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);

    // Create sheet by clicking the Create button in header
    await page.getByRole('button', { name: 'Create' }).first().click();
    // Web-first URL assertion — Create triggers a client-side (SPA) route change;
    // waitForURL waits for the `load` event, which can lag past the URL update.
    await expect(page).toHaveURL(/\/sheets\/\d+/, { timeout: t(15000) });
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);

    // Wait for sheet editor to load (using modularized selector)
    await page.waitForSelector('.sheetContent', { timeout: t(10000) });

    // Store sheet info for subsequent tests
    sheetUrl = page.url();
    sheetTitle = `Test Sheet ${Date.now()}`;

    // Verify sheet created successfully
    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    expect(sheetUrl).toBeTruthy();
    await expect(sheetEditorPage.sourceSheetBody()).toBeVisible({ timeout: t(10000) });
  });

  // =================================================================
  // TEST 2: Give Sheet a Title
  // =================================================================
  test('SHT-002: Give sheet a title', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('domcontentloaded');

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    await sheetEditorPage.editTitle(sheetTitle);
    // Need to write something to save title
    await sheetEditorPage.addText("Genesis 1:3");
    await page.keyboard.press('Enter');
    await page.waitForTimeout(t(2000)); // Extra wait for auto-save

    const genesisSource = sheetEditorPage.addedSource().filter({ hasText: "Genesis 1:3" }).first();
    await expect(genesisSource).toBeVisible();
  });

  // =================================================================
  // TEST 3: Add Source via Text Lookup (Voices Module)
  // =================================================================
  test('SHT-003: Add source using text lookup in Voices', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('domcontentloaded');
    // We're in Voices module (sheet was created there)
    // Add source via text lookup
    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    // BOOTLEG: Fix because plus button is not on bottom as it should be
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await sheetEditorPage.addSampleSource(); // Genesis 1:1
    await page.waitForTimeout(t(2000)); // Extra wait for auto-save

    const genesisSource = sheetEditorPage.addedSource().filter({ hasText: "Genesis 1:1" }).first();
    await expect(genesisSource).toBeVisible();
  });

  // =================================================================
  // TEST 4: Add Image to Sheet
  // =================================================================
  test('SHT-004: Add image to sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('domcontentloaded');

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);

    // Navigate to end of sheet
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
    }

    // Add image using the sample image method
    await sheetEditorPage.addSampleImage();
    await page.waitForTimeout(t(2000)); // Extra wait for image upload and auto-save

    // Verify image was added
    await expect(sheetEditorPage.addedImage()).toBeVisible();
  });

  // =================================================================
  // TEST 5: Add YouTube Video to Sheet
  // =================================================================
  test('SHT-005: Add YouTube video to sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('domcontentloaded');

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);

    // Navigate to end of sheet
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
    }

    // Add YouTube video
    const youtubeUrl = 'https://youtu.be/oRXVtpUCSGM';
    await sheetEditorPage.addSampleMedia(youtubeUrl);
    await page.waitForTimeout(t(2000)); // Extra wait for video embed and auto-save

    // Verify YouTube video was added
    await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  });

  // =================================================================
  // TEST 6: Add Source from Library Reader
  // =================================================================
  test('SHT-006: Add source from Library reader to sheet', async ({ context }) => {
    // Navigate to Library reader
    const page = await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/Job.1.2?lang=bi&with=all&lang2=en`, BROWSER_SETTINGS.enUser);
    // await page.waitForLoadState('domcontentloaded');

    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onSourceTextPage().addToSheetViaConnectionsPanel(sheetTitle);

    // Verify added (navigate back to sheet)
    await page.goto(sheetUrl);
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
    }
    
    const jobSource = sheetEditorPage.addedSource().filter({ hasText: "Job 1:2" }).first();
    await expect(jobSource).toBeVisible();
  });

  // ================================================================
  // TEST 7: Publish Sheet
  // ================================================================
  test('SHT-007: Publish sheet with metadata', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    await sheetEditorPage.clickPublishButton();
    await sheetEditorPage.fillPublishForm(
      sheetTitle,
      'Comprehensive test sheet for sanity testing',
      ['Tests']
    );
    await sheetEditorPage.publishSheet();

    // Close menu by pressing mouse on bottom left screen
    await page.mouse.move(0, 0);
    await page.mouse.down();
    await page.mouse.up();

    // Verify published (Unpublish option should appear in menu)
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    await sheetEditorPage.openOptionsMenu();
    await expect(page.getByText('Unpublish')).toBeVisible();

  });

  // =================================================================
  // TEST 8: Unpublish Sheet
  // =================================================================
  test('SHT-008: Unpublish sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    await sheetEditorPage.unpublishSheet();
    await page.waitForLoadState('domcontentloaded');
    // Close menu by pressing mouse on top of the screen
    await page.mouse.move(0, 0);
    await page.mouse.down();
    await page.mouse.up();

    // Verify unpublished (Publish button should return)
    await expect(page.getByRole('button', { name: /publish/i })).toBeVisible();
  });

  // =================================================================
  // TEST 9: Add Sheet to Collection
  // =================================================================
  test('SHT-009: Add sheet to a new collection', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    const collectionName = `Test Collection ${Date.now()}`;
    await sheetEditorPage.createAndAddToCollection(collectionName);

    // Verify collection was added=
    await sheetEditorPage.openCollectionsModal();
    const collectionCheckbox = page.locator('.checkmarkLabel')
      .filter({ hasText: collectionName })
      .locator('input[type="checkbox"]');
    await expect(collectionCheckbox).toBeChecked();

    // Close modal
    const doneButton = page.locator('.button.large.fillWidth');
    await doneButton.click();
  });

  // =================================================================
  // TEST 10: Delete Sheet
  // =================================================================
  test('SHT-010: Delete sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('domcontentloaded');

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    await sheetEditorPage.deleteSheet();

    // Assert we are no longer on sheetsurl but our profile page
    await expect(page).toHaveURL(/\/profile/);

    // Assert that the sheet is no longer visible in the profile page
    await expect(page.getByText(sheetTitle)).not.toBeVisible();
  });
});

/**
 * TEST SUMMARY:
 *
 * 10 tests for complete sheet workflow (all @sanity):
 * SHT-001. Login and Create Sheet - Login to Voices and create sheet with unique ID
 * SHT-002. Title - Gives sheet a descriptive title
 * SHT-003. Add Source (Voices) - Add source via text lookup in Voices module
 * SHT-004. Add Image - Upload and add an image to the sheet
 * SHT-005. Add YouTube Video - Embed a YouTube video in the sheet
 * SHT-006. Add Source (Library) - Add source from Library reader (absolute Library URL)
 * SHT-007. Publish - Publish sheet with metadata
 * SHT-008. Unpublish - Unpublish the sheet
 * SHT-009. Collections - Create and add sheet to a new collection
 * SHT-010. Delete - Delete the sheet
 *
 * KEY FEATURES:
 * - Serial execution (test.describe.serial) ensures SHT-001 runs first
 * - Each test uses { context } fixture from Playwright
 * - SHT-001 creates ONE sheet with unique timestamp ID
 * - SHT-002 … SHT-010 reuse that same sheet via module-level variables
 * - Uses goToPageWithUser for authenticated navigation
 * - Starts in Voices module (where sheet creation happens)
 * - Extra modal handling after sheet creation
 * - Comprehensive sheet lifecycle coverage
 */
