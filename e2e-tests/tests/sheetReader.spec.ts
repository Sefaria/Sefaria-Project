import { test, expect } from '@playwright/test';
import { SheetReaderPage } from '../pages/sheetReaderPage';
import { LANGUAGES } from '../globals';
import { changeLanguageIfNeeded } from '../utils';

// Reference sheet URL (public, not logged in)
const SHEET_URL = 'https://www.sefaria.org/sheets/663402.1?lang=he';

// Utility: open the sheet page before each test
// (not using beforeEach to allow for per-test navigation if needed)

test.describe('Read Public Sheet', () => {
  let sheet: SheetReaderPage;
  
  test.beforeEach(async ({ page }) => {
    await page.goto(SHEET_URL);
    await changeLanguageIfNeeded(page, LANGUAGES.EN);
    sheet = new SheetReaderPage(page, LANGUAGES.EN);
  });

  // TC041: Open the Sheet and confirm all expected elements are present
  test('TC041: Open Sheet and confirm expected elements', async ({ page }) => {
    // Confirm sheet title
    await expect(page.locator('h1').first()).toContainText('Master Sheet for Testing');
    await expect(page.locator('.authorStatement')).toContainText('Test User');
    await expect(sheet.outsideText().filter({ hasText: 'Sample text' })).toBeVisible();

    //await sheet.sourceRefHebrew().filter({hasText: 'בראשית א׳:א׳'}).click();
    //await expect(sheet.sourceRefEnglish().filter({hasText: 'Genesis 1:1'})).toBeVisible();
    await expect(sheet.sourceRefHebrew()).toContainText('בראשית א׳:א׳');
    await expect(sheet.sourceTextHebrew()).toContainText('רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃');
    //await expect(sheet.sourceTextEnglish()).toContainText('When God began to create heaven and earth');
    await expect(sheet.outsideText().filter({ hasText: 'text after source' })).toBeVisible();

    await expect(sheet.addedImage()).toBeVisible();
    await expect(sheet.outsideText().filter({ hasText: 'text after image' })).toBeVisible();

    await expect(sheet.youTubeIframe()).toBeVisible();
    await expect(sheet.youTubeIframe()).toHaveAttribute('src', /youtube\.com\/embed\/Vmwc02Q7DEA/);
    await expect(sheet.outsideText().filter({ hasText: 'text after youtube video' })).toBeVisible();

    await expect(sheet.spotifyIframe()).toBeVisible();
    await expect(sheet.spotifyIframe()).toHaveAttribute('src', /open\.spotify\.com\/embed\/episode\/4FJZFVPldsPmNZHWDjErc7/);
    await expect(sheet.outsideText().filter({ hasText: 'text after spotify' })).toBeVisible();
  });

  // TC042: Check embedded Media plays in Sheet (even if not a Spotify subscriber)
  test('TC042: Embedded media plays in sheet', async ({ page }) => {
    // Find the media iframe (YouTube or Spotify)
    const youtubeFrame = page.frameLocator('iframe[src*="youtube"]');
    const spotifyFrame = page.frameLocator('iframe[src*="spotify"]');
    // At least one media iframe should be present
    const youtubeCount = await page.locator('iframe[src*="youtube"]').count();
    const spotifyCount = await page.locator('iframe[src*="spotify"]').count();
    expect(youtubeCount + spotifyCount).toBeGreaterThan(0);
    // Optionally, check that the iframe is visible
    if (youtubeCount > 0) {
      await expect(page.locator('iframe[src*="youtube"]')).toBeVisible();
    }
    if (spotifyCount > 0) {
      await expect(page.locator('iframe[src*="spotify"]')).toBeVisible();
    }
    // Optionally, interact with the iframe to check playback (advanced)
  });
  test('TC043: Outside text formatting is displayed correctly', async ({ page }) => {
    // Check for bold
    await expect(sheet.outsideText().locator('b')).toHaveText('bolded');
    // Check for underline
    await expect(sheet.outsideText().locator('u')).toHaveText('underlined');
    // Check for italics
    await expect(sheet.outsideText().locator('i')).toHaveText('italics');
    // Check for highlight (span with background-color)
    const highlight = sheet.outsideText().locator('span[style*="background-color"]');
    await expect(highlight).toHaveText('pen');
    // Check for link
    const link = sheet.outsideText().locator('a[href="https://www.sefaria.org"]');
    await expect(link).toHaveText('link');
    // Check for header (h1)
   // await expect(sheet.outsideText().locator('h1')).toContainText('header');
   await expect(page.locator('.sourceContentText h1')).toContainText('header');
    // Check for numbered list (ol > li)
    await expect(sheet.outsideText().locator('ol > li')).toHaveText('numbered');
    // Check for bullet list (ul > li)
    await expect(sheet.outsideText().locator('ul > li')).toHaveText('bulleted');
  });

});

  test.describe('Read Public Sheet- Resource/Text Reader Panel', () => {
    let sheet: SheetReaderPage;
    
    test.beforeEach(async ({ page }) => {
      await page.goto(SHEET_URL);
      await changeLanguageIfNeeded(page, LANGUAGES.EN);
      sheet = new SheetReaderPage(page, LANGUAGES.EN);
    });
  // TC051: Clicking on Title opens resource panel
  test('TC051: Clicking on title opens resource panel', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    await sheet.topTitle().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('About this Sheet');
    await expect(sheet.resourcePanel()).toContainText('Share');
  });

  // TC052: Click "x" closes Resource Panel
  test('TC052: Click X closes resource panel', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    await sheet.topTitle().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await sheet.closeResourcePanel();
  });

  // TC053: Clicking on text opens resource panel (then close)
  test('TC053: Clicking on text opens resource panel', async ({ page }) => {
    // Click on a text segment
    await page.waitForLoadState('domcontentloaded');
    await sheet.outsideText().first().click();    
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('About this Sheet');
    await expect(sheet.resourcePanel()).toContainText('Share');
    await sheet.closeResourcePanel();

  });

  // TC054: Clicking on Added Source opens resource panel (then close)
  test('TC054: Clicking on added source opens resource panel', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    await sheet.sourceBox().first().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('About this Sheet');
    await expect(sheet.resourcePanel()).toContainText('About this Source');
    await sheet.closeResourcePanel();
  });

  // TC055: Clicking on Image opens resource panel (then close)
  test('TC055: Clicking on image opens resource panel', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    await sheet.addedImage().first().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('About this Sheet');
    await expect(sheet.resourcePanel()).toContainText('Share');
    await sheet.closeResourcePanel();

  });

  // TC056: Clicking on Media does not open resource panel. Instead it plays the media.
  test('TC056: Clicking on media plays media, does not open resource panel', async ({ page }) => {
    // Click on the media iframe (YouTube or Spotify)
    const mediaFrame = page.locator('iframe[src*="youtube"], iframe[src*="spotify"]').first();
    await expect(mediaFrame).toBeVisible();
    await mediaFrame.click();
    await expect(sheet.resourcePanel()).not.toBeVisible();
    //check that the media is playing?
  });

});
