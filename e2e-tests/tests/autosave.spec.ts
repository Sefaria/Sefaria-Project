import { test, expect, Page } from '@playwright/test';
import { SourceSheetEditorPage } from '../pages/sourceSheetEditor.page';
import { LoginPage } from '../pages/loginPage';
import {hideModals, hideTopBanner, changeLanguageLoggedIn, hideCookiesPopup, hideGenericBanner, goToPageWithLang} from "../utils";
import { LANGUAGES, testUser } from '../globals';


// Support environment variable for cross-environment testing
const TEST_URL = process.env.BASE_URL?.replace(/\/$/, '') || 'https://save-editor.cauldron.sefaria.org';


test.describe('Source Sheet Editor - Autosave and Session Status', () => {
  
  test.beforeEach(async ({ context }) => {
    // Support environment variables while maintaining backwards compatibility
    const user = {
      email: process.env.LOGIN_USERNAME || testUser.email,
      password: process.env.LOGIN_PASSWORD || testUser.password,
    };
    
    page = await goToPageWithLang(context, '/login');
    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await page.goto(`${TEST_URL}/login`);
    await loginPage.ensureLanguage(LANGUAGES.EN);  // Switch to English
    await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');
    await hideModals(page);
    await page.goto(`/sheets/new`, { waitUntil: 'domcontentloaded' });
    await changeLanguageLoggedIn(page, LANGUAGES.EN);
    
    // Wait for sheet content
    await page.waitForSelector('.sheetContent', { timeout: 10000 });
    
    // Additional safety: call hideModals again after language change to ensure guide is dismissed
    await hideModals(page);
    await hideCookiesPopup(page);
    await hideGenericBanner(page);
  });

  test('Text box aligned with save indicator is clickable', async () => {
    const editor = new SourceSheetEditorPage(page);
    const uniqueText = 'ClickTarget123';
    await editor.addText(uniqueText);
    await editor.alignTextWithStatusIndicator(uniqueText);
    await page.waitForTimeout(500); // allow scroll to settle
    const textLocator = page.locator('span[data-slate-string="true"]', { hasText: uniqueText });
    await textLocator.dblclick();
    await page.keyboard.type('✅');
  });
  
  test('User actively typing, then gets logged out', async () => {
    const editor = new SourceSheetEditorPage(page);
    //await editor.addSampleSource(); //had problem with adding sources/media because of naming conflicts
    await editor.editTitle("test title");
    await editor.focusTextInput(); 
    // Begin typing but pause before autosave can kick in
    await page.keyboard.type('Testing logout with unsaved changes', { delay: 100 });
    await hideModals(page);
    await hideTopBanner(page); //currently does not work without this
    // Immediately simulate logout
    await editor.simulateLogout(page.context());
    // Wait until the logout state is visible in the UI
    await editor.assertSaveState(SaveStates.loggedOut);
    // Confirm editing is now blocked
    await editor.validateEditingIsBlocked();    
  });
    
  test('User idle before logout, no unsaved changes', async () => {
    const editor = new SourceSheetEditorPage(page);
    //await editor.addSampleSource(); //had problem with adding sources/media because of naming conflicts
    await editor.editTitle("test title");
    await editor.addText('Saved text');
    await editor.waitForAutosave();
     // Close popup if it appears
    await hideModals(page);
    await hideTopBanner(page);
    await page.waitForTimeout(500);
    // Simulate logout
    await editor.simulateLogout(page.context());
    await hideModals(page);
    //trigger logout detection
    await editor.addText('trigger logout detection');
    await page.waitForTimeout(500);
    //status indicator checks
    await editor.assertSaveState(SaveStates.loggedOut);
    // Confirm editing is now blocked
    await editor.validateEditingIsBlocked();
  });
  
  test('User logs back (restore cookie) in and resumes editing', async () => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('text before logout');
    await editor.waitForAutosave();
    await hideTopBanner(page);
    await page.reload();
    //simulate logout
    const originalValue = await editor.simulateLogout(page.context());
    await page.waitForTimeout(500);
    if (originalValue === null) { throw new Error("originalValue cannot be null");}
    //simulate login
    await editor.simulateLogin(page.context());
    await page.reload();
    //status indicator checks
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving)
    // Check that the editor is enabled
    await expect(editor.sourceSheetBody()).toBeEnabled();
    await editor.addText('Text after login');
  });

  test('User logs back (clicks login from the navbar) in and resumes editing', async () => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('text before logout');
    await hideTopBanner(page); //currently does not work without this
    await editor.waitForAutosave();
    //simulate logout
    const originalValue = await editor.simulateLogout(page.context());
    await page.waitForTimeout(500);
    if (originalValue === null) { throw new Error("originalValue cannot be null"); }
    await editor.addText('trigger logout detection');
    await page.waitForTimeout(500);
    await page.reload();
    //login through link in the navbar
    await editor.loginLink().click();
    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');    //check status indicator
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving)
    //validate that the editor is enabled
    await expect(editor.sourceSheetBody()).toBeEnabled();
    await editor.addText('Text after login');
  });

  test('User logs back (clicks login from the tooltip) in and resumes editing', async () => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('text before logout');
    await hideTopBanner(page); //currently does not work without this
    await editor.waitForAutosave();
    //simulate logout
    const originalValue = await editor.simulateLogout(page.context());
    await page.waitForTimeout(500);
    if (originalValue === null) { throw new Error("originalValue cannot be null"); }
    await editor.addText('trigger logout detection');
    await hideTopBanner(page); 
    await page.waitForTimeout(500);
    await hideTopBanner(page);
    //login and check saving resumes and editing is enabled
    page.once('dialog', async dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      await dialog.accept(); // Accepts the "Leave page?" dialog
    });
    await editor.loginLink().click();
    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');  
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving)
    await expect(editor.sourceSheetBody()).toBeEnabled();
    await editor.addText('text after login');
  });

  test('Connectivity lost while entering text', async () => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page); //currently does not work without this
    await editor.addText('Testing connection loss');
    await editor.simulateOfflineMode();
    await editor.addText('trigger connection loss');
    await page.waitForTimeout(500);
    await editor.assertSaveState(SaveStates.tryingToConnect)
    await editor.validateEditingIsBlocked();
  });

  test('Connectivity restored after being lost', async () => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('Testing connection recovery');
    await hideTopBanner(page); //currently does not work without this
    //simulate connection loss
    await editor.simulateOfflineMode();
    await editor.addText('trigger connection loss');
    await page.waitForTimeout(500);
    await editor.assertSaveState(SaveStates.tryingToConnect)
    //simulate connection recovery and check for appropriate results
    await editor.simulateOnlineMode();
    await page.waitForTimeout(2000);
    await editor.waitForConnectionState('online');
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving)
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

 
  test('unsaved changes trigger beforeunload prompt on any exit action', async () => {
    //this method simulates any type of exit action, such as closing the tab, navigating away, or refreshing the page
    const editor = new SourceSheetEditorPage(page);
    await editor.focusTextInput();
    await Promise.all([
      // Start typing slowly
      (async () => {
        await page.keyboard.type('Trying to leave before saving finishes', { delay: 100 });
      })(),
      // Attempt to exit after a short delay
      (async () => {
        await page.waitForTimeout(1000); // Exit mid-typing
        const promptTriggered = await page.evaluate(() => {
          const e = new Event('beforeunload', { cancelable: true });
          return !window.dispatchEvent(e); // false means prompt would appear
        });
        expect(promptTriggered).toBe(true);
      })()
    ]);
  });
  
  test('Blocked state on unknown error (Catch-All Save Failure)', async () => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page); 
    await editor.addText('Before unknown error');
    // Trigger catch-all error
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    await page.waitForTimeout(20000); 
    // Wait for catch-all error message
    await editor.assertSaveState(SaveStates.fifthState)
    // Confirm editing is now blocked
    await editor.validateEditingIsBlocked();
    // Leaving page should now trigger alert
    const promptTriggered = await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      return !window.dispatchEvent(e);
    });
    expect(promptTriggered).toBe(true);
  });
});

