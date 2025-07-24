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
  //await page.getByRole('link', { name: 'TU' , exact: true}).click();
  await page.locator('a[href="/my/profile"]').click();
  await hideAllModalsAndPopups(page);
  await page.getByRole('link', { name: 'Create a New Sheet' }).click();
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
  await sheetEditorPage.editTitle('Test Sheet Title');
  await expect(sheetEditorPage.title()).toContainText('Test Sheet Title');
  await sheetEditorPage.assertSaveState(SaveStates.saved);
});

test('TC003: Add Text', async () => {
  await page.goto(sheetUrl);
  await sheetEditorPage.addText('This is test text');
  const textLocator = await sheetEditorPage.getTextLocator('This is test text');
  await expect(textLocator).toBeVisible();
});

test('TC004: Add Source (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  //await page.keyboard.press('ArrowDown');
  await sheetEditorPage.addSampleSource();
  await expect(sheetEditorPage.addedSource()).toBeVisible();
  await sheetEditorPage.addTextBelow('Text after source');
  const textLocator = await sheetEditorPage.getTextLocator('Text after source');
  await expect(textLocator).toBeVisible();

});

test('TC005: Add Media - Spotify (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  //await page.keyboard.press('ArrowDown');
  await sheetEditorPage.addSampleMedia('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
  await expect(sheetEditorPage.addedSpotify()).toBeVisible();
  await sheetEditorPage.addTextBelow('Text after Spotify');
  const textLocator = await sheetEditorPage.getTextLocator('Text after Spotify');
  await expect(textLocator).toBeVisible();
});

test('TC006: Add Media - Youtube (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  //await page.keyboard.press('ArrowDown');
  await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
  await expect(sheetEditorPage.addedYoutube()).toBeVisible();
  await sheetEditorPage.addTextBelow('Text after YouTube');
  const textLocator = await sheetEditorPage.getTextLocator('Text after YouTube');
  await expect(textLocator).toBeVisible();
});


test('TC007: Add Image (followed by text)', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  await sheetEditorPage.focusTextInput();
  //await page.keyboard.press('ArrowDown');
  await sheetEditorPage.addSampleImage();
  await sheetEditorPage.addTextBelow('Text after image');
  const textLocator = await sheetEditorPage.getTextLocator('Text after image');
  await expect(textLocator).toBeVisible();
  //await sheetEditorPage.assertSaveState(SaveStates.saved);
});

// test('TC008: Drag and Drop Text', async () => {
//   await page.goto(sheetUrl);
//   // First click to select/highlight the element
//   // const sourceElement = page.locator('.text-segment').first();
//   // await sourceElement.click();
  
//   // // Wait for highlight/selection state
//   // await expect(sourceElement).toHaveClass(/selected|highlighted/);
  
//   // // Drag to target position
//   // const targetElement = page.locator('.text-segment').nth(2);
//   // await sourceElement.dragTo(targetElement);
  
//   // // Verify the element moved
//   // await expect(page.locator('.text-segment').nth(2)).toContainText('expected text');
// });

