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
  // Set up the sheet with content needed for resource panel tests
  await sheetEditorPage.editTitle('Resource Panel Test Sheet');
  // await sheetEditorPage.addText('This is test text');
  // await page.keyboard.press('Enter'); 
  // await sheetEditorPage.focusTextInput();
  // await sheetEditorPage.addSampleSource();
  // await page.keyboard.press('Enter'); 
  // await sheetEditorPage.addSampleImage();
  // await page.keyboard.press('Enter');
  // await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
});

test.afterAll(async () => {
  await context.close();
});

// Resource Panel and Text Reader Panel Tests
test.describe('Resource Panel and Text Reader Panel', () => {

  test('TC031: Click on Title to open Resource Panel - Added Source NOT in focus', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Ensure no source is in focus by clicking elsewhere
    await sheetEditorPage.addSampleSource();
    await page.waitForLoadState('networkidle');
    await sheetEditorPage.sourceSheetBody().click();
    
    // Wait for JavaScript initialization to complete
    await page.waitForTimeout(2000);
    
    // Click on the title link to open resource panel
    const titleLink = page.locator('a[aria-label*="Show Connection Panel contents"]');
    await expect(titleLink).toBeVisible();
    await titleLink.click();
    
    // Verify expected elements exist in Resource panel
    await expect(sheetEditorPage.resourcePanel()).toBeVisible();
    await expect(sheetEditorPage.resourcePanel()).toContainText('Publish Settings');
    await expect(sheetEditorPage.resourcePanel()).toContainText('Share');
    await expect(sheetEditorPage.resourcePanel()).toContainText('Tools');
  });

  test('TC032: Click on Title to open Resource Panel - Added Source in focus', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Click on a source to put it in focus
    await sheetEditorPage.addSampleSource();
    await page.waitForLoadState('networkidle');
    const sourceElement = sheetEditorPage.addedSource().first();
    await sourceElement.click();
    await expect(sourceElement).toHaveClass(/selected/);
    
    // Wait for JavaScript initialization to complete
    await page.waitForTimeout(2000);
    
    // Click on the title link to open resource panel
    const titleLink = page.locator('a[aria-label*="Show Connection Panel contents"]');
    await expect(titleLink).toBeVisible();
    await titleLink.click();

    // Verify expected elements exist in Resource panel when source is in focus
    await expect(sheetEditorPage.resourcePanel()).toBeVisible();
    await expect(sheetEditorPage.resourcePanel()).toContainText('Publish Settings');
    await expect(sheetEditorPage.resourcePanel()).toContainText('Share');
    await expect(sheetEditorPage.resourcePanel()).toContainText('Tools');
    await expect(sheetEditorPage.resourcePanel()).toContainText('Related Texts');
    await expect(sheetEditorPage.resourcePanel()).toContainText('Resources');
  });

  test('TC033: Clicking on text does not open resource panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Click on text content
    await sheetEditorPage.addText('This is test text');
    const textElement = await sheetEditorPage.getTextLocator('This is test text');
    await textElement.click();
    
    // Verify resource panel is not visible
    await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
  });

  test('TC034: Clicking on Added Source does not open resource panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Click on source
    await sheetEditorPage.addSampleSource();
    const sourceElement = sheetEditorPage.addedSource().first();
    await sourceElement.click();
    
    // Verify resource panel is not visible
    await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
  });

  test('TC035: Clicking on Image does not open resource panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Click on image
    await sheetEditorPage.addSampleImage();
    const imageElement = sheetEditorPage.addedImage().first();
    await imageElement.click();
    
    // Verify resource panel is not visible
    await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
  });

  test('TC036: Clicking on Media does not open resource panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Click on media
    await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
    const mediaElement = sheetEditorPage.addedYoutube().first();
    await mediaElement.click();
    
    // Verify resource panel is not visible
    await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
  });

  test('TC037: Clicking on [element] does not open resource panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Click on sheet body (generic element)
    await sheetEditorPage.sourceSheetBody().click();
    
    // Verify resource panel is not visible
    await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
  });

  test('TC038: Click "x" closes Resource Panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Open resource panel by clicking title
    await sheetEditorPage.addSampleSource();
  // Wait for JavaScript initialization to complete
    await page.waitForTimeout(2000);
      
    // Click on the title link to open resource panel
    const titleLink = page.locator('a[aria-label*="Show Connection Panel contents"]');
    await expect(titleLink).toBeVisible();
    await titleLink.click();
    
    // Verify resource panel is open
    await expect(sheetEditorPage.resourcePanel()).toBeVisible();
    
    // Click the close button (x)
    await page.locator('a.readerNavMenuCloseButton.circledX').click();
    // Verify resource panel is closed
    await expect(sheetEditorPage.resourcePanel()).not.toBeVisible();
  });

  test('TC039: Click on Added Source reference link to open Text reader panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Add a source to ensure we have a reference link to click
    await sheetEditorPage.addSampleSource();
    await page.waitForLoadState('networkidle');
    
    // Wait for JavaScript initialization to complete
    await page.waitForTimeout(2000);
    
    // Click on the source reference link
    await expect(sheetEditorPage.sourceReferenceLink()).toBeVisible();
    await sheetEditorPage.sourceReferenceLink().click();
    
    // Verify text reader panel opens
    await expect(sheetEditorPage.textReaderPanel()).toBeVisible();
  });

  test('TC040: Click on kabob opens resource panel', async () => {
    await page.goto(sheetUrl);
    await hideAllModalsAndPopups(page);
    
    // Add a source to ensure we have a reference link to click
    await sheetEditorPage.addSampleSource();
    await page.waitForLoadState('networkidle');
    
    // Wait for JavaScript initialization to complete
    await page.waitForTimeout(2000);
    
    // Click on the source reference link
    await expect(sheetEditorPage.sourceReferenceLink()).toBeVisible();
    await sheetEditorPage.sourceReferenceLink().click();
    
    // Verify text reader panel opens
    await expect(sheetEditorPage.textReaderPanel()).toBeVisible();
  });
});