test.describe('Test Saved/Saving Without Pop-ups: Hebrew', () => {
  let page: Page;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, '/login', LANGUAGES.HE);
    const loginPage = new LoginPage(page, LANGUAGES.HE);
    await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');
    await hideModals(page);
    await page.goto(`/sheets/new`, { waitUntil: 'domcontentloaded' });
    await changeLanguageLoggedIn(page, LANGUAGES.HE);
    await hideCookiesPopup(page);
    await hideGenericBanner(page);
  });

  test('All save state indicators work in Hebrew', async () => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page);
    //check that saving and saved are accurate in Hebrew
    await editor.addText('test saving saved hebrew');
    await editor.assertSaveState(SaveStates.saved || SaveStates.saving, LANGUAGES.HE)

    await hideTopBanner(page); 
     //simulate logout
     const originalValue = await editor.simulateLogout(page.context());
     await page.waitForTimeout(500);
     if (originalValue === null) {throw new Error("originalValue cannot be null");}
     await editor.addText('trigger logout');
      await page.waitForTimeout(1000);
      await editor.assertSaveState(SaveStates.loggedOut, LANGUAGES.HE)
      //simulate login
      await editor.simulateLogin(page.context());
      await page.reload();
      //check that connection loss is accurate in Hebrew
      // Simulate connection loss
      await editor.simulateOfflineMode();
      await editor.addText('Trigger connection loss');
      await editor.assertSaveState(SaveStates.tryingToConnect, LANGUAGES.HE)
      await editor.simulateOnlineMode();
      await page.reload();
      //check that fifth state is accurate in Hebrew
      // Trigger catch-all error
      await editor.addText('Trigger unknown error');
      await page.evaluate(() => {
        (window as any).Sefaria.testUnkownNewEditorSaveError = true;
      });
      await page.waitForTimeout(20000); 
      await editor.assertSaveState(SaveStates.fifthState, LANGUAGES.HE)
    });
});