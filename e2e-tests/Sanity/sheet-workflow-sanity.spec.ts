/**
 * SHEET WORKFLOW SANITY TESTS
 *
 * Tests complete sheet lifecycle: create, edit, add sources, publish, unpublish, collections
 * Uses shared state (one sheet) across all tests for efficiency
 *
 * PRIORITY: Critical - Run before every release
 */

import { test, expect } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, BROWSER_SETTINGS } from '../globals';
import { MODULE_URLS } from '../constants';
import { PageManager } from '../pages/pageManager';
import { SheetEditorPage } from '../pages/sheetEditorPage';

let sheetUrl: string;
let sheetTitle: string;

test.describe.serial('Sheet Workflow Sanity Tests', () => {

  // =================================================================
  // TEST 1: Login and Create Sheet
  // =================================================================
  test('Sanity 8a: Login and create sheet', async ({ context }) => {
    // Start logged in on Voices module (where sheet creation happens)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

    // Create sheet by clicking the Create button in header
    await page.getByRole('button', { name: 'Create' }).first().click();
    await page.waitForURL(/\/sheets\/\d+/);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Wait for sheet editor to load (using modularized selector)
    await page.waitForSelector('.sheetContent', { timeout: 10000 });

    // Store sheet info for subsequent tests
    sheetUrl = page.url();
    sheetTitle = `Test Sheet ${Date.now()}`;

    // Verify sheet created successfully
    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    expect(sheetUrl).toBeTruthy();
    await expect(sheetEditorPage.sourceSheetBody()).toBeVisible({ timeout: 10000 });
  });

  // =================================================================
  // TEST 2: Give Sheet a Title
  // =================================================================
  test('Sanity 8b: Give sheet a title', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    await sheetEditorPage.editTitle(sheetTitle);
    // Need to write something to save title
    await sheetEditorPage.addText("Genesis 1:3");
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000); // Extra wait for auto-save
    await expect(sheetEditorPage.addedSource().first()).toBeVisible();
    await expect(sheetEditorPage.addedSource().first()).toContainText("Genesis 1:3");
    await expect(sheetEditorPage.title()).toContainText(sheetTitle);
  });

  // =================================================================
  // TEST 3: Add Source via Text Lookup (Voices Module)
  // =================================================================
  test('Sanity 8c: Add source using text lookup in Voices', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);
    // We're in Voices module (sheet was created there)
    // Add source via text lookup
    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    // BOOTLEG: Fix because plus button is not on bottom as it should be
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await sheetEditorPage.addSampleSource(); // Genesis 1:1
    await page.waitForTimeout(2000); // Extra wait for auto-save

    await expect(sheetEditorPage.addedSource().last()).toBeVisible();
    await expect(sheetEditorPage.addedSource().last()).toContainText("Genesis 1:1");
  });

  // =================================================================
  // TEST 4: Add Image to Sheet
  // =================================================================
  test('Sanity 8d: Add image to sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);

    // Navigate to end of sheet
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
    }

    // Add image using the sample image method
    await sheetEditorPage.addSampleImage();
    await page.waitForTimeout(2000); // Extra wait for image upload and auto-save

    // Verify image was added
    await expect(sheetEditorPage.addedImage()).toBeVisible();
  });

  // =================================================================
  // TEST 5: Add YouTube Video to Sheet
  // =================================================================
  test('Sanity 8e: Add YouTube video to sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);

    // Navigate to end of sheet
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
    }

    // Add YouTube video
    const youtubeUrl = 'https://youtu.be/oRXVtpUCSGM';
    await sheetEditorPage.addSampleMedia(youtubeUrl);
    await page.waitForTimeout(2000); // Extra wait for video embed and auto-save

    // Verify YouTube video was added
    await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  });

  // =================================================================
  // TEST 6: Add Source from Library Reader
  // =================================================================
  test('Sanity 8f: Add source from Library reader to sheet', async ({ context }) => {
    // Navigate to Library reader
    const page = await goToPageWithUser(context, '/Job.1.2?lang=bi&with=all&lang2=en', BROWSER_SETTINGS.enUser);
    // await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onSourceTextPage().addToSheetViaConnectionsPanel(sheetTitle);

    // Verify added (navigate back to sheet)
    await page.goto(sheetUrl);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);
    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(sheetEditorPage.addedSource().last()).toBeVisible();
    await expect(sheetEditorPage.addedSource().last()).toContainText("Job 1:2");
  });

  // ================================================================
  // TEST 7: Publish Sheet
  // ================================================================
  test('Sanity 8g: Publish sheet with metadata', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

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
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);
    await sheetEditorPage.openOptionsMenu();
    await expect(page.getByText('Unpublish')).toBeVisible();

  });

  // =================================================================
  // TEST 8: Unpublish Sheet
  // =================================================================
  test('Sanity 8h: Unpublish sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    await sheetEditorPage.unpublishSheet();
    await page.waitForLoadState('networkidle');
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
  test('Sanity 8i: Add sheet to a new collection', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

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
  test('Sanity 8j: Delete sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, sheetUrl, BROWSER_SETTINGS.enUser);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

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
 * 10 sanity tests for complete sheet workflow:
 * 8a. Login and Create Sheet - Login to Voices and create sheet with unique ID
 * 8b. Title - Gives sheet a descriptive title
 * 8c. Add Source (Voices) - Add source via text lookup in Voices module
 * 8d. Add Image - Upload and add an image to the sheet
 * 8e. Add YouTube Video - Embed a YouTube video in the sheet
 * 8f. Add Source (Library) - Add source from Library reader
 * 8g. Publish - Publish sheet with metadata
 * 8h. Unpublish - Unpublish the sheet
 * 8i. Collections - Create and add sheet to a new collection
 * 8j. Delete - Delete the sheet
 *
 * KEY FEATURES:
 * - Serial execution (test.describe.serial) ensures Test 8a runs first
 * - Each test uses { context } fixture from Playwright
 * - Test 8a creates ONE sheet with unique timestamp ID
 * - Tests 8b-8j reuse that same sheet via module-level variables
 * - Uses goToPageWithUser for authenticated navigation
 * - Starts in Voices module (where sheet creation happens)
 * - Extra modal handling after sheet creation
 * - Comprehensive sheet lifecycle coverage
 */
