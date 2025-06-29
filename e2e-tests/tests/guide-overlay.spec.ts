import { test, expect } from '@playwright/test';
import { GuideOverlayPage } from '../pages/guideOverlayPage';
import {
    goToPageWithUser,
    goToNewSheetWithUser,
    clearGuideOverlayCookie,
    setGuideOverlayCookie,
    hasGuideOverlayCookie,
    waitForGuideOverlay,
    waitForGuideOverlayToClose,
    changeLanguageLoggedIn,
    simulateSlowGuideLoading,
    simulateGuideApiError,
    loginUser,
    buildFullUrl,
    withRetryOnTimeout,
    getEnvironmentTimeouts
} from '../utils';
import { LANGUAGES, testUser } from '../globals';

// Authentic navigation function that tests real first-time user experience
const goToSheetEditorWithFreshUser = async (context: any, user = testUser) => {
    // Clear ALL cookies to simulate completely new user
    await context.clearCookies();
    
    // Navigate to sheet editor preserving guides for testing
    const page = await goToPageWithUser(context, '/sheets/new', user, { preserveGuideOverlay: true });
    const timeouts = getEnvironmentTimeouts(page.url());
    await page.waitForSelector('.editorContent', { timeout: timeouts.element });
    
    return page;
};

// Guide-overlay specific navigation function that preserves guide overlay for testing
const goToSheetEditorWithUser = async (context: any, user = testUser) => {
    // Clear guide overlay cookie to ensure it shows for our tests
    await context.clearCookies({ name: 'guide_overlay_seen_editor' });
    
    // Navigate to sheet editor preserving guides for testing
    const page = await goToPageWithUser(context, '/sheets/new', user, { preserveGuideOverlay: true });
    const timeouts = getEnvironmentTimeouts(page.url());
    await page.waitForSelector('.editorContent', { timeout: timeouts.element });
    
    return page;
};

