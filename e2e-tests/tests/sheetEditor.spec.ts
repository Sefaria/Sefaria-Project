import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { SheetEditorPage } from '../pages/sheetEditorPage';
import { LANGUAGES } from '../globals';
import { SaveStates } from '../constants';

let browser: Browser;
let context: BrowserContext;
let page: Page;
let sheetEditorPage: SheetEditorPage;
let sheetUrl: string;
const SPOTIFY_TEST_URL = 'https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7';

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
  await sheetEditorPage.addText('Sample text English');
  await sheetEditorPage.addText('טקסט לדוגמה בעברית');
  const textLocatorEnglish = await sheetEditorPage.getTextLocator('Sample text English');
  const textLocatorHebrew = await sheetEditorPage.getTextLocator('טקסט לדוגמה בעברית');
  await expect(textLocatorEnglish).toBeVisible();
  await expect(textLocatorHebrew).toBeVisible();
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

test('TC005: Delete Text- Backwards, Forwards, All', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  // Test backwards character deletion (backspace)
  await sheetEditorPage.addText('Test backwards deletion');
  const backwardsTestLocator = await sheetEditorPage.getTextLocator('Test backwards deletion');
  await expect(backwardsTestLocator).toBeVisible();
  await backwardsTestLocator.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace'); 
  await page.keyboard.press('Backspace');
  const partialBackwardsLocator = await sheetEditorPage.getTextLocator('Test backwards delet');
  await expect(partialBackwardsLocator).toBeVisible();
  // Test forwards character deletion (delete)
  await page.keyboard.press('Home'); 
  await page.keyboard.press('Delete'); 
  await page.keyboard.press('Delete'); 
  await page.keyboard.press('Delete'); 
  await page.keyboard.press('Delete'); 
  await page.keyboard.press('Delete'); 
  const partialForwardsLocator = await sheetEditorPage.getTextLocator('backwards delet');
  await expect(partialForwardsLocator).toBeVisible();
  //test select all and delete
  await partialForwardsLocator.click({ clickCount: 3 }); // Select all text
  await page.keyboard.press('Delete');
  await expect(partialForwardsLocator).not.toBeVisible();
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
  const sourceCount = await sheetEditorPage.addedSource().count();
  if (sourceCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleSource();
    await expect(sheetEditorPage.addedSource()).toBeVisible();
  }
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

test('TC009: Delete Added Source', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const initialCount = await sheetEditorPage.addedSource().count();
  if (initialCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleSource();
    await expect(sheetEditorPage.addedSource()).toBeVisible();
  }
  const countBeforeDeletion = await sheetEditorPage.addedSource().count();
  const sourceElement = sheetEditorPage.addedSource().first();
  await sourceElement.click();
  await expect(sourceElement).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  const finalCount = await sheetEditorPage.addedSource().count();
  expect(finalCount).toBeLessThan(countBeforeDeletion);
  const textLocator = await sheetEditorPage.getTextLocator('Text after source');
  if (await textLocator.isVisible()) {
    await textLocator.click({ clickCount: 3 });
    await page.keyboard.press('Delete');
  }
});

test('TC010: Add Image (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  await sheetEditorPage.addSampleImage();
  await sheetEditorPage.addText('Text after image');
  const textLocator = await sheetEditorPage.getTextLocator('Text after image');
  await expect(textLocator).toBeVisible();
});

test('TC011: Delete Added Image', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const imageCount = await sheetEditorPage.addedImage().count();
  if (imageCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleImage();
    await expect(sheetEditorPage.addedImage()).toBeVisible();
  } 
  const updatedImageCount = await sheetEditorPage.addedImage().count();
  const imageElement = sheetEditorPage.addedImage().first();
  await imageElement.click();
  await page.keyboard.press('Delete');
  const remainingImageCount = await sheetEditorPage.addedImage().count();
  expect(remainingImageCount).toBeLessThan(updatedImageCount);
  
});

test('TC012: Add Media - Spotify (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await sheetEditorPage.addSampleMedia(SPOTIFY_TEST_URL);
  await expect(sheetEditorPage.addedSpotify()).toBeVisible();
  await page.locator('div.sheetItem.empty').click();
  await page.keyboard.press('Enter');
  await sheetEditorPage.addText('Text after Spotify');
  const textLocator = await sheetEditorPage.getTextLocator('Text after Spotify');
  await expect(textLocator).toBeVisible();
});

test('TC013: Delete Added Media- Spotify', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const spotifyCount = await sheetEditorPage.addedSpotify().count();
  if (spotifyCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleMedia(SPOTIFY_TEST_URL);
    await expect(sheetEditorPage.addedSpotify()).toBeVisible();
  } 
  const updatedSpotifyCount = await sheetEditorPage.addedSpotify().count();
  await sheetEditorPage.focusTextInput();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Delete');
  const remainingSpotifyCount = await sheetEditorPage.addedSpotify().count();
  expect(remainingSpotifyCount).toBeLessThan(updatedSpotifyCount);
  const textLocator = await sheetEditorPage.getTextLocator('Text after Spotify');
  if (await textLocator.isVisible()) {
    await textLocator.click({ clickCount: 3 });
    await page.keyboard.press('Delete');
  }
});

test('TC014: Add Media - Youtube (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
  await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  await expect(sheetEditorPage.addedYoutube().locator('iframe')).toBeVisible();
  await page.locator('div.sheetItem.empty').click();
  await page.keyboard.press('Enter');
  await sheetEditorPage.addText('Text after YouTube');
  const textLocator = await sheetEditorPage.getTextLocator('Text after YouTube');
  await expect(textLocator).toBeVisible();
});

test('TC015: Delete Added Media- YouTube', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  const youtubeCount = await sheetEditorPage.addedYoutube().count();
  if (youtubeCount === 0) {
    await sheetEditorPage.focusTextInput();
    await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
    await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  }
  const updatedYoutubeCount = await sheetEditorPage.addedYoutube().count();
  await sheetEditorPage.focusTextInput();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Delete');
  const remainingYoutubeCount = await sheetEditorPage.addedYoutube().count();
  expect(remainingYoutubeCount).toBeLessThan(updatedYoutubeCount);
});

test('TC016: Click "X" and confirm sheet now appears in Account Profile', async () => {
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

test('TC017: Manually delete sheet from account profile', async () => {
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
 * NOTE:
 * Editor drag and drop tests have been moved to editor-drag-and-drop.spec.ts, to be worked on at a later point
 */





