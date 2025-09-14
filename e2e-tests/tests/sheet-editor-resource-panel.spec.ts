import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { SheetEditorPage } from '../pages/sheetEditorPage';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';

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
  page = await goToPageWithUser(context, '/texts', BROWSER_SETTINGS.enUser);
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
  // await page.waitForLoadState('networkidle');
  await expect(sheetEditorPage.addedSource().first()).toBeVisible();
  await sheetEditorPage.sourceSheetBody().click(); 
  await page.waitForLoadState('networkidle');
  await hideAllModalsAndPopups(sheetEditorPage.page);
  await sheetEditorPage.topTitle().click();
  await expect(sheetEditorPage.resourcePanel()).toBeVisible({ timeout: 15000 });
  await expect(sheetEditorPage.resourcePanel()).toContainText('Publish Settings');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Share');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Tools');
});

test('TC032: Click on Title to open Resource Panel - Added Source in focus', async () => {
  await sheetEditorPage.addSampleSource();
  //await page.waitForLoadState('networkidle');
  const sourceElement = sheetEditorPage.addedSource().first();
  await sourceElement.click();
  await expect(sourceElement).toHaveClass(/selected/);  
  await page.waitForLoadState('networkidle');
  await sheetEditorPage.topTitle().click();
  await expect(sheetEditorPage.resourcePanel()).toBeVisible({ timeout: 15000 });
  await expect(sheetEditorPage.resourcePanel()).toContainText('Publish Settings');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Share');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Tools');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Related Texts');
  await expect(sheetEditorPage.resourcePanel()).toContainText('Resources');
});

test('TC033: Click on sidebar toggle opens resource panel', async () => {
  await expect(sheetEditorPage.sideBarToggleButton()).toBeVisible({ timeout: 10000 });
  await sheetEditorPage.clickSidebarToggle();
  await expect(sheetEditorPage.resourcePanel()).toBeVisible({ timeout: 15000 });   
});

test('TC034: Clicking on text does not open resource panel', async () => {
  await sheetEditorPage.addText('This is test text');
  const textElement = await sheetEditorPage.getTextLocator('This is test text');
  await textElement.click();
  await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
  await textElement.click({ clickCount: 3 }); 
  await page.keyboard.press('Delete');
  await expect(textElement).not.toBeVisible();
});

test('TC035: Clicking on Added Source does not open resource panel', async () => {
  await sheetEditorPage.addSampleSource();
  const sourceElement = sheetEditorPage.addedSource().first();
  await sourceElement.click();
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

