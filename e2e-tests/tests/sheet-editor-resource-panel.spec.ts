import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { SheetEditorPage } from '../pages/sheetEditorPage';
import { LANGUAGES } from '../globals';

// Resource Panel Test Suite
// Shared variables for all resource panel tests
let browser: Browser;
let context: BrowserContext;
let page: Page;
let sheetEditorPage: SheetEditorPage;
let sheetUrl: string;

// Create the sheet and populate it with content for resource panel testing
test.beforeAll(async ({ browser: testBrowser }) => {
  browser = testBrowser;
  context = await browser.newContext();
  page = await goToPageWithUser(context, '/texts');
  sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
  
  // Create a new sheet
  await page.locator('.myProfileBox .profile-pic').click();
  await page.locator('#new-sheet-link').click();
  await page.waitForURL(/\/sheets\/\d+/);
  sheetUrl = page.url();
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.editTitle('Resource Panel Test Sheet');
});

test.beforeEach(async () => {
  // Ensure clean state for each test
  await page.goto(sheetUrl, { waitUntil: 'networkidle' });
  await hideAllModalsAndPopups(page);
  // Close any open panels from previous tests
  const panelCount = await sheetEditorPage.resourcePanel().count();
  if (panelCount > 0) {
    const closeButton = page.locator('a.readerNavMenuCloseButton.circledX');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
    }
  }
});

test.afterAll(async () => {
  await context.close();
});

// Resource Panel and Text Reader Panel Tests
test('TC031: Click on Title to open Resource Panel - Added Source NOT in focus', async () => {
  await sheetEditorPage.addSampleSource();
  await page.waitForLoadState('networkidle');
  // Wait for the source to be fully loaded and rendered
  await expect(sheetEditorPage.addedSource().first()).toBeVisible();
  await sheetEditorPage.sourceSheetBody().click(); 
  
  // // Wait for the sheet editor's internal state to be ready
  // await page.waitForFunction(() => {
  //   return window.Sefaria && window.Sefaria.track && document.querySelector('.sheetContent');
  // });
  
  await sheetEditorPage.topTitle().click();
  await expect(sheetEditorPage.resourcePanel()).toBeVisible({ timeout: 15000 });
  await expect(sheetEditorPage.resourcePanel()).toContainText('Publish Settings');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Share');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Tools');
});

test('TC032: Click on Title to open Resource Panel - Added Source in focus', async () => {
  // Click on a source to put it in focus
  await sheetEditorPage.addSampleSource();
  await page.waitForLoadState('networkidle');
  const sourceElement = sheetEditorPage.addedSource().first();
  await sourceElement.click();
  await expect(sourceElement).toHaveClass(/selected/);  
  await sheetEditorPage.topTitle().click();
  // Verify expected elements exist in Resource panel when source is in focus
  await expect(sheetEditorPage.resourcePanel()).toBeVisible({ timeout: 15000 });
  await expect(sheetEditorPage.resourcePanel()).toContainText('Publish Settings');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Share');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Tools');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Related Texts');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Resources');
});

test('TC033: Click on sidebar toggle opens resource panel', async () => {
  // Wait for the sidebar toggle to be available
  await expect(sheetEditorPage.sideBarToggleButton()).toBeVisible({ timeout: 10000 });
  await sheetEditorPage.clickSidebarToggle();
  
  // Verify resource panel opens
  await expect(sheetEditorPage.resourcePanel()).toBeVisible({ timeout: 15000 });   
});

test('TC034: Clicking on text does not open resource panel', async () => {
  await sheetEditorPage.addText('This is test text');
  const textElement = await sheetEditorPage.getTextLocator('This is test text');
  await textElement.click();
  // Verify resource panel is not visible
  await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
    await textElement.click({ clickCount: 3 }); // Triple click to select all text
  await page.keyboard.press('Delete');
  await expect(textElement).not.toBeVisible();
});

test('TC035: Clicking on Added Source does not open resource panel', async () => {
  // Click on source
  await sheetEditorPage.addSampleSource();
  const sourceElement = sheetEditorPage.addedSource().first();
  await sourceElement.click();
  // Verify resource panel is not visible
  await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
});

test('TC036: Clicking on Image does not open resource panel', async () => {
  await sheetEditorPage.addSampleImage();
  const imageElement = sheetEditorPage.addedImage().first();
  await imageElement.click();
  await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
});

test('TC037: Clicking on Media does not open resource panel', async () => {
  await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
  const mediaElement = sheetEditorPage.addedYoutube().first();
  await mediaElement.click();
  await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
});

test('TC038: Clicking on [element] does not open resource panel', async () => {
  await sheetEditorPage.sourceSheetBody().click();
  // Verify resource panel is not visible
  await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
});

test('TC039: Click "x" closes Resource Panel', async () => {
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.addSampleSource();
  await page.waitForLoadState('networkidle');
  await expect(sheetEditorPage.addedSource().first()).toBeVisible();
  await sheetEditorPage.sourceSheetBody().click(); 
  await sheetEditorPage.topTitle().click();
  await expect(sheetEditorPage.resourcePanel()).toBeVisible({ timeout: 15000 });
  await page.locator('a.readerNavMenuCloseButton.circledX').click();
  await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
});

test('TC040: Click on Added Source reference link to open Text reader panel', async () => {
  await sheetEditorPage.addSampleSource();
  await page.waitForLoadState('networkidle');
  await expect(sheetEditorPage.sourceReferenceLink()).toBeVisible();
  await sheetEditorPage.sourceReferenceLink().click();
  await page.waitForLoadState('networkidle');
  await expect(sheetEditorPage.textReaderPanel()).toBeVisible();
});

