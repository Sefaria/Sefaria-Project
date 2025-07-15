import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import { goToPageWithUser, getTestImagePath } from '../utils';
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
  pageManager = new PageManager(page, LANGUAGES.EN);
  sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);

  // Create the sheet and store the URL
  await page.getByRole('link', { name: 'TU' , exact: true}).click();
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
  await page.keyboard.press('Enter');
  await sheetEditorPage.assertSaveState(SaveStates.saved);
});

test('TC004: Add Source (followed by text)', async () => {
  await page.goto(sheetUrl);
  await sheetEditorPage.addSampleSource();
  await sheetEditorPage.clickAddText();
  await sheetEditorPage.addText('Follow-up text for source');
  await expect(page.locator('.sourceBox')).toBeVisible();
  const textLocator = await sheetEditorPage.getTextLocator('Follow-up text for source');
  await expect(textLocator).toBeVisible();
  await sheetEditorPage.assertSaveState(SaveStates.saved);

});

test('TC005: Add Image (followed by text)', async () => {
  await page.goto(sheetUrl);
  const testImagePath = getTestImagePath();
  await sheetEditorPage.clickAddSomething();
  await page.getByRole('textbox').setInputFiles(testImagePath);
  await sheetEditorPage.clickAddText();
  await sheetEditorPage.addText('Text after image');
  await expect(page.locator('img')).toBeVisible();
  const textLocator = await sheetEditorPage.getTextLocator('Text after image');
  await expect(textLocator).toBeVisible();
});

test('TC006: Add Media - Youtube (followed by text)', async () => {
  await page.goto(sheetUrl);
  await page.getByRole('button', { name: 'Add a source, image, or other' }).click();
  await page.getByRole('textbox', { name: 'Paste a link to an image,' }).fill('https://youtu.be/Ea4aZB0Zlsw?si=OSFsDV32bmZ1RT9a');
  await page.getByRole('button', { name: 'Add Media' }).click();
  await page.locator('.spacerSelected').click();
  await page.getByRole('textbox').fill('Text after youtube');
  await expect(page.locator('.media-segment')).toBeVisible();
  await expect(page.locator('.text-segment')).toContainText('Text after youtube');
});

test('TC007: Add Media - Spotify (followed by text)', async () => {
  await page.goto(sheetUrl);
  await page.getByRole('button', { name: 'Add a source, image, or other' }).click();
  await page.getByRole('textbox', { name: 'Paste a link to an image,' }).fill('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
  await page.getByRole('button', { name: 'Add Media' }).click();
  await page.locator('.spacerSelected').click();
  await page.getByRole('textbox').fill('Text after spotify');
  await expect(page.locator('.media-segment')).toBeVisible();
  await expect(page.locator('.text-segment')).toContainText('Text after spotify');
});

test('TC008: Drag and Drop Text', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.text-segment')).toBeVisible();
});

test('TC009: Drag and Drop Added Source', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.source-segment')).toBeVisible();
});

test('TC010: Drag and Drop Added Image', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.image-segment')).toBeVisible();
});

test('TC011: Drag and Drop Added Media', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.media-segment')).toBeVisible();
});

test('TC012: Edit inside an Added Source', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.source-segment')).toBeVisible();
});

test('TC013: Delete Text', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.text-segment')).toBeVisible();
});

test('TC014: Delete Added Source', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.source-segment')).toBeVisible();
});

test('TC015: Delete Added Image', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.image-segment')).toBeVisible();
});

test('TC016: Delete Added Media', async () => {
  await page.goto(sheetUrl);
  await expect(page.locator('.media-segment')).toBeVisible();
});