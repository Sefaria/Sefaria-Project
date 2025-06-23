import { test, expect } from '@playwright/test';
import { SourceSheetEditorPage } from '../pages/sourceSheetEditor.page';
import { LoginPage } from '../pages/loginPage';
import {goToPageWithUser, loginUser, hideModals, isClickable, hideTopBanner, changeLanguageLoggedOut, changeLanguageLoggedIn} from "../utils";
import { LANGUAGES, testUser } from '../globals';


// Support environment variable for cross-environment testing
const TEST_URL = process.env.BASE_URL?.replace(/\/$/, '') || 'https://save-editor.cauldron.sefaria.org';
//const TEST_URL = 'http://2415.coolifydev.sefaria.org';


test.describe('Source Sheet Editor - Autosave and Session Status', () => {
  
  test.beforeEach(async ({ page }) => {
    // Support environment variables while maintaining backwards compatibility
    const user = {
      email: process.env.LOGIN_USERNAME || testUser.email,
      password: process.env.LOGIN_PASSWORD || testUser.password,
    };
    
    const loginPage = new LoginPage(page, LANGUAGES.EN);
    await page.goto(`${TEST_URL}/login`);
    await loginPage.ensureLanguage(LANGUAGES.EN);  // Switch to English
    await loginPage.loginAs(user.email ?? '', user.password ?? '');
    await hideModals(page);
    // Now navigate to Source Sheet Editor
    await page.goto(`${TEST_URL}/sheets/new`, { waitUntil: 'domcontentloaded' });
    await changeLanguageLoggedIn(page, LANGUAGES.EN);
    
    // Wait for sheet content
    await page.waitForSelector('.sheetContent', { timeout: 10000 });
    
    // Additional safety: call hideModals again after language change to ensure guide is dismissed
    await hideModals(page);
  });

  test('User actively typing, then gets logged out', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    //await editor.addSampleSource(); //had problem with adding sources/media because of naming conflicts
    await editor.focusTextInput(); 
      // Begin typing but pause before autosave could kick in
      await page.keyboard.type('Testing logout with unsaved changes', { delay: 100 });
      await hideModals(page);
      await hideTopBanner(page); //currently does not work without this
      // Immediately simulate logout
      await editor.simulateLogout(page.context());
      // Wait until the logout state is visible in the UI
      await expect(editor.statusMessage()).toHaveText(/User Logged out/i, { timeout: 10000 }); //used to say status indicator
      // Optionally hover to simulate interaction
      await editor.statusIndicator().hover();
      // Check the `title` attribute
      await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'You are not logged in to Sefaria');
      //await expect(editor.getTooltipText()).toContain('You are not logged in to Sefaria');
      await editor.assertSaveStateIndicatorIsOnTop();
      // Confirm editing is now blocked
      await editor.validateEditingIsBlocked();    
  });
    
  test('User idle before logout, no unsaved changes', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    //await editor.addSampleSource();
    await editor.addText('Saved text');
    //await editor.addText('Testing logout with no unsaved changes');
    await editor.waitForAutosave();
     // Close popup if it appears
    await hideModals(page);
    await hideTopBanner(page); //currently does not work without this
    await page.waitForTimeout(500);
    // Simulate logout
    await editor.simulateLogout(page.context());
    await hideModals(page);
    //trigger logout detection
    await editor.addText('trigger logout detection');
    await page.waitForTimeout(500);
    //status inicator checks
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.statusMessage()).toHaveText(/User Logged out/i, { timeout: 10000 });
    await editor.statusIndicator().hover();
    //check tooltip
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'You are not logged in to Sefaria');
    // Confirm editing is now blocked
    await editor.validateEditingIsBlocked();
  });
  
  

  test('User logs back (restore cookie) in and resumes editing', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('text before logout');
    await editor.waitForAutosave();
    await hideTopBanner(page); //currently does not work without this
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
    await expect(editor.statusMessage()).toHaveText(/saved|saving/i); //used to say status indicator
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'Your sheet is saved to Sefaria');
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
    await expect(editor.statusMessage()).toHaveText(/saved|saving/i); //used to say status indicator
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'Your sheet is saved to Sefaria');
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
    await editor.loginLink().click();
    await loginUser(page);
    //await page.reload();
    await expect(editor.statusMessage()).toHaveText(/saved|saving/i); //used to say status indicator
    await editor.statusIndicator().hover();
    // Check the `title` attribute
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'Your sheet is saved to Sefaria');
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.sourceSheetBody()).toBeEnabled();
    await editor.addText('text after login');

  });

  test('Connectivity lost while entering text', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page); //currently does not work without this
    await editor.addText('Testing connection loss');
    //await page.route('**/*', route => route.abort()); // Simulate offline
    await editor.simulateOfflineMode();
    await editor.addText('trigger connection loss');
    await page.waitForTimeout(500);
    await expect(editor.statusMessage()).toHaveText(/Trying to connect/); //used to say status indicator
    await editor.statusIndicator().hover();
    // Check the `title` attribute
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'No internet connection detected');
    await editor.validateEditingIsBlocked();
    //await expect(editor.sourceSheetBody()).toBeDisabled();
  });

  test('Connectivity restored after being lost', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await editor.addText('Testing connection recovery');
    await hideTopBanner(page); //currently does not work without this

    //await page.route('**/*', route => route.abort());
    editor.simulateOfflineMode();
    await editor.addText('trigger connection loss');
    await page.waitForTimeout(500);
    await expect(editor.statusMessage()).toHaveText(/Trying to connect/); //used to say status indicator
    await editor.statusIndicator().hover();
    // Check the `title` attribute
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'No internet connection detected');
    await editor.simulateOnlineMode();
    await page.waitForTimeout(2000);
    await editor.waitForConnectionState('online');
    await expect(editor.statusMessage()).toHaveText(/saved|saving/i);
    await editor.statusIndicator().hover();
    // Check the `title` attribute
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'Your sheet is saved to Sefaria');
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.sourceSheetBody()).toBeEnabled();
  });

 
  test('unsaved changes trigger beforeunload prompt on any exit action', async ({ page }) => {
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
    await editor.addText('Trigger unknown error');
    // Trigger catch-all error
    await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    await page.waitForTimeout(20000); 
    //await hideTopBanner(page); // Re-hide in case it reappeared
    // Confirm autosave attempted
    //await editor.assertSaveStateIndicatorIsOnTop();
    //await expect(editor.statusMessage()).toHaveText(/saving/i, { timeout: 5000 });
    //await hideTopBanner(page); 
    // Wait for catch-all error message
    await expect(editor.statusMessage()).toHaveText(/Something went wrong. Try refreshing the page/i, { timeout: 20000,});
    // Hover and check tooltip
    await editor.statusIndicator().hover();
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'If this problem persists, contact us at hello@sefaria.org');
    // Confirm editing is now blocked
    await editor.validateEditingIsBlocked();
    // Leaving page should now trigger alert
    const promptTriggered = await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      return !window.dispatchEvent(e);
    });
    expect(promptTriggered).toBe(true);
  });

  test('Save state indicators work in Hebrew', async ({ page }) => {
    const editor = new SourceSheetEditorPage(page);
    await hideTopBanner(page); //currently does not work without this
    await changeLanguageLoggedIn(page, LANGUAGES.HE);
    await editor.addText('test saving saved hebrew');
    await editor.assertSaveStateIndicatorIsOnTop();
    await expect(editor.statusMessage()).toHaveText(/נשמר|שומר/i);
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label','כעת מתבצעת שמירת השינויים שלך בספריא', { timeout: 2000 });
   // await editor.waitForAutosave();
    await expect(editor.statusMessage()).toHaveText(/נשמר/i); 
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'דף המקורות שלך שמור בספריא');
    await hideTopBanner(page); //currently does not work without this
    await page.reload();
    //simulate logout
    // const originalValue = await editor.simulateLogout(page.context());
    // await page.waitForTimeout(500);
    // if (originalValue === null) {
    //     throw new Error("originalValue cannot be null");
    // }
    await editor.simulateLogout(page.context());
    await editor.addText('trigger logout');
    await page.waitForTimeout(500);
    await expect(editor.statusMessage()).toHaveText(/בוצעה התנתקות מהמערכת/i);
    //simulate login
    await editor.simulateLogin(page.context());
    await page.reload();
    // Simulate connection loss
    await editor.simulateOfflineMode();
    await editor.addText('Trigger connection loss');
    await expect(editor.statusMessage()).toHaveText(/ניסיון התחברות/i);
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'לא זוהה חיבור לאינטרנט');
    await editor.simulateOnlineMode();
    await page.reload();
     // Trigger catch-all error
     await editor.addText('Trigger unknown error');
     await page.evaluate(() => {
      (window as any).Sefaria.testUnkownNewEditorSaveError = true;
    });
    await page.waitForTimeout(20000); 
    await expect(editor.statusMessage()).toHaveText(/משהו השתבש. יש לנסות לרענן את העמוד/i), { timeout: 20000,};
    await expect(editor.statusIndicator()).toHaveAttribute('aria-label', 'אם הבעיה נמשכת, נסו שוב מאוחר יותר וצרו איתנו קשר בכתובת hello@sefaria.org');
  });
  
  

});