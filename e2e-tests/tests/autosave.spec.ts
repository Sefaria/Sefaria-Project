//login
//page works as expected
//links on hover/click work
//back key navigates as expected
//accessibility?

import {test, expect, Page, BrowserContext} from '@playwright/test';
import {loginUser, goToPageWithLang, goToPageWithUser, goToSourceSheetEditorWithUser} from "../utils";
import { SourceSheetEditorPage } from '../pages/sourceSheetEditor.page';

test.describe('generic tests for look and feel/accessibility', () => {
    test('links hover/click work in editor toolbar', async ({ browser }) => {});
    
    test('back key navigates as expected', async ({ browser }) => {});
    
    test('accessibility tests', async ({ browser }) => {});
});


test.describe('Source Sheet Autosave Feature Tests', () => {
    let page: Page;
    let editor: SourceSheetEditorPage;
    let context: BrowserContext;

    //before each test, login and go to the source sheet editor
    test.beforeEach(async ({ browser }) => {
        context = await browser.newContext();
        page = await goToSourceSheetEditorWithUser(context, '/sheets/new');
        editor = new SourceSheetEditorPage(page);
    });

    test('user logged out while typing with unsaved changes', async ({ browser }) => {
        //type new content
        await editor.typeInSheet('this is a test');
        //simulate logout
        await context.clearCookies();
        await page.reload();
        //validate user is logged out
        await expect(editor.getStatusText()).resolves.toContain('Logged Out');
        //try typing again
        await expect(editor.sourceSheetBody().isDisabled()).resolves.toBeTruthy();

    });

    test('user logged out while typing without unsaved changes', async ({ browser }) => {
        //simulate logout
        await context.clearCookies();
        await page.reload();
        //validate user is logged out
        await expect(editor.getStatusText()).resolves.toContain('Logged Out');
        //try typing again
        await expect(editor.sourceSheetBody().isDisabled()).resolves.toBeTruthy();
    });

    test('user logged in after logout with unsaved changes', async ({ browser }) => {
        //type new content
        await editor.typeInSheet('this is test before logout');
        //simulate logout
        await context.clearCookies();
        await page.reload();
        //validate user is logged out
        await expect(editor.getStatusText()).resolves.toContain('Logged Out');
        //simulate login
        await loginUser(page);
        await page.reload();
        //validate user is logged in
        const statusText = await editor.getStatusText();
        expect(['Saved', 'Saving']).toContain(statusText);
        //validate tooltip says correct message
        await editor.hoverStatus();
        const tooltipText = await editor.getTooltipText();
        expect(['Your sheet is saved to Sefaria', 'Your sheet is saving to Sefaria']).toContain(tooltipText);
        //try typing/making changes again
        await editor.typeInSheet('this is test after re-login');
        await expect(editor.sourceSheetBody().isEnabled()).resolves.toBeTruthy();
    });

    test('user logged in after logout without unsaved changes', async ({ browser }) => {
        //simulate logout
        await context.clearCookies();
        await page.reload();
        //validate user is logged out
        await expect(editor.getStatusText()).resolves.toContain('Logged Out');
        //simulate login
        await loginUser(page);
        await page.reload();
        //validate user is logged in
        await expect(editor.getStatusText()).resolves.toContain('Saved');
        //validate tooltip says correct message
        await editor.hoverStatus();
        expect(await editor.getTooltipText()).toBe('Your sheet is saved to Sefaria');
        //try typing/making changes again
        await editor.typeInSheet('this is test after re-login');
        await expect(editor.sourceSheetBody().isEnabled()).resolves.toBeTruthy();

    });

    test('connectivity lost when user clicks source/text/media/comment buttons', async ({ browser }) => {
        //simulate connectivity loss
        await context.setOffline(true);
        await page.waitForTimeout(3000);
        //click on source button
        await editor.clickAddSource();
        //expect error modal
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
        //click on text button
        await editor.clickAddText();
        //expect error modal
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
        //click on media button
        await editor.clickAddMedia();
        //expect error modal
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
        //click on comment button
        await editor.clickAddComment();
        //expect error modal
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
        //validate tooltip says correct message
        await editor.hoverStatus();
        const tooltipText = await editor.getTooltipText();
        expect(tooltipText).toBe('Trying to connect');
        //validate editing is disabled
        await expect(editor.sourceSheetBody().isDisabled()).resolves.toBeTruthy();
    });

    test('user dismisses error modal and tries again while offline', async ({ browser }) => {
        //simulate connectivity loss
        await context.setOffline(true);
        await page.waitForTimeout(3000);
        //click on source button
        await editor.clickAddSource();
        //expect error modal
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
        //dismiss error modal
        await editor.errorModal().getByRole('button', { name: 'OK' }).click();
        //click on source button again
        await editor.clickAddSource();
        //expect error modal
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
    });
    
    test('connectivity lost while typing with unsaved changes', async ({ browser }) => {
        //type new content
        await editor.typeInSheet('this is a test');
        //simulate connectivity loss
        await context.setOffline(true);
        await page.waitForTimeout(3000);
        //expect error/trying to connect modal
        await expect(editor.getStatusText()).resolves.toContain('Trying to Connect');
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
        //validate tooltip says correct message
        await editor.hoverStatus();
        const tooltipText = await editor.getTooltipText();
        expect(tooltipText).toBe('Trying to connect');
        //validate editing is disabled
        await expect(editor.sourceSheetBody().isDisabled()).resolves.toBeTruthy();
    });
    
    //very similar to above test
    test('connectivity lost while typing without unsaved changes', async ({ browser }) => {
        //simulate connectivity loss
        await context.setOffline(true);
        await page.waitForTimeout(3000);
        //expect error/trying to connect modal
        await expect(editor.getStatusText()).resolves.toContain('Trying to Connect');
        await expect(editor.errorModal().isVisible()).resolves.toBeTruthy();
        //validate tooltip says correct message
        await editor.hoverStatus();
        const tooltipText = await editor.getTooltipText();
        expect(tooltipText).toBe('Trying to connect');
        //validate editing is disabled
        await expect(editor.sourceSheetBody().isDisabled()).resolves.toBeTruthy();
    });

    test('connectivity restored while typing with unsaved changes', async ({ browser }) => {
        //type new content
        await editor.typeInSheet('this is a test');
        //simulate connectivity loss
        await context.setOffline(true);
        await page.waitForTimeout(3000);
        //simulate reconnect
        await context.setOffline(false);
        //validate state is saving or saved
        const statusText = await editor.getStatusText();
        expect(['Saved', 'Saving']).toContain(statusText);
        //validate correct tooltip
        await editor.hoverStatus();
        const tooltipText = await editor.getTooltipText();
        expect(['Your sheet is saved to Sefaria', 'Your sheet is saving to Sefaria']).toContain(tooltipText);
        //try typing/making changes again
        //validate user changes no longer blocked
        await editor.typeInSheet('this is test after reconnect');
        await expect(editor.sourceSheetBody().isEnabled()).resolves.toBeTruthy();
        //validate user is returned to same page
        const currentUrl = page.url();
        expect(currentUrl).toContain('/sheets/new');
    });

    test('connectivity restored while typing without unsaved changes', async ({ browser }) => {
        //simulate connectivity loss
        await context.setOffline(true);
        await page.waitForTimeout(3000);
        //simulate reconnect
        await context.setOffline(false);
        //validate state is saved
        await expect(editor.getStatusText()).resolves.toContain('Saved');
        //validate correct tooltip
        await editor.hoverStatus();
        expect(await editor.getTooltipText()).toBe('Your sheet is saved to Sefaria');
        //try typing/making changes again
        //validate user changes no longer blocked
        await editor.typeInSheet('this is test after reconnect');
        await expect(editor.sourceSheetBody().isEnabled()).resolves.toBeTruthy();
    });

    test('user attempts to close window/tab with unsaved changes', async ({ browser }) => {
        //type new content
        await editor.typeInSheet('this is a test');
        //simulate closing window/tab
        await page.close();
        //expect leave site modal
        await expect(editor.leaveSiteModal().isVisible()).resolves.toBeTruthy();
        //dismiss leave site modal
        await editor.leaveSiteModal().getByRole('button', { name: 'Leave' }).click();
        //expect user is logged out
        await expect(editor.getStatusText()).resolves.toContain('Logged Out');
    });

    test('status indicator appears in correct location', async ({ browser }) => {
        //check for status indicator in top left corner for English
        const statusIndicator = editor.statusIndicator();
        await expect(statusIndicator).toBeVisible();
        const statusIndicatorPosition = await statusIndicator.boundingBox();
        expect(statusIndicatorPosition).toEqual({ x: 0, y: 0 });
        
        //check for status indicator in top right corner for Hebrew
        await context.addCookies([{ name: 'sefaria_lang', value: 'he' }]);
        await page.reload();
        const statusIndicatorHebrew = editor.statusIndicator();
        await expect(statusIndicatorHebrew).toBeVisible();
        const statusIndicatorPositionHebrew = await statusIndicatorHebrew.boundingBox();
        expect(statusIndicatorPositionHebrew).toEqual({ x: 0, y: 0 });
        //check for status indicator stays "frozen" on the screen as you scroll
        await page.evaluate(() => {
            window.scrollTo(0, 1000);
        }
        );
        const statusIndicatorPositionAfterScroll = await statusIndicator.boundingBox();
        expect(statusIndicatorPositionAfterScroll).toEqual(statusIndicatorPosition);
    });
    
    //should this be split into individual tests for each of the states to test the triggers?
    test('status indicator shows correct text and icon', async ({ browser }) => {
        //check for status indicator text and icon
        const statusText = await editor.getStatusText();
        expect(statusText).toBe('Saved');
        const statusIcon = await editor.statusIndicator().getAttribute('src');
        expect(statusIcon).toContain('saved-icon.png');
        
        //check for status indicator text and icon while saving
        await editor.typeInSheet('this is a test');
        const statusTextSaving = await editor.getStatusText();
        expect(statusTextSaving).toBe('Saving');
        const statusIconSaving = await editor.statusIndicator().getAttribute('src');
        expect(statusIconSaving).toContain('saving-icon.png');
        //check for status indicator text and icon while trying to connect
        await context.setOffline(true);
        await page.waitForTimeout(3000);
        const statusTextTryingToConnect = await editor.getStatusText();
        expect(statusTextTryingToConnect).toBe('Trying to Connect');
        const statusIconTryingToConnect = await editor.statusIndicator().getAttribute('src');
        expect(statusIconTryingToConnect).toContain('trying-to-connect-icon.png');
        //check for status indicator text and icon while logged out
        await context.clearCookies();
        await page.reload();
        const statusTextLoggedOut = await editor.getStatusText();
        expect(statusTextLoggedOut).toBe('Logged Out');
        const statusIconLoggedOut = await editor.statusIndicator().getAttribute('src'); 
        expect(statusIconLoggedOut).toContain('logged-out-icon.png');
    });

    test('detection of lack of connection', async ({ browser }) => {});

    test('detection of return of internet connection', async ({ browser }) => {});
});



