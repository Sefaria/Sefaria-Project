import { Page } from 'playwright-core';

export class SourceSheetEditorPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // Status Indicator
    statusIndicator = () => this.page.locator('.sourceSheetStatusIndicator');
    statusTooltip = () => this.page.locator('.sourceSheetStatusIndicator [data-tooltip]');

    // Toolbar Buttons (source, text, media, comment)
    addSourceButton = () => this.page.locator('[data-testid="add-source"]');
    addTextButton = () => this.page.locator('[data-testid="add-text"]');
    addMediaButton = () => this.page.locator('[data-testid="add-media"]');
    addCommentButton = () => this.page.locator('[data-testid="add-comment"]');

    // Sheet Body
    sourceSheetBody = () => this.page.locator('.sourceSheetContent'); 

    // Modal Dialogs
    errorModal = () => this.page.locator('.errorModal'); 
    leaveSiteModal = () => this.page.locator('text="Leave site? Changes you made might not be saved."');

    // Actions
    async typeInSheet(text: string) {
        await this.sourceSheetBody().click();
        await this.sourceSheetBody().fill(text);
    }

    async clickAddSource() {
        await this.addSourceButton().click();
    }

    async clickAddText() {
        await this.addTextButton().click();
    }

    async clickAddMedia() {
        await this.addMediaButton().click();
    }

    async clickAddComment() {
        await this.addCommentButton().click();
    }

    async hoverStatus() {
        await this.statusIndicator().hover();
    }

    async getStatusText() {
        return await this.statusIndicator().innerText();
    }

    async getTooltipText() {
        return await this.statusTooltip().getAttribute('aria-label');
    }
}
