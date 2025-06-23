import { Page, Locator } from '@playwright/test';
import { HelperBase } from './helperBase';

/**
 * Page Object Model for Guide Overlay component
 * Follows established patterns from other page objects in the codebase
 */
export class GuideOverlayPage extends HelperBase {
    
    constructor(page: Page, language: string = 'english') {
        super(page, language);
    }

    // Main overlay elements
    overlay = () => this.page.locator('.guideOverlay');
    content = () => this.overlay().locator('.guideOverlayContent');
    loadingCenter = () => this.content().locator('.guideOverlayLoadingCenter');
    
    // Header elements
    header = () => this.content().locator('.guideOverlayHeader');
    title = () => this.header().locator('.guideOverlayTitle .titleVariable');
    titlePrefix = () => this.header().locator('.guideOverlayTitle .titlePrefix');
    closeButton = () => this.header().locator('.readerNavMenuCloseButton.circledX');
    
    // Pagination elements
    pagination = () => this.header().locator('.guideOverlayPagination');
    previousArrow = () => this.pagination().locator('.arrowButton').first();
    nextArrow = () => this.pagination().locator('.arrowButton').last();
    paginationNumber = () => this.pagination().locator('.cardsPaginationNumber');
    
    // Content elements
    body = () => this.content().locator('.guideOverlayBody');
    video = () => this.body().locator('.guideOverlayVideo');
    text = () => this.body().locator('.guideOverlayText');
    
    // Footer elements
    footer = () => this.content().locator('.guideOverlayFooter');
    footerLinks = () => this.footer().locator('.guideOverlayFooterLink');
    
    // Guide button (outside overlay)
    guideButton = () => this.page.locator('.rightButtons .guideButton');

    /**
     * Check if guide overlay is visible
     */
    async isVisible(): Promise<boolean> {
        return await this.overlay().isVisible();
    }

    /**
     * Check if guide overlay is loading
     */
    async isLoading(): Promise<boolean> {
        return await this.loadingCenter().isVisible();
    }

    /**
     * Wait for guide overlay to appear and finish loading
     */
    async waitForLoaded(timeout: number = 10000): Promise<void> {
        await this.overlay().waitFor({ state: 'visible', timeout });
        await this.loadingCenter().waitFor({ state: 'detached', timeout });
    }

    /**
     * Wait for guide overlay to disappear
     */
    async waitForClosed(timeout: number = 5000): Promise<void> {
        await this.overlay().waitFor({ state: 'detached', timeout });
    }

    /**
     * Close the guide overlay by clicking the close button
     */
    async close(): Promise<void> {
        await this.closeButton().click();
        await this.waitForClosed();
    }

    /**
     * Click the guide button to show the overlay
     */
    async clickGuideButton(): Promise<void> {
        await this.guideButton().click();
    }

    /**
     * Navigate to next card
     */
    async navigateNext(): Promise<void> {
        await this.nextArrow().click();
    }

    /**
     * Navigate to previous card
     */
    async navigatePrevious(): Promise<void> {
        await this.previousArrow().click();
    }

    /**
     * Get current pagination text (e.g., "1 of 3")
     */
    async getPaginationText(): Promise<string> {
        return await this.paginationNumber().textContent() || '';
    }

    /**
     * Get current card title
     */
    async getCurrentTitle(): Promise<string> {
        return await this.title().textContent() || '';
    }

    /**
     * Get title prefix
     */
    async getTitlePrefix(): Promise<string> {
        return await this.titlePrefix().textContent() || '';
    }

    /**
     * Get current card text content
     */
    async getCurrentText(): Promise<string> {
        return await this.text().textContent() || '';
    }

    /**
     * Check if video is visible and has src attribute
     */
    async isVideoDisplayed(): Promise<boolean> {
        const videos = await this.video().all();
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
        const videos = await this.video().all();
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
        const videos = await this.video().all();
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
        return await this.pagination().isVisible();
    }

    /**
     * Get number of footer links
     */
    async getFooterLinksCount(): Promise<number> {
        return await this.footerLinks().count();
    }

    /**
     * Click footer link by index
     */
    async clickFooterLink(index: number): Promise<void> {
        await this.footerLinks().nth(index).click();
    }

    /**
     * Get footer link text by index
     */
    async getFooterLinkText(index: number): Promise<string> {
        return await this.footerLinks().nth(index).textContent() || '';
    }

    /**
     * Get footer link URL by index
     */
    async getFooterLinkUrl(index: number): Promise<string> {
        return await this.footerLinks().nth(index).getAttribute('href') || '';
    }

    /**
     * Check if guide button is visible (indicates guide is available for this context)
     */
    async isGuideButtonVisible(): Promise<boolean> {
        return await this.guideButton().isVisible();
    }
} 