//specific for this feature:

//test user gets logged out while creating new/editing existing sheet

//-when there is unsaved text (user has been actively entering text)
//what should happen: block all user changes, show message/icon "you are logged out", sheet read-only until login

//--when there is no unsaved text (user has not been actively entering text for longer than automatic save period)
//what should happen: block all user changes, show message/icon "you are logged out", sheet read-only until login



//test user is logged in after being logged out while creating/editing

//-when there is unsaved text (user has been actively entering text)
//message/icon reverts back to saved or saving; tooltip: your sheet is saved in Sefaria
//user changes no longer blocked; user returned to same page that they were on when logged out

//when there is no unsaved text (user has not been actively entering text for longer than automatic save period)
//message/icon reverts back to saved or saving; tooltip: your sheet is saved in Sefaria
//user changes no longer blocked; user returned to same page that they were on when logged out



//test connectivity lost while creating/editing sheet

//-no connectivity when user clicks source, text, media or comment buttons and then attempts to enter text
//expected: Modal with text "Unfortunately an error has occurred. If you've recently edited text on this page, you may want to copy your recent work out of this page and click reload to ensure your work is properly saved."

//user dismisses "error has occurred" modal and tries second time while no connectivity
//expected: Modal with text "Unfortunately an error has occurred. If you've recently edited text on this page, you may want to copy your recent work out of this page and click reload to ensure your work is properly saved."

