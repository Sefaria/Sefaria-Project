import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import { goToPageWithUser, getTestImagePath, hideAllModalsAndPopups } from '../utils';
import { PageManager } from '../pages/pageManager';
import { SheetEditorPage } from '../pages/sheetEditorPage';
import { LANGUAGES } from '../globals';
import { SaveStates } from '../constants';

// Sheet Editor Test Suite - Hybrid Pattern
let browser: Browser;
let context: BrowserContext;
let page: Page;
let pageManager: PageManager;
let sheetEditorPage: SheetEditorPage;
let sheetUrl: string;

// Create the sheet and store the URL in beforeAll
// All other tests will navigate to this URL before running

test.beforeAll(async ({ browser: testBrowser }) => {
  browser = testBrowser;
  context = await browser.newContext();
  page = await goToPageWithUser(context, '/texts');
  sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
  await page.getByRole('link', { name: 'TU' , exact: true}).click();
  await hideAllModalsAndPopups(page);
  await page.getByRole('link', { name: 'Create a New Sheet' }).click();
  await page.waitForURL(/\/sheets\/\d+/);
  sheetUrl = page.url();
});

test.afterAll(async () => {
  await context.close();
});

test('TC001: Create Sheet', async () => {
  // This test is now just a check that the sheet was created in beforeAll
  expect(sheetUrl).toBeTruthy();
  await expect(sheetEditorPage.sourceSheetBody()).toBeVisible();
  await page.pause();
});

test('TC002: Give Sheet Title', async () => {
  await page.goto(sheetUrl);
  await sheetEditorPage.editTitle('Test Sheet Title');
  await expect(sheetEditorPage.title()).toContainText('Test Sheet Title');
  await sheetEditorPage.assertSaveState(SaveStates.saved);
});

test('TC003: Add Text', async () => {
  await page.goto(sheetUrl);
  // await sheetEditorPage.clickAddText();
  // await sheetEditorPage.addText('This is test text');
  await sheetEditorPage.addText('This is test text');
  const textLocator = await sheetEditorPage.getTextLocator('This is test text');
  await expect(textLocator).toBeVisible();
  //await sheetEditorPage.assertSaveState(SaveStates.saved);
});

test('TC004: Add Source (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  //await page.keyboard.press('ArrowDown');
  await sheetEditorPage.goToNewLineAtBottom();
  await sheetEditorPage.addSampleSource();
  await expect(sheetEditorPage.addedSource()).toBeVisible();
  await sheetEditorPage.addTextBelow('Text after source');
  const textLocator = await sheetEditorPage.getTextLocator('Text after source');
  await expect(textLocator).toBeVisible();
  //await sheetEditorPage.assertSaveState(SaveStates.saved);

});

test('TC005: Add Media - Youtube (followed by text)', async () => {
  await page.goto(sheetUrl);
  //await page.keyboard.press('ArrowDown');  await sheetEditorPage.goToNewLineAtBottom();
  await sheetEditorPage.goToNewLineAtBottom();
  await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
  await sheetEditorPage.addTextBelow('Text after YouTube');
  const textLocator = await sheetEditorPage.getTextLocator('Text after YouTube');
  await expect(textLocator).toBeVisible();
});

test('TC006: Add Media - Spotify (followed by text)', async () => {
  await page.goto(sheetUrl);
  //await page.keyboard.press('ArrowDown');
  await sheetEditorPage.goToNewLineAtBottom();
  await sheetEditorPage.addSampleMedia('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
  await sheetEditorPage.addTextBelow('Text after Spotify');
  const textLocator = await sheetEditorPage.getTextLocator('Text after Spotify');
  await expect(textLocator).toBeVisible();
});


test('TC007: Add Image (followed by text)', async () => {
  await page.goto(sheetUrl);
  //await page.keyboard.press('ArrowDown');
  await sheetEditorPage.goToNewLineAtBottom();
  await sheetEditorPage.addSampleImage();
  await sheetEditorPage.addTextBelow('Text after image');
  const textLocator = await sheetEditorPage.getTextLocator('Text after image');
  await expect(textLocator).toBeVisible();
  //await sheetEditorPage.assertSaveState(SaveStates.saved);
});

test('TC008: Drag and Drop Text', async () => {
  await page.goto(sheetUrl);
  // First click to select/highlight the element
  // const sourceElement = page.locator('.text-segment').first();
  // await sourceElement.click();
  
  // // Wait for highlight/selection state
  // await expect(sourceElement).toHaveClass(/selected|highlighted/);
  
  // // Drag to target position
  // const targetElement = page.locator('.text-segment').nth(2);
  // await sourceElement.dragTo(targetElement);
  
  // // Verify the element moved
  // await expect(page.locator('.text-segment').nth(2)).toContainText('expected text');
});

// test('TC009: Drag and Drop Added Source', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.source-segment')).toBeVisible();
// });

// test('TC010: Drag and Drop Added Image', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.image-segment')).toBeVisible();
// });

// test('TC011: Drag and Drop Added Media', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.media-segment')).toBeVisible();
// });

// test('TC012: Edit inside an Added Source', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.source-segment')).toBeVisible();
// });

// test('TC013: Delete Text', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.text-segment')).toBeVisible();
// });

// test('TC014: Delete Added Source', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.source-segment')).toBeVisible();
// });

// test('TC015: Delete Added Image', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.image-segment')).toBeVisible();
// });

// test('TC016: Delete Added Media', async () => {
//   await page.goto(sheetUrl);
//   await expect(page.locator('.media-segment')).toBeVisible();
// });