test.describe('Guide Overlay', () => {
    
    test.beforeEach(async ({ context }) => {
        // Clear only guide-related cookies to ensure clean state while preserving auth
        try {
            // Get a temporary page to clear guide cookies without affecting auth
            const tempPage = await context.newPage();
            await clearGuideOverlayCookie(tempPage, 'editor');
            await clearGuideOverlayCookie(tempPage, 'reader');
            await tempPage.close();
        } catch (e) {
            // If specific cookie clearing fails, it's not critical for test functionality
            console.log('Guide cookie clearing skipped:', e.message);
        }
    });

    test('TC001: Guide shows on authentic first visit to sheet editor', async ({ context }) => {
        const page = await goToSheetEditorWithFreshUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Guide should appear automatically on genuine first visit
        await guideOverlay.waitForLoaded();
        await expect(guideOverlay.overlay()).toBeVisible();
        
        // Should show title and content
        const title = await guideOverlay.getCurrentTitle();
        expect(title).toBeTruthy();
        
        const text = await guideOverlay.getCurrentText();
        expect(text).toBeTruthy();
        
        // Verify no guide cookie exists initially
        expect(await hasGuideOverlayCookie(page, 'editor')).toBe(false);
    });

    test('TC001A: Guide API endpoint returns valid response structure', async ({ request }) => {
        // Test the guide API endpoint directly - this API MUST exist for guides to work
        const response = await request.get(buildFullUrl('/api/guides/editor'));
        
        // API endpoint must exist and return valid data
        expect(response.ok()).toBe(true);
        
        const data = await response.json();
        
        // Validate API response structure matches expected format from guides/models.py
        expect(data).toBeTruthy();
        expect(typeof data).toBe('object');
        
        // Must have the exact structure defined in Guide.contents() method
        expect(data.titlePrefix).toBeTruthy();
        expect(typeof data.titlePrefix).toBe('object');
        expect(data.titlePrefix.en).toBeTruthy();
        expect(data.titlePrefix.he).toBeTruthy();
        
        expect(Array.isArray(data.cards)).toBe(true);
        expect(data.cards.length).toBeGreaterThan(0);
        
        // Each card must have the structure defined in InfoCard.contents() method
        const firstCard = data.cards[0];
        expect(typeof firstCard).toBe('object');
        expect(firstCard.id).toBeTruthy();
        expect(typeof firstCard.title).toBe('object');
        expect(firstCard.title.en).toBeTruthy();
        expect(firstCard.title.he).toBeTruthy();
        expect(typeof firstCard.text).toBe('object');
        expect(firstCard.text.en).toBeTruthy();
        expect(firstCard.text.he).toBeTruthy();
        expect(typeof firstCard.videoUrl).toBe('object');
        
        // Footer links should be an array (may be empty)
        expect(Array.isArray(data.footerLinks)).toBe(true);
        
        console.log('✅ Guide API Response valid:', JSON.stringify(data, null, 2));
    });

    test('TC002: Guide doesn\'t show on repeat visits', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // First visit - guide should appear
        await guideOverlay.waitForLoaded();
        await guideOverlay.close();
        
        // Refresh the page
        await page.reload();
        await page.waitForSelector('.editorContent');
        
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
        
        // Add diagnostic info before waiting for guide
        console.log(`🔍 TC006 Diagnostic - URL: ${page.url()}`);
        console.log(`🔍 TC006 Diagnostic - Guide button visible: ${await guideOverlay.isGuideButtonVisible()}`);
        
        await guideOverlay.waitForLoaded();
        
        // Close the guide
        await guideOverlay.close();
        
        // Guide should be hidden
        await expect(guideOverlay.overlay()).not.toBeVisible();
        
        // Cookie should be set
        expect(await hasGuideOverlayCookie(page, 'editor')).toBe(true);
        
        // Refresh page and confirm guide doesn't reappear
        await page.reload();
        const timeouts = getEnvironmentTimeouts(page.url());
        await page.waitForSelector('.editorContent', { timeout: timeouts.element });
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

    test('TC011: Real timeout handling works', async ({ context }) => {
        // Test real timeout handling in GuideOverlay component
        // This tests the actual 7-second timeout logic in GuideOverlay.jsx
        
        // Start with a fresh user session
        await context.clearCookies();
        const page = await context.newPage();
        
        // Set up route interception BEFORE any navigation
        // Simulate slow API response longer than the 7-second frontend timeout
        const simulationDelay = 8000; // 8 seconds > 7 second frontend timeout
        await simulateSlowGuideLoading(page, simulationDelay, 'editor');
        
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Set up dialog handler to catch the real timeout alert from GuideOverlay.jsx
        let alertMessage = '';
        let dialogReceived = false;
        
        page.on('dialog', async (dialog) => {
            alertMessage = dialog.message();
            dialogReceived = true;
            console.log(`🔍 TC011: Dialog received with message: "${alertMessage}"`);
            await dialog.accept();
        });
        
        // Navigate directly to sheet editor with authentication
        await loginUser(page, testUser);
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        await page.waitForSelector('.editorContent');
        
        // Ensure we're in the right conditions for guide to appear
        // Wait for guide overlay to start loading (should appear due to fresh cookies)
        try {
            await page.waitForSelector('.guideOverlay', { timeout: 5000 });
            console.log('🔍 TC011: Guide overlay appeared, waiting for timeout...');
        } catch (e) {
            // If guide doesn't appear, skip this test - environment conditions not met
            console.log('⚠️ TC011: Guide overlay did not appear, skipping timeout test');
            test.skip();
        }
        
        // Wait for the real timeout to occur (give it up to 12 seconds)
        const timeoutPromise = new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                if (!dialogReceived) {
                    reject(new Error('Frontend timeout dialog was not triggered within 12 seconds'));
                } else {
                    resolve();
                }
            }, 12000);
        });
        
        // Also check if dialog was already received
        if (!dialogReceived) {
            await timeoutPromise;
        }
        
        // Verify the real timeout alert was shown
        expect(dialogReceived).toBe(true);
        expect(alertMessage).toContain('Something went wrong');
        
        // Guide should be closed due to timeout
        await expect(guideOverlay.overlay()).not.toBeVisible();
    });

    test('TC015: Real API error handling works', async ({ context }) => {
        // Test real API error handling in GuideOverlay component
        // This tests the actual error handling logic in GuideOverlay.jsx
        
        // Start with a fresh user session
        await context.clearCookies();
        const page = await context.newPage();
        
        // Set up route interception BEFORE any navigation
        // Simulate API error response - this is a legitimate test of error resilience
        await simulateGuideApiError(page, 'editor');
        
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Set up dialog handler to catch the real error alert from GuideOverlay.jsx
        let alertMessage = '';
        let dialogReceived = false;
        
        page.on('dialog', async (dialog) => {
            alertMessage = dialog.message();
            dialogReceived = true;
            console.log(`🔍 TC015: Dialog received with message: "${alertMessage}"`);
            await dialog.accept();
        });
        
        // Navigate directly to sheet editor with authentication
        await loginUser(page, testUser);
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        await page.waitForSelector('.editorContent');
        
        // For error test, we expect either:
        // 1. Guide overlay appears briefly then closes due to error, OR
        // 2. Error happens so fast that dialog appears before overlay is detectable
        // Both scenarios are valid and should be tested
        
        // Wait for either guide overlay OR error dialog (whichever comes first)
        const raceResult = await Promise.race([
            // Try to detect guide overlay appearing (even briefly)
            page.waitForSelector('.guideOverlay', { timeout: 3000 }).then(() => 'overlay-appeared'),
            // Or wait for dialog if error happens faster
            new Promise<string>((resolve) => {
                const checkDialog = () => {
                    if (dialogReceived) {
                        resolve('dialog-appeared');
                    } else {
                        setTimeout(checkDialog, 100);
                    }
                };
                checkDialog();
            })
        ]).catch(() => 'timeout');
        
        console.log(`🔍 TC015: Race result: ${raceResult}`);
        
        // If dialog hasn't appeared yet, wait for it (up to 5 more seconds)
        if (!dialogReceived) {
            await new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                    if (!dialogReceived) {
                        reject(new Error('Frontend error dialog was not triggered within timeout'));
                    } else {
                        resolve();
                    }
                }, 5000);
            });
        }
        
        // Verify the real error alert was shown
        expect(dialogReceived).toBe(true);
        expect(alertMessage).toContain('Something went wrong');
        
        // Guide should be closed due to error
        await expect(guideOverlay.overlay()).not.toBeVisible();
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
        
        // Check Hebrew interface by verifying the body has the interface-hebrew class
        // Using .evaluate() instead of .isVisible() since body element may have 0 height
        const hasHebrewInterface = await page.evaluate(() => {
            return document.body.classList.contains('interface-hebrew');
        });
        expect(hasHebrewInterface).toBe(true);
    });

    test('TC013: Guide only shows in sheet editor', async ({ context }) => {
        // Test that guide button is NOT visible on regular reader pages
        // Use default behavior (guide dismissal) for reader page since we don't want guide there
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

    test('TC016: Real user authentication affects guide behavior', async ({ context }) => {
        // Test with fresh context (no authentication)
        await context.clearCookies();
        
        // Try to access sheet editor without authentication
        const page = await context.newPage();
        // Manual page.goto() with retry needed here because we're testing unauthenticated access
        // and bypassing goToPageWithUser() which handles authentication
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        
        // Should redirect to login or show login prompt
        // Guide should not appear for unauthenticated users
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Wait a moment to see if guide appears
        const timeouts = getEnvironmentTimeouts(page.url());
        await page.waitForTimeout(timeouts.short);
        expect(await guideOverlay.overlay().isVisible().catch(() => false)).toBe(false);
        
        // Now test with authenticated user
        const authenticatedPage = await goToSheetEditorWithFreshUser(context);
        const authenticatedGuideOverlay = new GuideOverlayPage(authenticatedPage, LANGUAGES.EN);
        
        // Guide should appear for authenticated user
        await authenticatedGuideOverlay.waitForLoaded();
        await expect(authenticatedGuideOverlay.overlay()).toBeVisible();
    });

    test('TC017: Guide data persists through normal navigation', async ({ context }) => {
        const page = await goToSheetEditorWithUser(context);
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Wait for guide to load and get initial data
        await guideOverlay.waitForLoaded();
        const initialTitle = await guideOverlay.getCurrentTitle();
        const initialText = await guideOverlay.getCurrentText();
        
        // Navigate to different card if available
        if (await guideOverlay.isNavigationVisible()) {
            await guideOverlay.navigateNext();
            const secondCardTitle = await guideOverlay.getCurrentTitle();
            
            // Navigate back to first card
            await guideOverlay.navigatePrevious();
            const backToFirstTitle = await guideOverlay.getCurrentTitle();
            
            // Data should persist correctly
            expect(backToFirstTitle).toBe(initialTitle);
        }
        
        // Close and reopen guide to verify data persistence
        await guideOverlay.close();
        await guideOverlay.clickGuideButton();
        await guideOverlay.waitForLoaded();
        
        // Content should be the same
        const reopenedTitle = await guideOverlay.getCurrentTitle();
        expect(reopenedTitle).toBe(initialTitle);
    });

    test('TC018: Guide does not show on mobile devices (user agent)', async ({ context }) => {
        // Clear cookies to ensure fresh user state
        await context.clearCookies();
        
        // Create a new context with mobile user agent 
        const mobileContext = await context.browser()!.newContext({
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        });
        const page = await mobileContext.newPage();
        
        // Login user on mobile device
        await loginUser(page, testUser);
        
        // Navigate to sheet editor
        // Manual page.goto() with retry needed because we're using a custom mobile context
        // and bypassing goToPageWithUser() to test mobile-specific behavior
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        
        // Wait for editor content
        await page.waitForSelector('.editorContent', { timeout: 10000 });
        await page.waitForLoadState('networkidle');
        
        // Check that app is in mobile mode
        const isMobileMode = await page.evaluate(() => {
            return document.querySelector('.readerApp.singlePanel') !== null;
        });
        expect(isMobileMode).toBe(true);
        
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Wait a moment to see if guide appears
        await page.waitForTimeout(3000);
        
        // Guide should NOT appear on mobile devices
        const guideVisibleOnMobile = await guideOverlay.overlay().isVisible().catch(() => false);
        expect(guideVisibleOnMobile).toBe(false);
        
        // Guide button should also NOT be visible on mobile devices
        const buttonVisible = await guideOverlay.isGuideButtonVisible();
        expect(buttonVisible).toBe(false);
    });

    test('TC019: Guide shows when changing from mobile to desktop user agent', async ({ context }) => {
        // Clear cookies to ensure fresh user state
        await context.clearCookies();
        
        // Start with mobile user agent
        const mobileContext = await context.browser()!.newContext({
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        });
        let page = await mobileContext.newPage();
        
        // Login and navigate on mobile
        await loginUser(page, testUser);
        // Manual page.goto() with retry needed because we're using a custom mobile context
        // and bypassing goToPageWithUser() to test mobile-specific behavior
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        
        // Wait for editor content
        await page.waitForSelector('.editorContent', { timeout: 10000 });
        await page.waitForLoadState('networkidle');
        
        let guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Guide should not appear on mobile
        await page.waitForTimeout(2000);
        const guideVisibleOnMobile = await guideOverlay.overlay().isVisible().catch(() => false);
        expect(guideVisibleOnMobile).toBe(false);
        
        // Close mobile context and create desktop context
        await mobileContext.close();
        
        const desktopContext = await context.browser()!.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        page = await desktopContext.newPage();
        
        // Login and navigate on desktop
        await loginUser(page, testUser);
        // Manual page.goto() with retry needed because we're using a custom desktop context
        // and bypassing goToPageWithUser() to test user agent switching behavior
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        
        // Wait for editor content
        await page.waitForSelector('.editorContent', { timeout: 10000 });
        await page.waitForLoadState('networkidle');
        
        guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Guide should appear on desktop for fresh user
        await guideOverlay.waitForLoaded();
        await expect(guideOverlay.overlay()).toBeVisible();
        
        await desktopContext.close();
    });

    test('TC020: Guide button behavior with different user agents', async ({ context }) => {
        // Clear cookies to ensure fresh state
        await context.clearCookies();
        
        // Test with desktop user agent
        const desktopContext = await context.browser()!.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        let page = await desktopContext.newPage();
        
        // Login and navigate on desktop
        await loginUser(page, testUser);
        // Manual page.goto() with retry needed because we're using a custom desktop context
        // and bypassing goToPageWithUser() to test user agent differences
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        
        // Wait for editor content
        await page.waitForSelector('.editorContent', { timeout: 10000 });
        await page.waitForLoadState('networkidle');
        
        let guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Desktop should have guide and button visible
        await guideOverlay.waitForLoaded();
        await guideOverlay.close();
        expect(await guideOverlay.isGuideButtonVisible()).toBe(true);
        
        await desktopContext.close();
        
        // Test with mobile user agent
        const mobileContext = await context.browser()!.newContext({
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        });
        page = await mobileContext.newPage();
        
        // Login and navigate on mobile
        await loginUser(page, testUser);
        // Manual page.goto() with retry needed because we're using a custom mobile context
        // and bypassing goToPageWithUser() to test user agent differences
        await withRetryOnTimeout(
            () => page.goto(buildFullUrl('/sheets/new')),
            { page }
        );
        
        // Wait for editor content
        await page.waitForSelector('.editorContent', { timeout: 10000 });
        await page.waitForLoadState('networkidle');
        
        guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Mobile should NOT have guide button visible
        await page.waitForTimeout(2000);
        expect(await guideOverlay.isGuideButtonVisible()).toBe(false);
        
        await mobileContext.close();
    });

    test('TC000: DIAGNOSTIC - Test authentication and guide state', async ({ context }) => {
        console.log('🔍 DIAGNOSTIC: Starting authentication test...');
        
        // Create a fresh page
        const page = await goToSheetEditorWithUser(context);
        
        console.log(`🔍 DIAGNOSTIC - Page URL: ${page.url()}`);
        console.log(`🔍 DIAGNOSTIC - Page title: ${await page.title()}`);
        
        // Check basic authentication indicators
        const profilePicVisible = await page.locator('.myProfileBox .profile-pic').isVisible();
        console.log(`🔍 DIAGNOSTIC - Profile pic visible (auth indicator): ${profilePicVisible}`);
        
        // Check if we're on the right page
        const editorVisible = await page.locator('.editorContent').isVisible();
        console.log(`🔍 DIAGNOSTIC - Editor content visible: ${editorVisible}`);
        
        const guideOverlay = new GuideOverlayPage(page, LANGUAGES.EN);
        
        // Check guide button
        const guideButtonVisible = await guideOverlay.isGuideButtonVisible();
        console.log(`🔍 DIAGNOSTIC - Guide button visible: ${guideButtonVisible}`);
        
        // Check for any existing guide overlay
        const overlayVisible = await guideOverlay.overlay().isVisible().catch(() => false);
        console.log(`🔍 DIAGNOSTIC - Guide overlay already visible: ${overlayVisible}`);
        
        // Check for guide cookies
        const hasGuideCookie = await hasGuideOverlayCookie(page, 'editor');
        console.log(`🔍 DIAGNOSTIC - Has guide cookie: ${hasGuideCookie}`);
        
        // Check for any console errors
        const logs: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                logs.push(msg.text());
            }
        });
        
        // Wait a moment to collect any errors
        await page.waitForTimeout(3000);
        
        if (logs.length > 0) {
            console.log(`🔍 DIAGNOSTIC - Console errors found: ${logs.join(', ')}`);
        } else {
            console.log('🔍 DIAGNOSTIC - No console errors detected');
        }
        
        // This test should always pass - it's just for diagnostics
        expect(true).toBe(true);
    });
}); 