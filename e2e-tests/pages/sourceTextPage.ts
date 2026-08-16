import { Page, expect } from "@playwright/test"
import { LANGUAGES, SOURCE_LANGUAGES, t } from "../globals"
import { HelperBase } from "./helperBase"

export class SourceTextPage extends HelperBase {
    constructor(page: Page, language: string) {
        super(page, language)
    }

    async setContentLanguage(mode: RegExp) {
        await this.page.getByRole('button', { name: 'Toggle Reader Menu Display Settings' }).click();
        await this.page.getByRole('radio', { name: mode }).click();
    }

    private get displaySettingsToggle() {
        return this.page.getByRole('button', { name: 'Toggle Reader Menu Display Settings' })
    }

    /**
     * Choose the bilingual layout. The radios are labelled with the internal, interface-language
     * invariant values ('stacked' | 'heLeft' | 'heRight'), so this is safe under a Hebrew UI.
     * Only meaningful while the content language is "Source with Translation".
     */
    async setBiLayout(layout: 'stacked' | 'heLeft' | 'heRight') {
        const radio = this.page.getByRole('radio', { name: layout, exact: true })
        if (!(await radio.isVisible())) {
            await this.displaySettingsToggle.click()
        }
        await expect(radio).toBeVisible({ timeout: t(10000) })
        await radio.click()
        // Close the settings dialog so it can't intercept later clicks or screenshots.
        await this.displaySettingsToggle.click()
        await expect(radio).toBeHidden({ timeout: t(10000) })
    }

    /**
     * Read the resolved layout of one segment's source/translation spans in a single round trip.
     * Returned widths are rounded CSS pixels; `segmentWidth` is the width of the segment's own
     * text container, so callers can assert "spans the full column" without hardcoding a pixel
     * value that varies with viewport.
     *
     * One atomic evaluate rather than a sequence of locator reads — see CLAUDE.md §2 rule 20(b).
     */
    async getSegmentSpanLayout(ref: string) {
        return await this.page.evaluate((segRef: string) => {
            const seg = document.querySelector(`.basetext .segment[data-ref="${segRef}"]`)
            if (!seg) return null
            const read = (sel: string) => {
                const el = seg.querySelector(`:scope > p > .contentSpan.${sel}`)
                if (!el) return null
                const cs = window.getComputedStyle(el)
                return {
                    display: cs.display,
                    float: cs.float,
                    width: Math.round(parseFloat(cs.width)),
                    direction: cs.direction,
                    className: el.className,
                    hasInstruction: !!el.querySelector(':scope > i.instruction'),
                }
            }
            return {
                segmentWidth: Math.round(seg.getBoundingClientRect().width),
                primary: read('primary'),
                translation: read('translation'),
            }
        }, ref)
    }

    /**
     * Whether a segment's instruction rubric is actually rendered to the reader.
     * Uses offsetParent + rect rather than :visible so a `display:none` ancestor counts as hidden.
     */
    async isInstructionRendered(ref: string) {
        return await this.page.evaluate((segRef: string) => {
            const seg = document.querySelector(`.basetext .segment[data-ref="${segRef}"]`)
            if (!seg) return null
            const instr = seg.querySelector('i.instruction')
            if (!instr) return { present: false, rendered: false, height: 0 }
            const rect = (instr as HTMLElement).getBoundingClientRect()
            return {
                present: true,
                rendered: (instr as HTMLElement).offsetParent !== null && rect.height > 0,
                height: Math.round(rect.height),
            }
        }, ref)
    }

    // Refactored from utils.ts: changeLanguageOfText
    async changeTextLanguage(sourceLanguage: RegExp) {
        // Clicking on the Source Language toggle
        await this.page.getByAltText('Toggle Reader Menu Display Settings').click()

        // Selecting Source Language
        await this.page.locator('div').filter({ hasText: sourceLanguage }).click()
    }

    async goToTranslations() {
        const sheetTitle = this.page.locator('h1')
        await sheetTitle.click()

        if (this.language === LANGUAGES.HE) {
            await this.page.getByRole('link', { name: 'תרגומים' }).click()
        }
        else {
            await this.page.getByRole('link', { name: 'Translations' }).click()
        }
    }

    async selectTranslation(translation: string) {

        const translationNameInSourceSheetTitle = this.page.locator('span.readerTextVersion')

        // Find the translation to select
        const translationVersionTitle = this.page.locator('div.version-with-preview-title-line', { hasText: translation })

        // Select the translation by clicking the selection button
        if (this.language === LANGUAGES.HE) {
            await translationVersionTitle.getByText('בחירה').click()
        }
        else {
            await translationVersionTitle.getByText('Select').click()
        }

        // Validate selected translation is reflected in title
        await expect(translationNameInSourceSheetTitle).toHaveText(translation)

    }

    // Opens the ToC sidebar
    async openTableOfContents() {
        await this.page.getByRole('link', { name: 'Table of Contents' }).click();
    }

    async validateFirstLineOfContent(text: string) {
        const firstLineInSourceSheet = this.page.locator('div.segmentNumber').first().locator('..').locator('p')
        await expect(firstLineInSourceSheet).toContainText(text)
    }

    async validateLinkExistsInBanner(text: string) {
        await expect(this.page.getByRole('banner')).toContainText(text)
    }

    async clickSegment(ref: string) {
        const segment = this.page.locator(`div.segment[data-ref="${ref}"]`);
        await expect(segment).toBeVisible();
        await segment.click();
    }


    async clickFilterCategory(categoryName: string) {
        await this.page.getByRole("button", { name: categoryName }).click();
    }

    async clickTextFilter(textFilter: string) {
        await this.page.getByRole("button", { name: textFilter }).click();
    }

    async expectResourcePanelToContain(text: string) {
        const panel = this.page.locator(".resource-panel");
        await expect(panel.getByText(text)).toBeVisible();
    }

    /**
     * Add the current source segment to a sheet via the connections panel
     * @param sheetTitle - The title of the sheet to add the source to
     */
    async addToSheetViaConnectionsPanel(sheetTitle: string) {
        // Click "Add to Sheet" button in connections panel
        const addButton = this.page.getByText('Add to Sheet')
        await addButton.click();

        const addToSheetButton = this.page.locator('.addToSourceSheetBox .dropdown .sefaria-common-button')
        await addToSheetButton.click();
        await this.page.waitForTimeout(t(500)); // Wait for dropdown to appear

        // Select sheet from dropdown by title
        const sheetOption = this.page.locator('.dropdownOption')
            .filter({ hasText: sheetTitle });
        await sheetOption.first().click();
        await this.page.waitForTimeout(t(300));

        // Click final "Add to Sheet" button to confirm
        const addButton2 = this.page.getByText('Add to Sheet')
        await addButton2.click();
        await this.page.waitForLoadState('domcontentloaded');
        await expect(this.page.getByText(`has been added to ${sheetTitle}`)).toBeVisible();
    }

}