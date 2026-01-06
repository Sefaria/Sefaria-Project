import { test, expect } from '@playwright/test';
import { SheetReaderPage } from '../pages/sheetReaderPage';
import { LANGUAGES } from '../globals';
import { changeLanguage, hideAllModalsAndPopups } from '../utils';

// Reference sheet URL (public, not logged in)
const SHEET_URL = 'https://www.sefaria.org/sheets/663402.1?';

test.describe('Read Public Sheet', () => {
  let sheet: SheetReaderPage;
  
  test.beforeEach(async ({ page }) => {
    await page.goto(SHEET_URL);
    sheet = new SheetReaderPage(page, LANGUAGES.EN);
  });

  test('TC041: Open Sheet and confirm expected elements', async ({ page }) => {
    await hideAllModalsAndPopups(page);
    await expect(page.locator('h1').first()).toContainText('Master Sheet for Testing');
    await expect(page.locator('.authorStatement')).toContainText('Test User');
    await expect(sheet.outsideText().filter({ hasText: 'Sample text' })).toBeVisible();
    await expect(sheet.sourceRefHebrew()).toContainText('בראשית א׳:א׳');
    await expect(sheet.sourceTextHebrew()).toContainText('רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃');
    await expect(sheet.outsideText().filter({ hasText: 'text after source' })).toBeVisible();
    await expect(sheet.addedImage()).toBeVisible();
    await expect(sheet.outsideText().filter({ hasText: 'text after image' })).toBeVisible();
    await expect(sheet.youTubeIframeElement()).toBeVisible();
    await expect(sheet.youTubeIframeElement()).toHaveAttribute('src', /youtube\.com\/embed\/Vmwc02Q7DEA/);
    await expect(sheet.outsideText().filter({ hasText: 'text after youtube video' })).toBeVisible();
    await expect(sheet.spotifyIframeElement()).toBeVisible();
    await expect(sheet.spotifyIframeElement()).toHaveAttribute('src', /open\.spotify\.com\/embed\/episode\/4FJZFVPldsPmNZHWDjErc7/);
    await expect(sheet.outsideText().filter({ hasText: 'text after spotify' })).toBeVisible();
  });

  test('TC042-A: Embedded YouTube media is present and can be played', async ({ page }) => {
    //await page.goto(SHEET_URL);
    await expect(sheet.youTubeIframe).toBeDefined();
    await hideAllModalsAndPopups(page);
    if (await sheet.youTubeLargePlayButton().isVisible()) {
        await sheet.youTubeLargePlayButton().click();
      } 
    });

    test('TC042-B: Embedded Spotify media is present and can be played', async ({ page }) => {
       // await page.goto(SHEET_URL)
        await hideAllModalsAndPopups(page);
        await expect(sheet.spotifyIframe()).toBeDefined();
        await expect(sheet.spotifyPlayPauseButton()).toBeVisible();
        await sheet.spotifyPlayPauseButton().click();
        await expect(sheet.spotifyPlayPauseButton()).toHaveAttribute('aria-label', 'Pause');  
    });
  
  test('TC043: Outside text formatting is displayed correctly', async ({ page }) => {
    await hideAllModalsAndPopups(page);
    await expect(sheet.outsideText().locator('b')).toHaveText('bolded');
    await expect(sheet.outsideText().locator('u')).toHaveText('underlined');
    await expect(sheet.outsideText().locator('i')).toHaveText('italics');
    const highlight = sheet.outsideText().locator('span[style*="background-color"]');
    await expect(highlight).toHaveText('pen');
    const link = sheet.outsideText().locator('a[href*="sefaria.org"]');
    await expect(link).toHaveText('link');
    await expect(page.locator('.sourceContentText h1')).toContainText('header');
    await expect(sheet.outsideText().locator('ol > li')).toHaveText('numbered');
    await expect(sheet.outsideText().locator('ul > li')).toHaveText('bulleted');
  });

});

test.describe('Read Public Sheet- Resource/Text Reader Panel', () => {
  let sheet: SheetReaderPage;
  
  test.beforeEach(async ({ page }) => {
    await page.goto(SHEET_URL);
    await changeLanguage(page, LANGUAGES.EN);
    sheet = new SheetReaderPage(page, LANGUAGES.EN);
  });

  test('TC051: Clicking on title opens resource panel', async ({ page }) => {
    //await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    await sheet.topTitle().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('Tools');
    await expect(sheet.resourcePanel()).toContainText('Share');
  });

  test('TC052: Click X closes resource panel', async ({ page }) => {
    //await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    await sheet.topTitle().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await sheet.closeResourcePanel();
  });

  test('TC053: Clicking on text opens resource panel', async ({ page }) => {
   // await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    await sheet.outsideText().first().click();    
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('Tools');
    await expect(sheet.resourcePanel()).toContainText('Share');
    await sheet.closeResourcePanel();

  });

  test('TC054: Clicking on added source opens resource panel', async ({ page }) => {
    //await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    await sheet.sourceBox().first().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('About this Sheet');
    await expect(sheet.resourcePanel()).toContainText('Tools');
    await expect(sheet.resourcePanel()).toContainText('Resources');
    await expect(sheet.resourcePanel()).toContainText('About this Source');
    await sheet.closeResourcePanel();
  });

  test('TC055: Clicking on image opens resource panel', async ({ page }) => {
   // await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    await sheet.addedImage().first().click();
    await expect(sheet.resourcePanel()).toBeVisible();
    await expect(sheet.resourcePanel()).toContainText('Tools');
    await expect(sheet.resourcePanel()).toContainText('Share');
    await sheet.closeResourcePanel();

  });

  test('TC056: Clicking on media plays media, does not open resource panel', async ({ page }) => {
    await hideAllModalsAndPopups(page);
    const mediaFrame = page.locator('iframe[src*="youtube"], iframe[src*="spotify"]').first();
    await expect(mediaFrame).toBeVisible();
    await mediaFrame.click();
    await expect(sheet.resourcePanel()).not.toBeVisible();
  });

});