//user has been actively entering text- unsaved text
//expected: block all user changes, show message/icon "trying to connect", sheet read-only until reconnected

//user has not been actively entering text for longer than automatic save period- no unsaved text
//expected: block all user changes, show message/icon "trying to connect", sheet read-only until reconnected



//test connectivity restored while creating/editing sheet

//-when there is unsaved text (user has been actively entering text)
//message/icon reverts back to saved or saving; tooltip: your sheet is saved in Sefaria
//user changes no longer blocked; user returned to same page that they were on when connectivity was lost

//-when there is no unsaved text (user has not been actively entering text for longer than automatic save period)
//message/icon reverts back to saved; tooltip: your sheet is saved in Sefaria; user changes no longer blocked



//test user attempts to close window/tab while not in saved state
//-when there is unsaved text (user has been actively entering text)
//expected: Modal with text "Leave site? Changes you made might not be saved."



//test statuses/states
//all states: 
// Appear in top left corner for English, Appear in top right corner for Hebrew, Stay "frozen" on the screen as you scroll

//saved: 
//Triggers: Opening new/existing file; 3 seconds after user inactivity, reconnection to internet, return from authentication; 
// In top left, State (message and icon) Saved, Tooltip: Your sheet is saved in Sefaria; User changes not blocked (enable typing, buttons, etc.)"

//saving:
//Triggers: User types, pastes, or edits; every 2 seconds during activity
// In top left, State (message and icon) ""Saving""
//Tooltip?; User changes not blocked (enable typing, buttons, etc.)"

//trying to connect: 
//triggers: loss of connectivity detected while autosaving
//Block all user changes (disable typing, buttons, etc.)
//In top left, show message/icon: “Trying to Connect” / Login link; Tooltip?; Reconnect attempted every 3 seconds Is this accurate?"

//logged out: 
//triger: authentication lost (checked every 3 seconds)
//block all user changes; show message/icon: "You are logged out"; tooltip? ; remains like this until login occurs

//test detection of lack of connection
//test detection of return of internet connection