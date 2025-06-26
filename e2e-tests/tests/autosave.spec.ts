import { test, expect, Locator } from '@playwright/test';
import { SourceSheetEditorPage } from '../pages/sourceSheetEditor.page';
import { LoginPage } from '../pages/loginPage';
import {goToPageWithUser, loginUser, hideModals, isClickable, hideTopBanner, changeLanguageLoggedOut, changeLanguageLoggedIn, hideCookiesPopup, hideGenericBanner} from "../utils";
import { LANGUAGES, testUser } from '../globals';
import { SaveStates } from '../contants';


//const TEST_URL = 'https://save-editor.cauldron.sefaria.org';
const TEST_URL = 'https://make-editor-editable-again.cauldron.sefaria.org'
//const TEST_URL = 'http://2415.coolifydev.sefaria.org';
//const TEST_URL = 'https://textpreview.cauldron.sefaria.org'


test.describe('Test Saved/Saving Without Pop-ups: English', () => {
  
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await page.goto(`${TEST_URL}/login`);
    await loginPage.ensureLanguage(LANGUAGES.EN);  // Switch to English
    //await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');
    await loginPage.loginAs('tzirel@sefaria.org', '1234567');
    await hideModals(page);
    // Now navigate to Source Sheet Editor
    await page.goto(`${TEST_URL}/sheets/new`, { waitUntil: 'domcontentloaded' });
    await changeLanguageLoggedIn(page, LANGUAGES.EN);
    await hideCookiesPopup(page);
    await hideGenericBanner(page);
  });

  // test('Text aligned with Save State Indicator is editable', async ({ page }) => {
  //   const editor = new SourceSheetEditorPage(page);
  //   const originalText = 'test';
  //   const editedText = 'edited';
  //   await editor.focusTextInput();
  //   for (let i = 0; i < 15; i++) {
  //     await editor.page.keyboard.press('Enter');
  //   }
  //   await page.keyboard.type(originalText);
  //   //await editor.addText(originalText);
  //   // Add padding lines to enable scrolling
  //   await editor.alignTextWithStatusIndicator(originalText);
  //   const textLocator = editor.getTextLocator(originalText);
  //   await (await textLocator).dblclick();
  //   await page.keyboard.type('edited');
  //   // Use new locator that reflects updated text
  //   const updatedLocator = editor.getTextLocator(editedText);
  //   await expect(await updatedLocator).toHaveText(editedText);
  // });

  test('Text box aligned with save indicator is clickable', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
  
    const uniqueText = 'ClickTarget123';
    await editor.addText(uniqueText);
  
    await editor.alignTextWithStatusIndicator(uniqueText);
    await page.waitForTimeout(500); // allow scroll to settle
  
    const textLocator = page.locator('span[data-slate-string="true"]', { hasText: uniqueText });
    await textLocator.dblclick();
    await page.keyboard.type('✅');
    //await expect(textLocator).toHaveText(uniqueText + '✅');
  });
  
  
  

  test('User actively typing, then gets logged out', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    //await editor.addSampleSource(); //had problem with adding sources/media because of naming conflicts
    await editor.editTitle("test title");
    await editor.focusTextInput(); 
      // Begin typing but pause before autosave could kick in
      await page.keyboard.type('Testing logout with unsaved changes', { delay: 100 });
      await hideModals(page);
      await hideTopBanner(page); //currently does not work without this
      // Immediately simulate logout
      await editor.simulateLogout(page.context());
      // Wait until the logout state is visible in the UI
      await expect(editor.statusMessage()).toHaveText(SaveStates.loggedOut.text, { timeout: 10000 }); //used to say status indicator
      // Optionally hover to simulate interaction
      await editor.statusIndicator().hover();
      await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.loggedOut.tooltip);
      await editor.assertSaveStateIndicatorIsOnTop();
      // Confirm editing is now blocked
      await editor.validateEditingIsBlocked();    
  });
    
  test('User idle before logout, no unsaved changes', async ({ page }) => {
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
    //status inicator checks
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.statusMessage()).toHaveText(SaveStates.loggedOut.text, { timeout: 10000 });
    await editor.statusIndicator().hover();
    //check tooltip
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.loggedOut.tooltip);
    // Confirm editing is now blocked
    await editor.validateEditingIsBlocked();
  });
  
  

  test('User logs back (restore cookie) in and resumes editing', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('text before logout');
    await editor.waitForAutosave();
    await hideTopBanner(page);
    await page.reload();
    //simulate logout
    const originalValue = await editor.simulateLogout(page.context());
    await page.waitForTimeout(500);
    if (originalValue === null) {
        throw new Error("originalValue cannot be null");
    }
    //simulate login
    await editor.simulateLogin(page.context());
    await page.reload();
    //status indicator checks
    await expect(editor.statusMessage()).toHaveText(SaveStates.saved.text|| SaveStates.saving.text); //used to say status indicator
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.saved.tooltip || SaveStates.saving.tooltip, { timeout: 2000 });
    await editor.assertSaveStateIndicatorIsOnTop();
    // Check that the editor is enabled
    await expect(editor.sourceSheetBody()).toBeEnabled();
    await editor.addText('Text after login');
  });

  test('User logs back (clicks login from the navbar) in and resumes editing', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('text before logout');
    await hideTopBanner(page); //currently does not work without this
    await editor.waitForAutosave();
    //simulate logout
    const originalValue = await editor.simulateLogout(page.context());
    await page.waitForTimeout(500);
    if (originalValue === null) {
        throw new Error("originalValue cannot be null");
    }
    await editor.addText('trigger logout detection');
    await page.waitForTimeout(500);
    await page.reload();
    //login through link in the navbar
    await editor.loginLink().click();
    await loginUser(page);
    //check status indicator
    await expect(editor.statusMessage()).toHaveText(SaveStates.saved.text|| SaveStates.saving.text);
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.saved.tooltip || SaveStates.saving.tooltip, { timeout: 2000 });
    await editor.assertSaveStateIndicatorIsOnTop();
    //validate that the editor is enabled
    await expect(editor.sourceSheetBody()).toBeEnabled();
    await editor.addText('Text after login');
  });

  test('User logs back (clicks login from the tooltip) in and resumes editing', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('text before logout');
    await hideTopBanner(page); //currently does not work without this
    await editor.waitForAutosave();
    //simulate logout
    const originalValue = await editor.simulateLogout(page.context());
    await page.waitForTimeout(500);
    if (originalValue === null) {
        throw new Error("originalValue cannot be null");
    }
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
   
    await loginUser(page);
    await expect(editor.statusMessage()).toHaveText(SaveStates.saved.text|| SaveStates.saving.text);
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.saved.tooltip || SaveStates.saving.tooltip, { timeout: 2000 });
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.sourceSheetBody()).toBeEnabled();
    await editor.addText('text after login');

  });

  test('Connectivity lost while entering text', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page); //currently does not work without this
    await editor.addText('Testing connection loss');
    await editor.simulateOfflineMode();
    await editor.addText('trigger connection loss');
    await page.waitForTimeout(500);
    await expect(editor.statusMessage()).toHaveText(SaveStates.tryingToConnect.text);
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.tryingToConnect.tooltip);
    await editor.validateEditingIsBlocked();
  });

  test('Connectivity restored after being lost', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('Testing connection recovery');
    await hideTopBanner(page); //currently does not work without this
    //simulate connection loss
    editor.simulateOfflineMode();
    await editor.addText('trigger connection loss');
    await page.waitForTimeout(500);
    await expect(editor.statusMessage()).toHaveText(SaveStates.tryingToConnect.text); //used to say status indicator
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.tryingToConnect.tooltip);
    //simulate connection recovery and check for appropriate results
    await editor.simulateOnlineMode();
    await page.waitForTimeout(2000);
    await editor.waitForConnectionState('online');
    await expect(editor.statusMessage()).toHaveText(SaveStates.saved.text|| SaveStates.saving.text);
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.saved.tooltip || SaveStates.saving.tooltip, { timeout: 2000 });
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

 
  test('unsaved changes trigger beforeunload prompt on any exit action', async ({ page }) => {
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
  
  test('Blocked state on unknown error (Catch-All Save Failure)', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page); // Hide ASAP
    await editor.addText('Before unknown error');
    // Trigger catch-all error
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    await page.waitForTimeout(20000); 
    // Wait for catch-all error message
    await expect(editor.statusMessage()).toHaveText(SaveStates.fifthState.text, { timeout: 20000,});
    // Hover and check tooltip
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.fifthState.tooltip);
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

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await page.goto(`${TEST_URL}/login`);
    await loginPage.ensureLanguage(LANGUAGES.EN);  // Switch to Hebrew
    //await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');
    await loginPage.loginAs('tzirel@sefaria.org', '1234567');
    await hideModals(page);
    // Now navigate to Source Sheet Editor
    await page.goto(`${TEST_URL}/sheets/new`, { waitUntil: 'domcontentloaded' });
    await changeLanguageLoggedIn(page, LANGUAGES.HE);
    await hideCookiesPopup(page);
    await hideGenericBanner(page);
  });

  test('All save state indicators work in Hebrew', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page); //currently does not work without this
    await changeLanguageLoggedIn(page, LANGUAGES.HE);
    // Ensure interfaceLang is stored correctly (optional, but helpful)
    // await page.waitForFunction(() => {
    //   return localStorage.getItem('interfaceLang') === 'he';
    // });

    // Now reload the page
    //await page.reload();
    await page.reload({ waitUntil: 'networkidle' });
    //check that saving and saved are accurate in Hebrew
    await editor.addText('test saving saved hebrew');
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.statusMessage()).toHaveText(SaveStates.saved.textHebrew|| SaveStates.saving.textHebrew);
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', (SaveStates.saved.tooltipHebrew || SaveStates.saving.tooltipHebrew) , { timeout: 2000 });
    await expect(editor.statusMessage()).toHaveText(SaveStates.saved.textHebrew); 
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.saved.tooltipHebrew, { timeout: 2000 });
    await hideTopBanner(page); 
    //await page.reload();
    //simulate logout
    //check that logout is accurate in Hebrew
     //simulate logout
     const originalValue = await editor.simulateLogout(page.context());
     await page.waitForTimeout(500);
     if (originalValue === null) {
         throw new Error("originalValue cannot be null");
     }
    await editor.addText('trigger logout');
    await page.waitForTimeout(1000);
    await expect(editor.statusMessage()).toHaveText(SaveStates.loggedOut.textHebrew, { timeout: 1000 });
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.loggedOut.tooltipHebrew, { timeout: 2000 });
    //simulate login
    await editor.simulateLogin(page.context());
    await page.reload();
    //check that connection loss is accurate in Hebrew
    // Simulate connection loss
    await editor.simulateOfflineMode();
    await editor.addText('Trigger connection loss');
    await expect(editor.statusMessage()).toHaveText(SaveStates.tryingToConnect.textHebrew, { timeout: 2000});
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.tryingToConnect.tooltipHebrew, { timeout: 2000 });
    await editor.simulateOnlineMode();
    await page.reload();
    //check that fifth state is accurate in Hebrew
    // Trigger catch-all error
    await editor.addText('Trigger unknown error');
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    await page.waitForTimeout(20000); 
    await expect(editor.statusMessage()).toHaveText(SaveStates.fifthState.textHebrew), { timeout: 2000,};
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', SaveStates.fifthState.tooltipHebrew, { timeout: 2000 });
  });
});