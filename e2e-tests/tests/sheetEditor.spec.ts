import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { SheetEditorPage } from '../pages/sheetEditorPage';
import { LANGUAGES } from '../globals';
import { SaveStates } from '../constants';
import { time } from 'console';

let browser: Browser;
let context: BrowserContext;
let page: Page;
let sheetEditorPage: SheetEditorPage;
let sheetUrl: string;

test.beforeAll(async ({ browser: testBrowser }) => {
  browser = testBrowser;
  context = await browser.newContext();
  page = await goToPageWithUser(context, '/texts');
  sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
  await hideAllModalsAndPopups(page);
  await page.locator('.myProfileBox .profile-pic').click();
  await page.locator('#new-sheet-link').click();
  await page.waitForURL(/\/sheets\/\d+/);
  sheetUrl = page.url();
});

test.afterAll(async () => {
  await context.close();
});

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

test('TC004: Format text', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.addText('format');
  await page.getByText('format').dblclick();
  await sheetEditorPage.makeTextHeadingButton().click();
  await sheetEditorPage.makeNumberedListButton().click();
  await sheetEditorPage.makeBulletedListButton().click();
  await sheetEditorPage.boldTextButton().click();
  await sheetEditorPage.italicTextButton().click();
  await sheetEditorPage.highlightTextButton().click();
  await sheetEditorPage.highlightTextButton().click();
  await sheetEditorPage.underlineTextButton().click();
  await sheetEditorPage.makeTextLinkButton().click();
  await page.getByRole('textbox', { name: 'Enter link URL' }).fill('www.sefaria.org');

});


test('TC005: Add Image (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addSampleImage();
  await sheetEditorPage.addText('Text after image');
  const textLocator = await sheetEditorPage.getTextLocator('Text after image');
  await expect(textLocator).toBeVisible();
});

test('TC006: Add Source (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.addSampleSource();
  await expect(sheetEditorPage.addedSource()).toBeVisible();
  await sheetEditorPage.addText('Text after source');
  const textLocator = await sheetEditorPage.getTextLocator('Text after source');
  await expect(textLocator).toBeVisible();

});

test('TC007: Format Source Text', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.addSampleSource();
  await expect(sheetEditorPage.addedSource()).toBeVisible();
  await sheetEditorPage.sourceSheetBody().click();
  await page.getByText('בָּרָ֣א').dblclick();
  await sheetEditorPage.boldSourceTextButton().click();
  await sheetEditorPage.underlineSourceTextButton().click();
  await sheetEditorPage.highlightSourceTextButton().click();
  await page.locator('.highlightButton').first().click();
  await sheetEditorPage.italicSourceTextButton().click();
});

test('TC008: Edit inside an Added Source', async () => {
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
  await textContent.click({ clickCount: 3 });
  await page.keyboard.type('This source has been edited');
  
  const finalSourceText = await sourceElement.textContent();
  expect(finalSourceText).toContain('This source has been edited');
  expect(finalSourceText).not.toBe(originalSourceText);
});

test('TC009: Add Media - Spotify (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.addSampleMedia('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
  await expect(sheetEditorPage.addedSpotify()).toBeVisible();
  await sheetEditorPage.addText('Text after Spotify');
  const textLocator = await sheetEditorPage.getTextLocator('Text after Spotify');
  await expect(textLocator).toBeVisible();
});

test('TC010: Add Media - Youtube (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
  await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  // Wait for YouTube iframe to be fully loaded and stable
  await expect(sheetEditorPage.addedYoutube().locator('iframe')).toBeVisible();
  await page.keyboard.press('Enter');   
  await sheetEditorPage.addText('Text after YouTube');
  const textLocator = await sheetEditorPage.getTextLocator('Text after YouTube');
  await expect(textLocator).toBeVisible();
});

test('TC011: Delete Text', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addText('Text to be deleted');
  const textLocator = await sheetEditorPage.getTextLocator('Text to be deleted');
  await expect(textLocator).toBeVisible();
  await textLocator.click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  await expect(textLocator).not.toBeVisible();
});

test('TC012: Delete Added Source', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addSampleSource();
  await expect(sheetEditorPage.addedSource()).toBeVisible();
  const initialCount = await sheetEditorPage.addedSource().count();
  const sourceElement = sheetEditorPage.addedSource().last();
  await sourceElement.click();
  await expect(sourceElement).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  const finalCount = await sheetEditorPage.addedSource().count();
  expect(finalCount).toBeLessThan(initialCount);
});

