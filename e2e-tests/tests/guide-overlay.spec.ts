import { test, expect } from '@playwright/test';
import { GuideOverlayPage } from '../pages/guideOverlayPage';
import {
    goToPageWithUser,
    clearGuideOverlayCookie,
    setGuideOverlayCookie,
    hasGuideOverlayCookie,
    simulateSlowGuideLoading,
    waitForGuideOverlay,
    waitForGuideOverlayToClose,
    changeLanguageLoggedIn
} from '../utils';
import { LANGUAGES, testUser } from '../globals';

// Guide-overlay specific navigation function to avoid modifying shared utils
const goToSheetEditorWithUser = async (context: any, user = testUser) => {
    // Use environment variables if available
    const actualUser = {
        email: process.env.LOGIN_USERNAME || user.email,
        password: process.env.LOGIN_PASSWORD || user.password,
    };
    
    const page = await goToPageWithUser(context, '/sheets/new', actualUser);
    // Wait for sheet editor to load - use the correct selector from SourceSheetEditorPage
    await page.waitForSelector('.sheetContent', { timeout: 10000 });
    return page;
};

test.describe('Guide Overlay', () => {
    
    test.beforeEach(async ({ context }) => {
        // Clear any existing guide cookies before each test to ensure clean state
        await context.clearCookies();
    });

    test('TC001: Guide shows on first visit to sheet editor', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Guide should appear automatically on first visit
        await guideOverlay.waitForLoaded();
        await expect(guideOverlay.overlay()).toBeVisible();
        
        // Should show title and content
        const title = await guideOverlay.getCurrentTitle();
        expect(title).toBeTruthy();
        
        const text = await guideOverlay.getCurrentText();
        expect(text).toBeTruthy();
    });

    test('TC002: Guide doesn\'t show on repeat visits', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // First visit - guide should appear
        await guideOverlay.waitForLoaded();
        await guideOverlay.close();
        
        // Refresh the page
        await page.reload();
        await page.waitForSelector('.sheetContent');
        
        // Guide should not appear on second visit
        await expect(guideOverlay.overlay()).not.toBeVisible();
        
        // Cookie should exist
        expect(await hasGuideOverlayCookie(page, 'editor')).toBe(true);
    });

    test('TC003: Force show button displays guide', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // First visit - close the guide
        await guideOverlay.waitForLoaded();
        await guideOverlay.close();
        
        // Click the guide button to force show
        await guideOverlay.clickGuideButton();
        
        // Guide should reappear
        await guideOverlay.waitForLoaded();
        await expect(guideOverlay.overlay()).toBeVisible();
    });

    test('TC004: Navigate between guide cards', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        await guideOverlay.waitForLoaded();
        
        // Get initial card info
        const initialTitle = await guideOverlay.getCurrentTitle();
        const initialPagination = await guideOverlay.getPaginationText();
        
        // Navigate to next card (if navigation is available)
        if (await guideOverlay.isNavigationVisible()) {
            await guideOverlay.navigateNext();
            
            // Content should change
            const newTitle = await guideOverlay.getCurrentTitle();
            const newPagination = await guideOverlay.getPaginationText();
            
            expect(newTitle).not.toBe(initialTitle);
            expect(newPagination).not.toBe(initialPagination);
        } else {
            // If no navigation, it means there's only one card
            expect(initialPagination).toContain('1 of 1');
        }
    });

    test('TC005: Circular navigation works', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        await guideOverlay.waitForLoaded();
        
        if (await guideOverlay.isNavigationVisible()) {
            const initialTitle = await guideOverlay.getCurrentTitle();
            const paginationText = await guideOverlay.getPaginationText();
            
            // Extract total cards from pagination (e.g., "1 of 3")
            const totalCardsMatch = paginationText.match(/of (\d+)/);
            if (totalCardsMatch) {
                const totalCards = parseInt(totalCardsMatch[1]);
                
                if (totalCards > 1) {
                    // Navigate through all cards to reach the last one
                    for (let i = 1; i < totalCards; i++) {
                        await guideOverlay.navigateNext();
                    }
                    
                    // Now we're on the last card, click next to wrap to first
                    await guideOverlay.navigateNext();
                    
                    // Should be back to the first card
                    const finalTitle = await guideOverlay.getCurrentTitle();
                    expect(finalTitle).toBe(initialTitle);
                    
                    // Test reverse direction - from first card, go previous to last
                    await guideOverlay.navigatePrevious();
                    const finalPagination = await guideOverlay.getPaginationText();
                    expect(finalPagination).toContain(`${totalCards} of ${totalCards}`);
                }
            }
        }
    });

    test('TC006: Close button dismisses guide', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        await guideOverlay.waitForLoaded();
        
        // Close the guide
        await guideOverlay.close();
        
        // Guide should be hidden
        await expect(guideOverlay.overlay()).not.toBeVisible();
        
        // Cookie should be set
        expect(await hasGuideOverlayCookie(page, 'editor')).toBe(true);
        
        // Refresh page and confirm guide doesn't reappear
        await page.reload();
        await page.waitForSelector('.sheetContent');
        await expect(guideOverlay.overlay()).not.toBeVisible();
    });

    test('TC007: Video displays correctly', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        await guideOverlay.waitForLoaded();
        
        // Video should be visible and have source
        expect(await guideOverlay.isVideoDisplayed()).toBe(true);
        
        const videoSrc = await guideOverlay.getVideoSrc();
        expect(videoSrc).toBeTruthy();
        expect(videoSrc).toMatch(/^https?:\/\//); // Should be a valid URL
        
        // Video should have controls
        expect(await guideOverlay.hasVideoControls()).toBe(true);
    });

    test('TC008: Footer links are clickable', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        await guideOverlay.waitForLoaded();
        
        const footerLinksCount = await guideOverlay.getFooterLinksCount();
        
        if (footerLinksCount > 0) {
            // Test first footer link
            const linkText = await guideOverlay.getFooterLinkText(0);
            const linkUrl = await guideOverlay.getFooterLinkUrl(0);
            
            expect(linkText).toBeTruthy();
            expect(linkUrl).toBeTruthy();
            expect(linkUrl).toMatch(/^https?:\/\//); // Should be a valid URL
            
            // Listen for new page/tab opening
            const [newPage] = await Promise.all([
                context.waitForEvent('page'),
                guideOverlay.clickFooterLink(0)
            ]);
            
            // Verify new page opens to correct URL
            expect(newPage.url()).toBe(linkUrl);
            await newPage.close();
        }
    });

    test('TC009: Text content renders properly', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        await guideOverlay.waitForLoaded();
        
        // Text should be present and non-empty
        const textContent = await guideOverlay.getCurrentText();
        expect(textContent).toBeTruthy();
        expect(textContent.trim().length).toBeGreaterThan(0);
        
        // Title should be present
        const titleContent = await guideOverlay.getCurrentTitle();
        expect(titleContent).toBeTruthy();
        
        // Title prefix should be present
        const prefixContent = await guideOverlay.getTitlePrefix();
        expect(prefixContent).toBeTruthy();
    });

    test('TC010: Loading state appears', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // We should see loading state initially
        await expect(guideOverlay.overlay()).toBeVisible();
        
        // Wait for loading to complete
        await guideOverlay.waitForLoaded();
        
        // Loading should be gone and content should be visible
        expect(await guideOverlay.isLoading()).toBe(false);
        await expect(guideOverlay.content()).toBeVisible();
    });

    test('TC011: Timeout handling works', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        
        // Set up slow loading and clear cookie to force guide to show
        await clearGuideOverlayCookie(page, 'editor');
        await simulateSlowGuideLoading(page, 8000); // 8 seconds - longer than default 7s timeout
        
        // Listen for alert dialog
        let alertMessage = '';
        page.on('dialog', async dialog => {
            alertMessage = dialog.message();
            await dialog.accept();
        });
        
        // Refresh to trigger the guide with slow loading
        await page.reload();
        await page.waitForSelector('.sheetContent', { timeout: 10000 });
        
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Guide should timeout and close automatically
        await waitForGuideOverlayToClose(page, 15000); // Wait up to 15 seconds
        
        // Should have shown alert
        expect(alertMessage).toContain('Something went wrong');
    });

    test('TC012: Hebrew content displays correctly', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        
        // Switch to Hebrew interface
        await changeLanguageLoggedIn(page, LANGUAGES.HE);
        
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.HE);
        await guideOverlay.waitForLoaded();
        
        // Content should be visible
        await expect(guideOverlay.overlay()).toBeVisible();
        
        // Should have Hebrew content
        const titleContent = await guideOverlay.getCurrentTitle();
        const textContent = await guideOverlay.getCurrentText();
        
        expect(titleContent).toBeTruthy();
        expect(textContent).toBeTruthy();
        
        // Check RTL layout by verifying CSS class
        const hasHebrewInterface = await page.locator('body.interface-hebrew').isVisible();
        expect(hasHebrewInterface).toBe(true);
    });

    test('TC013: Guide only shows in sheet editor', async ({ context }) => {
        // Test that guide button is NOT visible on regular reader pages
        const readerPage = await goToPageWithUser(context, '/Genesis.1.1');
        const readerGuideOverlay = new GuideOverlayPage(readerPage, LANGUAGES.EN);
        
        await readerPage.waitForSelector('.readerPanel');
        
        // Guide button should not be visible on reader page
        expect(await readerGuideOverlay.isGuideButtonVisible()).toBe(false);
        
        // Navigate to sheet editor
        const sheetPage = await goToSheetEditorWithUser(context);
        const sheetGuideOverlay = new GuideOverlayPage(sheetPage, LANGUAGES.EN);
        
        // Guide button should be visible in sheet editor
        expect(await sheetGuideOverlay.isGuideButtonVisible()).toBe(true);
        
        await readerPage.close();
    });

    test('TC014: Guide button only visible when appropriate', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Guide button should be visible in sheet editor
        expect(await guideOverlay.isGuideButtonVisible()).toBe(true);
        
        // Guide overlay should appear on first visit
        await guideOverlay.waitForLoaded();
        await expect(guideOverlay.overlay()).toBeVisible();
        
        // Close guide
        await guideOverlay.close();
        
        // Guide button should still be visible after closing guide
        expect(await guideOverlay.isGuideButtonVisible()).toBe(true);
    });
}); 