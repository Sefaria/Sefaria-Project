import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { SheetEditorPage } from '../pages/sheetEditorPage';
import { LANGUAGES } from '../globals';
import { SaveStates } from '../constants';

// Sheet Editor Test Suite - Hybrid Pattern
// Shared variables for all test groups
let browser: Browser;
let context: BrowserContext;
let page: Page;
let sheetEditorPage: SheetEditorPage;
let sheetUrl: string;

// Create the sheet and store the URL in beforeAll - shared across all test groups
test.beforeAll(async ({ browser: testBrowser }) => {
  browser = testBrowser;
  context = await browser.newContext();
  page = await goToPageWithUser(context, '/texts');
  sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
  await hideAllModalsAndPopups(page);
  // Open profile dropdown menu and click "Create a New Sheet"
  await page.locator('.myProfileBox .profile-pic').click();
  await page.locator('#new-sheet-link').click();
  await page.waitForURL(/\/sheets\/\d+/);
  sheetUrl = page.url();
});

test.afterAll(async () => {
  await context.close();
});

// Create and Edit Sheet Tests
test.describe('Create and Edit Sheet', () => {

test('TC001: Create Sheet', async () => {
  expect(sheetUrl).toBeTruthy();
  await expect(sheetEditorPage.sourceSheetBody()).toBeVisible();
  await page.pause();
});

test('TC002: Give Sheet Title', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.editTitle('Test Sheet Title');
  await expect(sheetEditorPage.title()).toContainText('Test Sheet Title');
  await sheetEditorPage.assertSaveState(SaveStates.saved);
});

test('TC003: Add Text', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.addText('This is test text');
  const textLocator = await sheetEditorPage.getTextLocator('This is test text');
  await expect(textLocator).toBeVisible();
});

test('TC004: Add Source (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await page.keyboard.press('ArrowDown');
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addSampleSource();
  await expect(sheetEditorPage.addedSource()).toBeVisible();
  await sheetEditorPage.addTextBelow('Text after source');
  const textLocator = await sheetEditorPage.getTextLocator('Text after source');
  await expect(textLocator).toBeVisible();

});

test('TC005: Add Media - Spotify (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await page.keyboard.press('ArrowDown');
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addSampleMedia('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
  await expect(sheetEditorPage.addedSpotify()).toBeVisible();
  await sheetEditorPage.addTextBelow('Text after Spotify');
  const textLocator = await sheetEditorPage.getTextLocator('Text after Spotify');
  await expect(textLocator).toBeVisible();
});

test('TC006: Add Media - Youtube (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await page.keyboard.press('ArrowDown');
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
  await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  await sheetEditorPage.addTextBelow('Text after YouTube');
  const textLocator = await sheetEditorPage.getTextLocator('Text after YouTube');
  await expect(textLocator).toBeVisible();
});


test('TC007: Add Image (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await page.keyboard.press('ArrowDown');
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addSampleImage();
  await sheetEditorPage.addTextBelow('Text after image');
  const textLocator = await sheetEditorPage.getTextLocator('Text after image');
  await expect(textLocator).toBeVisible();
  //await sheetEditorPage.assertSaveState(SaveStates.saved);
});

/**
 * Editor drag and drop tests have been moved to file editor-drag-and-drop.spec.ts, to be worked on at a later point
 */

test('TC012: Edit inside an Added Source', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  
  // Check if source exists, if not add one
  const sourceCount = await sheetEditorPage.addedSource().count();
  if (sourceCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleSource();
    await expect(sheetEditorPage.addedSource()).toBeVisible();
  }
  const sourceElement = sheetEditorPage.addedSource().last();
  await expect(sourceElement).toBeVisible();

  const originalSourceText = await sourceElement.textContent();

  await sourceElement.click();
  await expect(sourceElement).toHaveClass(/selected/);
  
  const englishSection = sourceElement.locator('.en');
  await englishSection.click();
  
  const textContent = englishSection.locator('.sourceContentText span[data-slate-string="true"]').filter({ hasNotText: /^\(\d+\)$/ }).first();
  
  // Triple-click to select the entire line/paragraph of text within the source
  await textContent.click({ clickCount: 3 });
  await page.keyboard.type('This source has been edited');
  
  const finalSourceText = await sourceElement.textContent();
  expect(finalSourceText).toContain('This source has been edited');
  expect(finalSourceText).not.toBe(originalSourceText);
});