test('TC013: Delete Added Image', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const imageCount = await sheetEditorPage.addedImage().count();
  if (imageCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleImage();
    await expect(sheetEditorPage.addedImage()).toBeVisible();
  } else {
    const imageElement = sheetEditorPage.addedImage().first();
    await imageElement.click(); // Click to select the image
    await page.keyboard.press('Delete'); // Press delete to remove it
    const remainingImageCount = await sheetEditorPage.addedImage().count();
    expect(remainingImageCount).toBeLessThan(imageCount);
  }
});

test('TC014a: Delete Added YouTube Media', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const youtubeCount = await sheetEditorPage.addedYoutube().count();
  if (youtubeCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
    await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  } else {
    const youtubeElement = sheetEditorPage.addedYoutube().first();
    await youtubeElement.click(); 
    await page.keyboard.press('Delete');
    const remainingYoutubeCount = await sheetEditorPage.addedYoutube().count();
    expect(remainingYoutubeCount).toBeLessThan(youtubeCount);
  }
});

test('TC014b: Delete Added Spotify Media', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const spotifyCount = await sheetEditorPage.addedSpotify().count();
  if (spotifyCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleMedia('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
    await expect(sheetEditorPage.addedSpotify()).toBeVisible();
  } else {
    const spotifyElement = sheetEditorPage.addedSpotify().first();
    await spotifyElement.click(); 
    await page.keyboard.press('Delete');
    const remainingSpotifyCount = await sheetEditorPage.addedSpotify().count();
    expect(remainingSpotifyCount).toBeLessThan(spotifyCount);
  }
});

test('TC015: Click "X" and confirm sheet now appears in Account Profile', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.editTitle('Test Sheet Title');
  await sheetEditorPage.addText('test saved upon exit');
  await sheetEditorPage.closeSheetEditor();
  await page.locator('.myProfileBox .profile-pic').click();
  await page.locator('#my-profile-link').click();  
  await page.waitForURL(/\/profile/);
  expect(page.url()).toContain('/profile');
  const sheetTitle = 'Test Sheet Title';
  const sheetLink = page.locator(`a.sheetTitle:has-text("${sheetTitle}")`).first();
  await expect(sheetLink).toBeVisible();
});

test('TC016: Manually delete sheet from account profile', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const uniqueTitle = `Delete Test Sheet ${Date.now()}`;
  await sheetEditorPage.editTitle(uniqueTitle);
  await sheetEditorPage.addText('This sheet will be deleted');
  await sheetEditorPage.closeSheetEditor();
  await page.locator('.myProfileBox .profile-pic').click();
  await page.locator('#my-profile-link').click();
  await page.waitForURL(/\/profile/);
  const sheetRow = page.locator('.sheet').filter({ has: page.locator(`a.sheetTitle:has-text("${uniqueTitle}")`) }).first();
  await expect(sheetRow).toBeVisible();
  const deleteButton = sheetRow.locator('.sheetRight img[title="Delete"]');
  await expect(deleteButton).toHaveCount(1);
  page.once('dialog', async dialog => {
    await dialog.accept();
  });
  await sheetRow.evaluate((el) => {
    const deleteBtn = el.querySelector('.sheetRight img[title="Delete"]') as HTMLElement;
    if (deleteBtn) {
      const sheetRight = el.querySelector('.sheetRight') as HTMLElement;
      if (sheetRight) {
        sheetRight.style.opacity = '1';
        sheetRight.style.visibility = 'visible';
        sheetRight.style.display = 'block';
      }
      // Trigger multiple event types to ensure deletion
      deleteBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      deleteBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      deleteBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      return true;
    }
    return false;
  });
  // Wait for the sheet to be deleted by checking if it's no longer visible
  const deletedSheetRow = page.locator('.sheet').filter({ has: page.locator(`a.sheetTitle:has-text("${uniqueTitle}")`) }).first();
  await expect(deletedSheetRow).not.toBeVisible({ timeout: 10000 });
});

/**
 * Editor drag and drop tests have been moved to editor-drag-and-drop.spec.ts, to be worked on at a later point
 */





