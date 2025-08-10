import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../pages/pageManager';
import { LoginPage } from '../pages/loginPage';
import {simulateOfflineMode, simulateOnlineMode, expireLogoutCookie, goToPageWithUser, hideAllModalsAndPopups, changeLanguage} from "../utils";
import { LANGUAGES, testUser } from '../globals';
import { SaveStates } from '../constants';
import { Banner } from '../pages/banner';


test.describe('Test Saved/Saving Without Pop-ups: English', () => {
  let page: Page;
  let pageManager: PageManager;
  
  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, '/sheets/new');
    await hideAllModalsAndPopups(page);
    pageManager = new PageManager(page, LANGUAGES.EN);
  });

  test('Text box aligned with save indicator is clickable', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    const uniqueText = 'ClickTarget123';
    await editor.addText(uniqueText);
    await editor.alignTextWithStatusIndicator(uniqueText);
    const textLocator = page.locator('span[data-slate-string="true"]', { hasText: uniqueText });
    await textLocator.dblclick();
    await page.keyboard.type('new text');
  });
  
  test('Detect logout after unsaved changes', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.editTitle("test title");
    await editor.focusTextInput(); 
    await page.keyboard.type('Testing logout with unsaved changes', { delay: 100 });
    await expireLogoutCookie(page.context());
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();    
  });
    
  test('Detect logout when user is idle- no unsaved changes', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.editTitle("test title");
    await editor.addText('Saved text');
    await editor.waitForAutosave();
    await expireLogoutCookie(page.context());
    await editor.addText('trigger logout detection');
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();
  });
  
  test('Restore session when user logs back in via navbar link', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('text before logout');
    await editor.waitForAutosave();
    await expireLogoutCookie(page.context());
    await editor.addText('trigger logout detection');
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();
    await page.reload();
    const banner = new Banner(page, LANGUAGES.EN);
    await banner.loginThroughBanner();
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving);
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

  test('Restore session when user logs back in via tooltip link', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('text before logout');
    await editor.waitForAutosave();    
    await expireLogoutCookie(page.context());
    await editor.addText('trigger logout detection');
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();
    
    await editor.loginViaTooltip();
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving);
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

  test('Detect connection loss and block editing', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('Testing connection loss');
    
    await simulateOfflineMode(page);
    await editor.addText('trigger connection loss');    
    await editor.assertSaveState(SaveStates.tryingToConnect);
    await editor.validateEditingIsBlocked();
  });

  test('Restore connection and resume editing', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('Testing connection recovery');
    
    await simulateOfflineMode(page);
    await editor.addText('trigger connection loss');
    await editor.assertSaveState(SaveStates.tryingToConnect);
    await editor.validateEditingIsBlocked();
    
    await simulateOnlineMode(page);
    await editor.waitForConnectionState('online');
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving);
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

  test('Sefaria unsaved changes popup appears after clicking x sheet button', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.focusTextInput();
    
    let dialogTriggered = false;
    
    // Set up dialog handler first
    const dialogPromise = page.waitForEvent('dialog').then(async dialog => {
      dialogTriggered = true;
      await dialog.dismiss();
    });

    // Type a longer text to ensure saving takes more time
    await page.keyboard.type('This is a longer text to ensure saving takes some time and we can click during the saving state');
    
    // Use waitForFunction to immediately click when saving state appears
    await Promise.all([
      dialogPromise,
      page.waitForFunction(() => {
        const message = document.querySelector('.saveStateMessage');
        return message && message.textContent?.includes('Saving');
      }).then(() => editor.closeSheetEditorButton().click())
    ]);
    
    expect(dialogTriggered).toBe(true);
  });

  test('Unsaved changes popup appears when closing tab', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.focusTextInput();
    await page.keyboard.type('Leave before saving finishes');
    await expect(editor.statusMessage()).toContainText(SaveStates.saving.text);

    let dialogTriggered = false;
    await Promise.all([
      page.waitForEvent('dialog').then(async dialog => {
        expect(dialog.type()).toBe('beforeunload');
        dialogTriggered = true;
        await dialog.dismiss();
      }),
      page.goto('about:blank').catch(() => {}) // Ignore navigation error since dialog interrupts it
    ]);
    expect(dialogTriggered).toBe(true);
  });
  
  test('Show unknown error state and block editing', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('Before unknown error');
    
    // Wait for initial save to complete
    await editor.assertSaveState(SaveStates.saved, LANGUAGES.EN);
    
    // Trigger catch-all error
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    
    // Trigger another save operation to activate the error
    await editor.addText(' - triggering error');
    
    // Now wait for the error state (which appears after 20 seconds)
    await editor.assertSaveState(SaveStates.catchAllFifthState, LANGUAGES.EN, 23000);
    await editor.validateEditingIsBlocked();
    
    const promptTriggered = await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      return !window.dispatchEvent(e);
    });
    expect(promptTriggered).toBe(true);
  });
});

test.describe('Test Saved/Saving Without Pop-ups: Hebrew', () => {
  let page: Page;
  let pageManager: PageManager;

  test.beforeEach(async ({ context }) => {
    // Create completely fresh context for each Hebrew test to avoid contamination
    page = await goToPageWithUser(context, '/sheets/new', LANGUAGES.HE);  
    await hideAllModalsAndPopups(page);  
    await changeLanguage(page, LANGUAGES.HE);
    pageManager = new PageManager(page, LANGUAGES.HE);
  });

  test('Display save states correctly in Hebrew', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('test saving saved hebrew');
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving, LANGUAGES.HE);
  });

  test('Display logout state correctly in Hebrew', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    const logoutResult = await expireLogoutCookie(page.context());
    expect(logoutResult).toBe(true);
    await editor.addText('trigger logout');
    await editor.assertSaveState(SaveStates.loggedOut, LANGUAGES.HE);
    await editor.validateEditingIsBlocked();
  });

  test('Display connection loss state correctly in Hebrew', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await simulateOfflineMode(page);
    await editor.addText('Trigger connection loss');
    await editor.assertSaveState(SaveStates.tryingToConnect, LANGUAGES.HE);
    await editor.validateEditingIsBlocked();
  });

  test('Display unknown error state correctly in Hebrew', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await simulateOnlineMode(page);
    await page.reload();
    
    await editor.addText('Trigger unknown error');
    
    // Wait for initial save to complete
    await editor.assertSaveState(SaveStates.saved, LANGUAGES.HE);
    
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    
    // Trigger another save operation to activate the error
    await editor.addText(' - triggering error');
    
    // Now wait for the error state (which appears after 20 seconds)
    await editor.assertSaveState(SaveStates.catchAllFifthState, LANGUAGES.HE, 23000);
    await editor.validateEditingIsBlocked();
  });
});