test('TC009: Drag and Drop Added Source', async () => {
  await page.goto(sheetUrl);
  await hideAllModalsAndPopups(page);
  // Check if source exists, if not add one
  const sourceCount = await sheetEditorPage.addedSource().count();
  if (sourceCount === 0) {
    await sheetEditorPage.focusTextInput();
   // await page.keyboard.press('ArrowDown');
    await sheetEditorPage.addSampleSource();
    await expect(sheetEditorPage.addedSource()).toBeVisible();
  }
  // Get the source element and the top of the sheet for drag target
  const sourceElement = sheetEditorPage.addedSource().last();
    // Click to select the source
  await sourceElement.click();
  await expect(sourceElement).toHaveClass(/selected/);
  
  // Capture initial position and DOM order before drag
  const initialBounds = await sourceElement.boundingBox();
  const initialY = initialBounds?.y || 0;
  
  const initialIndex = await page.evaluate(() => {
    const segments = Array.from(document.querySelectorAll('.sheetContent .sheetItem'));
    const selectedElement = document.querySelector('.sheetItem.selected, .selected');
    return segments.findIndex(segment => segment.contains(selectedElement) || segment === selectedElement);
  });
  
  // Find the lowest element in the sheet and drag source below it
  const allSegments = page.locator('.sheetContent .sheetItem');
  const segmentCount = await allSegments.count();
  
  if (segmentCount > 1) {
    // Get the last element and drag the source below it
    const lastElement = allSegments.last();
    await sourceElement.dragTo(lastElement, { targetPosition: { x: 0, y: 20 } });
  } else {
    // If only one element exists, drag to bottom of sheet
    const sheetBody = sheetEditorPage.sourceSheetBody();
    const sheetBounds = await sheetBody.boundingBox();
    const targetY = sheetBounds ? sheetBounds.height - 50 : 500;
    await sourceElement.dragTo(sheetBody, { targetPosition: { x: 0, y: targetY } });
  }
  
  // Verify the source moved by checking position and DOM order
  const finalBounds = await sourceElement.boundingBox();
  const finalY = finalBounds?.y || 0;
  
  const finalIndex = await page.evaluate(() => {
    const segments = Array.from(document.querySelectorAll('.sheetContent .sheetItem'));
    const sourceElements = Array.from(document.querySelectorAll('.SheetSource.segment'));
    if (sourceElements.length > 0) {
      const sourceElement = sourceElements[sourceElements.length - 1];
      return segments.findIndex(segment => segment.contains(sourceElement));
    }
    return -1;
  });
  
  // Verify movement occurred
  if (segmentCount > 1) {
    expect(finalY).toBeGreaterThan(initialY); // Position moved down
    expect(finalIndex).toBeGreaterThan(initialIndex); // DOM order changed
  }
  
  // Verify the source is still visible after drag
  await expect(sheetEditorPage.addedSource()).toBeVisible();
});

