import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../pages/pageManager';
import { LoginPage } from '../pages/loginPage';
import {changeLanguageLoggedIn, goToPageWithLang, simulateOfflineMode, simulateOnlineMode, expireLogoutCookie, goToPageWithUser, changeLanguageIfNeeded} from "../utils";
import { LANGUAGES, testUser } from '../globals';
import { SaveStates } from '../constants';
import { Banner } from '../pages/banner';


test.describe('Test Saved/Saving Without Pop-ups: English', () => {
  let page: Page;
  let pageManager: PageManager;
  
  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, '/sheets/new');
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
    await page.keyboard.type('Leave before saving finishes');
    await expect(editor.statusMessage()).toContainText(SaveStates.saving.text);

    let dialogTriggered = false;
    await Promise.all([
      page.waitForEvent('dialog').then(async dialog => {
        dialogTriggered = true;
        await dialog.dismiss();
      }),
      editor.closeSheetEditor() // Attempt to leave while in 'saving' state
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
    
    // Trigger catch-all error
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });    
    await editor.assertSaveState(SaveStates.catchAllFifthState, LANGUAGES.EN, 21000); //fifth state is triggered after 20 seconds
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
    page = await goToPageWithUser(context, '/sheets/new',LANGUAGES.HE);    
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
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    await editor.assertSaveState(SaveStates.catchAllFifthState, LANGUAGES.HE, 21000); //fifth state is triggered after 20 seconds
    await editor.validateEditingIsBlocked();
  });
});