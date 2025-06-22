import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Guide Overlay component
 * Encapsulates all selectors and methods for interacting with the guide overlay
 */
export class GuideOverlayPage {
    readonly page: Page;
    
    // Main overlay selectors
    readonly overlay: Locator;
    readonly content: Locator;
    readonly loadingCenter: Locator;
    
    // Header selectors
    readonly header: Locator;
    readonly titleSection: Locator;
    readonly title: Locator;
    readonly titlePrefix: Locator;
    readonly titleVariable: Locator;
    readonly closeButton: Locator;
    
    // Pagination selectors
    readonly pagination: Locator;
    readonly previousArrow: Locator;
    readonly nextArrow: Locator;
    readonly paginationNumber: Locator;
    
    // Content selectors
    readonly body: Locator;
    readonly videoContainer: Locator;
    readonly video: Locator;
    readonly textContainer: Locator;
    readonly text: Locator;
    
    // Footer selectors
    readonly footer: Locator;
    readonly footerLinks: Locator;
    
    // Guide button (outside overlay)
    readonly guideButton: Locator;

    constructor(page: Page) {
        this.page = page;
        
        // Main overlay
        this.overlay = page.locator('.guideOverlay');
        this.content = this.overlay.locator('.guideOverlayContent');
        this.loadingCenter = this.content.locator('.guideOverlayLoadingCenter');
        
        // Header elements
        this.header = this.content.locator('.guideOverlayHeader');
        this.titleSection = this.header.locator('.guideOverlayTitleSection');
        this.title = this.titleSection.locator('.guideOverlayTitle');
        this.titlePrefix = this.title.locator('.titlePrefix');
        this.titleVariable = this.title.locator('.titleVariable');
        this.closeButton = this.header.locator('.readerNavMenuCloseButton.circledX');
        
        // Pagination elements
        this.pagination = this.header.locator('.guideOverlayPagination');
        this.previousArrow = this.pagination.locator('.arrowButton').first();
        this.nextArrow = this.pagination.locator('.arrowButton').last();
        this.paginationNumber = this.pagination.locator('.cardsPaginationNumber');
        
        // Content elements
        this.body = this.content.locator('.guideOverlayBody');
        this.videoContainer = this.body.locator('.guideOverlayVideoContainer');
        this.video = this.videoContainer.locator('.guideOverlayVideo');
        this.textContainer = this.body.locator('.guideOverlayTextContainer');
        this.text = this.textContainer.locator('.guideOverlayText');
        
        // Footer elements
        this.footer = this.content.locator('.guideOverlayFooter');
        this.footerLinks = this.footer.locator('.guideOverlayFooterLink');
        
        // Guide button (located outside the overlay)
        this.guideButton = page.locator('.rightButtons .guideButton');
    }

    /**
     * Check if guide overlay is visible
     */
    async isVisible(): Promise<boolean> {
        return await this.overlay.isVisible();
    }

    /**
     * Check if guide overlay is loading
     */
    async isLoading(): Promise<boolean> {
        return await this.loadingCenter.isVisible();
    }

    /**
     * Wait for guide overlay to appear and finish loading
     */
    async waitForLoaded(timeout: number = 10000): Promise<void> {
        await this.overlay.waitFor({ state: 'visible', timeout });
        await this.loadingCenter.waitFor({ state: 'detached', timeout });
    }

    /**
     * Wait for guide overlay to disappear
     */
    async waitForClosed(timeout: number = 5000): Promise<void> {
        await this.overlay.waitFor({ state: 'detached', timeout });
    }

    /**
     * Close the guide overlay by clicking the close button
     */
    async close(): Promise<void> {
        await this.closeButton.click();
        await this.waitForClosed();
    }

    /**
     * Click the guide button to show the overlay
     */
    async clickGuideButton(): Promise<void> {
        await this.guideButton.click();
    }

    /**
     * Navigate to next card
     */
    async navigateNext(): Promise<void> {
        await this.nextArrow.click();
    }

    /**
     * Navigate to previous card
     */
    async navigatePrevious(): Promise<void> {
        await this.previousArrow.click();
    }

    /**
     * Get current pagination text (e.g., "1 of 3")
     */
    async getPaginationText(): Promise<string> {
        return await this.paginationNumber.textContent() || '';
    }

    /**
     * Get current card title
     */
    async getCurrentTitle(): Promise<string> {
        return await this.titleVariable.textContent() || '';
    }

    /**
     * Get title prefix
     */
    async getTitlePrefix(): Promise<string> {
        return await this.titlePrefix.textContent() || '';
    }

    /**
     * Get current card text content
     */
    async getCurrentText(): Promise<string> {
        return await this.text.textContent() || '';
    }

    /**
     * Check if video is visible and has src attribute
     */
    async isVideoDisplayed(): Promise<boolean> {
        const videos = await this.video.all();
        for (const video of videos) {
            if (await video.isVisible() && await video.getAttribute('src')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get video source URL
     */
    async getVideoSrc(): Promise<string> {
        const videos = await this.video.all();
        for (const video of videos) {
            if (await video.isVisible()) {
                return await video.getAttribute('src') || '';
            }
        }
        return '';
    }

    /**
     * Check if video has controls
     */
    async hasVideoControls(): Promise<boolean> {
        const videos = await this.video.all();
        for (const video of videos) {
            if (await video.isVisible()) {
                return await video.getAttribute('controls') !== null;
            }
        }
        return false;
    }

    /**
     * Check if navigation arrows are visible
     */
    async isNavigationVisible(): Promise<boolean> {
        return await this.pagination.isVisible();
    }

    /**
     * Get number of footer links
     */
    async getFooterLinksCount(): Promise<number> {
        return await this.footerLinks.count();
    }

    /**
     * Click footer link by index
     */
    async clickFooterLink(index: number): Promise<void> {
        await this.footerLinks.nth(index).click();
    }

    /**
     * Get footer link text by index
     */
    async getFooterLinkText(index: number): Promise<string> {
        return await this.footerLinks.nth(index).textContent() || '';
    }

    /**
     * Get footer link URL by index
     */
    async getFooterLinkUrl(index: number): Promise<string> {
        return await this.footerLinks.nth(index).getAttribute('href') || '';
    }

    /**
     * Check if guide button is visible (indicates guide is available for this context)
     */
    async isGuideButtonVisible(): Promise<boolean> {
        return await this.guideButton.isVisible();
    }
} 