+  test('TC010: Drag and Drop Added Image', async () => {
      await page.goto(sheetUrl);
      await hideAllModalsAndPopups(page);
      // Check if image exists, if not add one
      const imageCount = await sheetEditorPage.addedImage().count();
      if (imageCount === 0) {
        await sheetEditorPage.focusTextInput();
       // await page.keyboard.press('ArrowDown');
        await sheetEditorPage.addSampleImage();
        await expect(sheetEditorPage.addedImage()).toBeVisible();
      }
      // Get the image element and the top of the sheet for drag target
      const imageElement = sheetEditorPage.addedImage().last();
      // Click to select the image
      await imageElement.click();
      //await expect(imageElement.locator('..').locator('..')).toHaveClass(/selected/);
      
      // Capture initial position and DOM order before drag
      const initialBounds = await imageElement.boundingBox();
      const initialY = initialBounds?.y || 0;
      
      const initialIndex = await page.evaluate(() => {
        const segments = Array.from(document.querySelectorAll('.sheetContent .sheetItem'));
        const selectedElement = document.querySelector('.sheetItem.selected, .selected');
        return segments.findIndex(segment => segment.contains(selectedElement) || segment === selectedElement);
      });
      
      // Find the lowest element in the sheet and drag image below it
      const allSegments = page.locator('.sheetContent .sheetItem');
      const segmentCount = await allSegments.count();
      
      if (segmentCount > 1) {
        // Get the last element and drag the image below it
        const lastElement = allSegments.last();
        await imageElement.dragTo(lastElement, { targetPosition: { x: 0, y: 20 } });
      } else {
        // If only one element exists, drag to bottom of sheet
        const sheetBody = sheetEditorPage.sourceSheetBody();
        const sheetBounds = await sheetBody.boundingBox();
        const targetY = sheetBounds ? sheetBounds.height - 50 : 500;
        await imageElement.dragTo(sheetBody, { targetPosition: { x: 0, y: targetY } });
      }
      
      // Verify the image moved by checking position and DOM order
      const finalBounds = await imageElement.boundingBox();
      const finalY = finalBounds?.y || 0;
      
      const finalIndex = await page.evaluate(() => {
        const segments = Array.from(document.querySelectorAll('.sheetContent .sheetItem'));
        const imageElements = Array.from(document.querySelectorAll('img.addedMedia'));
        if (imageElements.length > 0) {
          const imageElement = imageElements[imageElements.length - 1];
          return segments.findIndex(segment => segment.contains(imageElement));
        }
        return -1;
      });
      
      // Verify movement occurred
      if (segmentCount > 1) {
        expect(finalY).toBeGreaterThan(initialY); // Position moved down
        expect(finalIndex).toBeGreaterThan(initialIndex); // DOM order changed
      }
      
     // Verify the image is still visible after drag
      await expect(sheetEditorPage.addedImage()).toBeVisible();
    });

    test('TC011: Drag and Drop Added Media does not work', async () => {
          await page.goto(sheetUrl);
          await hideAllModalsAndPopups(page);
          
          const youtubeCount = await sheetEditorPage.addedYoutube().count();
          if (youtubeCount === 0) {
            await sheetEditorPage.focusTextInput();
            await sheetEditorPage.addSampleMedia('https://www.youtube.com/watch?v=Vmwc02Q7DEA');
            await expect(sheetEditorPage.addedYoutube()).toBeVisible();
          }
          
          const spotifyCount = await sheetEditorPage.addedSpotify().count();
          if (spotifyCount === 0) {
            await sheetEditorPage.focusTextInput();  
            await sheetEditorPage.addSampleMedia('https://open.spotify.com/episode/4FJZFVPldsPmNZHWDjErc7?go=1&sp_cid=6ea9e4ea9774809d27158effbe0145a0&utm_source=embed_player_p&utm_medium=desktop&nd=1&dlsi=3457420a9c6e4dd7');
            await expect(sheetEditorPage.addedSpotify()).toBeVisible();
          }

          const youtubeContainer = sheetEditorPage.addedYoutube().last();
          const youtubeBoundingBox = await youtubeContainer.boundingBox();
          const youtubeInitialY = youtubeBoundingBox?.y || 0;
          
         // Attempt to drag YouTube - this should not work for media elements
          const allContainers = page.locator('.sheetContent .boxedSheetItem');
          const containerCount = await allContainers.count();
          
         if (containerCount > 1) {
            const targetContainer = allContainers.first();
           // Try to drag YouTube container - should fail
            try {
              await youtubeContainer.dragTo(targetContainer, { timeout: 2000 });
            } 
            catch (error) {
             // Expected behavior - drag should not work
            }
            // Verify YouTube did not move
            const youtubeFinalBounds = await youtubeContainer.boundingBox();
            const youtubeFinalY = youtubeFinalBounds?.y || 0;
            expect(Math.abs(youtubeFinalY - youtubeInitialY)).toBeLessThan(10); // Should not have moved significantly
          }
          // Test Spotify media cannot be dragged
          const spotifyContainer = sheetEditorPage.addedSpotify().last();
          const spotifyInitialBounds = await spotifyContainer.boundingBox();
          const spotifyInitialY = spotifyInitialBounds?.y || 0;
          
          if (containerCount > 1) {
            const targetContainer = allContainers.first();
            // Try to drag Spotify container - should fail
            try {
              await spotifyContainer.dragTo(targetContainer, { timeout: 2000 });
            } 
            catch (error) {
              // Expected behavior - drag should not work
            }
            // Verify Spotify did not move
            const spotifyFinalBounds = await spotifyContainer.boundingBox();
            const spotifyFinalY = spotifyFinalBounds?.y || 0;
            expect(Math.abs(spotifyFinalY - spotifyInitialY)).toBeLessThan(10); // Should not have moved significantly
          }
          // Verify both media elements are still visible and in their original positions
          await expect(sheetEditorPage.addedYoutube()).toBeVisible();
          await expect(sheetEditorPage.addedSpotify()).toBeVisible();
       });

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
  await textContent.click();
  
  await page.keyboard.press('End'); // Move cursor to end
  await page.keyboard.type(' [EDITED]');
  const editedSourceText = await sourceElement.textContent();
  expect(editedSourceText).toContain('[EDITED]');
  expect(editedSourceText).not.toBe(originalSourceText);
  
  await page.keyboard.press('Home'); // Move cursor to beginning
  await page.keyboard.type('PREFIX: ');
  const prefixedSourceText = await sourceElement.textContent();
  expect(prefixedSourceText).toContain('PREFIX:');
  
  await page.keyboard.press('Home');
  for (let i = 0; i < 8; i++) { 
    await page.keyboard.press('Shift+ArrowRight');
  }
  await page.keyboard.press('Delete');
  
  const finalSourceText = await sourceElement.textContent();
  expect(finalSourceText).not.toContain('PREFIX:');
  expect(finalSourceText).toContain('[EDITED]');
});

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