test('TC013: Delete Text', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  
  // Check if text exists, if not add one
  const textSegments = page.locator('.text-segment');
  const textCount = await textSegments.count();
  
  if (textCount === 0) {
    // No text exists, add one
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addText('Text to be deleted');
    const textLocator = await sheetEditorPage.getTextLocator('Text to be deleted');
    await expect(textLocator).toBeVisible();
  } else {
    // Text exists, delete it
    const textElement = textSegments.first();
    await textElement.click({ clickCount: 3 }); // Triple-click to select all text
    await page.keyboard.press('Delete');
    
    // Verify text was deleted
    const remainingTextCount = await textSegments.count();
    expect(remainingTextCount).toBeLessThan(textCount);
  }
});

test('TC014: Delete Added Source', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  
  // Check if source exists, if not add one
  const sourceCount = await sheetEditorPage.addedSource().count();
  
  if (sourceCount === 0) {
    // No source exists, add one
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleSource();
    await expect(sheetEditorPage.addedSource()).toBeVisible();
  } else {
    // Source exists, delete it
    const sourceElement = sheetEditorPage.addedSource().first();
    await sourceElement.click(); // Click to select the source
    await expect(sourceElement).toHaveClass(/selected/);
    await page.keyboard.press('Delete'); // Press delete to remove it
    
    // Verify source was deleted
    const remainingSourceCount = await sheetEditorPage.addedSource().count();
    expect(remainingSourceCount).toBeLessThan(sourceCount);
  }
});

test('TC015: Delete Added Image', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  
  // Check if image exists, if not add one
  const imageCount = await sheetEditorPage.addedImage().count();
  
  if (imageCount === 0) {
    // No image exists, add one
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleImage();
    await expect(sheetEditorPage.addedImage()).toBeVisible();
  } else {
    // Image exists, delete it
    const imageElement = sheetEditorPage.addedImage().first();
    await imageElement.click(); // Click to select the image
    await page.keyboard.press('Delete'); // Press delete to remove it
    
    // Verify image was deleted
    const remainingImageCount = await sheetEditorPage.addedImage().count();
    expect(remainingImageCount).toBeLessThan(imageCount);
  }
});

test('TC016a: Delete Added YouTube Media', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  
  // Check if YouTube media exists
  const youtubeCount = await sheetEditorPage.addedYoutube().count();
  
  if (youtubeCount === 0) {
    // No YouTube exists, add one
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
    await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  } else {
    // YouTube exists, delete it
    const youtubeElement = sheetEditorPage.addedYoutube().first();
    await youtubeElement.click(); // Click to select the media
    await page.keyboard.press('Delete'); // Press delete to remove it
    
    // Verify YouTube was deleted
    const remainingYoutubeCount = await sheetEditorPage.addedYoutube().count();
    expect(remainingYoutubeCount).toBeLessThan(youtubeCount);
  }
});

test('TC016b: Delete Added Spotify Media', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  
  // Check if Spotify media exists
  const spotifyCount = await sheetEditorPage.addedSpotify().count();
  
  if (spotifyCount === 0) {
    // No Spotify exists, add one
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleMedia('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
    await expect(sheetEditorPage.addedSpotify()).toBeVisible();
  } else {
    // Spotify exists, delete it
    const spotifyElement = sheetEditorPage.addedSpotify().first();
    await spotifyElement.click(); // Click to select the media
    await page.keyboard.press('Delete'); // Press delete to remove it
    
    // Verify Spotify was deleted
    const remainingSpotifyCount = await sheetEditorPage.addedSpotify().count();
    expect(remainingSpotifyCount).toBeLessThan(spotifyCount);
  }
});

test('TC017: Click "X" and confirm sheet now appears in Account Profile', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  
  // Close the sheet editor
  await sheetEditorPage.closeSheetEditor();
  
  // Navigate to account profile to verify sheet appears there
  await page.locator('.myProfileBox .profile-pic').click();
  await page.locator('#my-profile-link').click();
  
  // Wait for profile page to load
  await page.waitForURL(/\/my\/profile/);
  
  // Verify we're on the profile page
  await expect(page).toHaveURL(/\/my\/profile/);
  
  // Look for the sheet in the profile - sheets are typically shown with their titles
  const sheetTitle = 'Test Sheet Title'; // This matches the title set in TC002
  const sheetLink = page.locator(`a:has-text("${sheetTitle}")`);
  
  // Verify the sheet appears in the profile
  await expect(sheetLink).toBeVisible();
});

}); // End of Create and Edit Sheet describe group





