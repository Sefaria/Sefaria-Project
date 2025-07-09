import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../pages/pageManager';
import { LoginPage } from '../pages/loginPage';
import {changeLanguageLoggedIn, goToPageWithLang, simulateOfflineMode, simulateOnlineMode, simulateLogout, simulateLogin, loginViaNavbar, loginViaTooltip, goToPageWithUser, changeLanguageIfNeeded} from "../utils";
import { LANGUAGES, testUser } from '../globals';
import { SaveStates } from '../constants';


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
    await page.keyboard.type('✅');
  });
  
  test('Detect logout after unsaved changes', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.editTitle("test title");
    await editor.focusTextInput(); 
    await page.keyboard.type('Testing logout with unsaved changes', { delay: 100 });
    await simulateLogout(page.context());
    await simulateLogout(page.context());
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();    
  });
    
  test('Detect logout when user is idle- no unsaved changes', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.editTitle("test title");
    await editor.addText('Saved text');
    await editor.waitForAutosave();
    await simulateLogout(page.context());
    await editor.addText('trigger logout detection');
    
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();
  });
  
  test('Restore session when user logs back in via cookie restoration', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('text before logout');
    await editor.waitForAutosave();
    await simulateLogout(page.context());
    await editor.addText('trigger logout detection');
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();
    await simulateLogin(page.context());
    await page.reload();
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving);
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

  test('Restore session when user logs back in via navbar link', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.setupWithContent('text before logout');
    
    await simulateLogout(page.context());
    await editor.addText('trigger logout detection');
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();
    
    await loginViaNavbar(page);
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving);
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

  test('Restore session when user logs back in via tooltip link', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.setupWithContent('text before logout');
    
    await simulateLogout(page.context());
    await editor.addText('trigger logout detection');
    await editor.assertSaveState(SaveStates.loggedOut);
    await editor.validateEditingIsBlocked();
    
    await loginViaTooltip(page);
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

  test('Show beforeunload prompt when leaving with unsaved changes', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.focusTextInput();
    
    await Promise.all([
      (async () => {
        await page.keyboard.type('Trying to leave before saving finishes', { delay: 100 });
      })(),
      (async () => {
        await page.waitForTimeout(500);
        const promptTriggered = await page.evaluate(() => {
          const e = new Event('beforeunload', { cancelable: true });
          return !window.dispatchEvent(e);
        });
        expect(promptTriggered).toBe(true);
      })()
    ]);
  });
  
  test('Show unknown error state and block editing', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await editor.addText('Before unknown error');
    
    // Trigger catch-all error
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    await page.waitForTimeout(20000);
    
    await editor.assertSaveState(SaveStates.fifthState);
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
    
    const logoutResult = await simulateLogout(page.context());
    expect(logoutResult).toBe(true);
    
    await editor.addText('trigger logout');
    await editor.assertSaveState(SaveStates.loggedOut, LANGUAGES.HE);
    await editor.validateEditingIsBlocked();
  });

  test('Display connection loss state correctly in Hebrew', async () => {
    const editor = pageManager.onSourceSheetEditorPage();
    await simulateLogin(page.context());
    await page.reload();
    
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
    await page.waitForTimeout(20000);
    await editor.assertSaveState(SaveStates.fifthState, LANGUAGES.HE);
    await editor.validateEditingIsBlocked();
  });
});