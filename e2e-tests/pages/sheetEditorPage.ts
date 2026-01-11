import { BrowserContext, Cookie, ElementHandle, Locator, Page } from 'playwright-core';
import { expect } from 'playwright/test';
import { isClickable } from "../utils";
import { SaveStates, SaveState, SHEET_EDITOR_SELECTORS, MODULE_URLS } from '../constants';
import { LANGUAGES, testUser } from '../globals';
import { HelperBase } from "./helperBase";
import { LoginPage } from './loginPage';

export class SheetEditorPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // Status Indicator Components/Methods----------------------------
  statusIndicator = () => this.page.locator('.editorSaveStateIndicator');
  statusMessage = () => this.page.locator('.saveStateMessage');
  statusTooltip = () => this.page.locator('.editorSaveStateIndicator [data-tooltip]');
  maxSaveStateTimeout = 5000; //used in assertSaveState and a few other functions to allow for save state detection/update

  async getHoverStatus() { await this.statusIndicator().hover(); }

  async getStatusText() { return await this.statusIndicator().innerText() }

  async getTooltipText() { return await this.statusTooltip().getAttribute('aria-label'); }

  /**
   * Asserts the save state of the editor
   * @param saveState - the save state to assert
   * @param language - the language of the save state
   * @param timeout - the timeout for the save state assertion
   */
  async assertSaveState(saveState: SaveState, language = LANGUAGES.EN, timeout = this.maxSaveStateTimeout) {
    const text = language === LANGUAGES.HE ? saveState.textHebrew : saveState.text;
    const tooltip = language === LANGUAGES.HE ? saveState.tooltipHebrew : saveState.tooltip;
    await expect(this.statusMessage()).toHaveText(text, { timeout: timeout });
    await this.statusIndicator().hover();
    await expect(this.statusIndicator()).toHaveAttribute('aria-label', tooltip, { timeout: timeout });
    await this.assertSaveStateIndicatorIsOnTop();
  }
  async waitForAutosave() {
    await expect(this.statusMessage()).toHaveText('Saved', { timeout: this.maxSaveStateTimeout });
  }

  //check that no other elements are on top of the save state indicator (indicator has highest z-index)
  async assertSaveStateIndicatorIsOnTop() {
    const target = this.page.locator('.editorSaveStateIndicator');
    await expect(target).toBeVisible();
    const isOnTop = await target.evaluate((targetEl) => {
      const targetRect = targetEl.getBoundingClientRect();
      const targetZ = parseInt(getComputedStyle(targetEl).zIndex || '0', 10);
      // Test multiple points to ensure comprehensive coverage
      const testPoints = [
        [targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2],
        [targetRect.left + 5, targetRect.top + 5],
        [targetRect.right - 5, targetRect.top + 5],
        [targetRect.left + 5, targetRect.bottom - 5],
        [targetRect.right - 5, targetRect.bottom - 5],
      ];
      for (const [x, y] of testPoints) {
        const topElement = document.elementFromPoint(x, y);
        // If the top element isn't our target or contained within it, check z-index
        if (topElement && topElement !== targetEl && !targetEl.contains(topElement)) {
          const topElZ = parseInt(getComputedStyle(topElement).zIndex || '0', 10);
          if (topElZ >= targetZ) {
            console.warn('Element with higher z-index found:', topElement, `z-index: ${topElZ} vs ${targetZ}`);
            return false;
          }
        }
      }
      return true;
    });
    expect(isOnTop).toBe(true);
  }

  async alignTextWithStatusIndicator(text: string) {
    const indicatorBox = await this.statusIndicator().boundingBox();
    if (!indicatorBox) throw new Error('Save State Indicator not found');
    const indicatorTopY = indicatorBox.y;

    await this.page.evaluate(({ text, indicatorTopY }) => {
      const el = Array.from(document.querySelectorAll('span[data-slate-string="true"]'))
        .find(e => e.textContent === text);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const elTopY = rect.top + window.scrollY;

      const scrollDelta = elTopY - indicatorTopY;
      const newScrollY = window.scrollY - scrollDelta;

      window.scrollTo({ top: newScrollY });
    }, { text, indicatorTopY });
  }

  // Source Sheet Buttons and Locators (source, text, media, comment)------------
  closeSheetEditorButton = () => this.page.locator('a.readerNavMenuCloseButton');
  readerHeader = () => this.page.locator('header.readerControls.fullPanel.sheetReaderControls');
  topTitle = () => this.page.locator('a[aria-label*="Show Connection Panel contents"]');
  title = () => this.page.locator('.sheetMetaDataBox .sidebarLayout .title');
  loginLink = () => this.page.getByRole('link', { name: 'Log in' });
  sideBarToggleButton = () => this.page.locator('button.editorSidebarToggle');
  resourcePanel = () => this.page.locator('.connectionsPanel');
  textReaderPanel = () => this.page.locator('#panel-1.readerPanel');
  resourcePanelCloseButton = () => this.page.locator('#panel-1').getByRole('link', { name: 'Close' });

  addSomethingButton = () => this.page.locator('.editorAddInterface');
  addSourceButton = () => this.page.locator('#addSourceButton');
  addImageButton = () => this.page.locator('#addImageButton');
  addMediaButton = () => this.page.locator('#addMediaButton');

  optionsButton = () => this.page.getByAltText('Options');

  //Text formatting locators - regular text
  boldTextButton = () => this.page.locator('.hoverMenu i.fa.fa-bold');
  italicTextButton = () => this.page.locator('.hoverMenu i.fa.fa-italic');
  underlineTextButton = () => this.page.locator('.hoverMenu i.fa.fa-underline');
  highlightTextButton = () => this.page.locator('.hoverMenu i.fa.fa-pencil');
  makeTextLinkButton = () => this.page.locator('.hoverMenu i.fa.fa-link');
  makeTextHeadingButton = () => this.page.locator('.hoverMenu i.fa.fa-header');
  makeBulletedListButton = () => this.page.locator('.hoverMenu i.fa.fa-list-ul');
  makeNumberedListButton = () => this.page.locator('.hoverMenu i.fa.fa-list-ol');

  //Text formatting locators - source text (more specific)
  boldSourceTextButton = () => this.page.locator('div:nth-child(3) > span > .fa.fa-bold');
  underlineSourceTextButton = () => this.page.locator('div:nth-child(3) > span:nth-child(3) > .fa.fa-underline');
  highlightSourceTextButton = () => this.page.locator('div:nth-child(3) > span:nth-child(4) > .fa.fa-pencil');
  italicSourceTextButton = () => this.page.locator('div:nth-child(3) > span:nth-child(2) > .fa.fa-italic');

  // Sheet Body---------------------------------------------
  sourceSheetBody = () => this.page.locator(SHEET_EDITOR_SELECTORS.BODY);
  editableTextArea = () => this.page.locator(SHEET_EDITOR_SELECTORS.EDITABLE_AREA);
  addedSource = () => this.page.locator(SHEET_EDITOR_SELECTORS.ADDED_SOURCE);
  sourceReferenceLink = () => this.page.locator('.SheetSource .ref a[href^="/"]').first();
  addedSpotify = () => this.page.locator('iframe[src*="open.spotify.com/embed/"]');
  addedYoutube = () => this.page.locator('.youTubeContainer');
  addedImage = () => this.page.locator('img.addedMedia');

  // Sheet Actions--------------------------------------------------
  async closeSheetEditor() {
    await this.closeSheetEditorButton().click();
    // Wait for navigation to complete instead of using timeout
    await this.page.waitForURL(/\/texts/);
  }


  async editTitle(newTitle: string): Promise<void> {
    const title = this.title();
    await expect(title).toBeVisible();
    await title.click({ clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.type(newTitle);
  };

  /**
   * Methods to click buttons and interact with the sheet editor
   */

  async clickPlusButton() {
    const editorInterface = this.page.locator('.editorAddInterface');

    try {
      const box = await editorInterface.boundingBox({ timeout: 2000 });
      if (box) {
        await this.page.mouse.click(box.x - 31, box.y + box.height / 2);
        return;
      }
    } catch (error) {
      // Fallback: position cursor at end and retry
      await this.page.getByRole('textbox').first().click({ force: true });
      await this.page.keyboard.press('End');

      try {
        const box = await editorInterface.boundingBox({ timeout: 1000 });
        if (box) {
          await this.page.mouse.click(box.x - 31, box.y + box.height / 2);
        }
      } catch (retryError) {
        // Create new line if plus button unavailable
        await this.page.keyboard.press('Enter');
      }
    }
  }

  async clickAddSomething() {
    await this.addSomethingButton().click();
  }

  async clickAddSource() {
    await this.clickPlusButton();
    await this.addSourceButton().click();
  }

  async clickAddMedia() {
    await this.clickPlusButton();
    await this.addMediaButton().click();
  }

  async clickAddImage() {
    await this.clickPlusButton();
    await this.addImageButton().click();
  }

  async clickSidebarToggle() {
    await this.sideBarToggleButton().click();
  }

  async focusTextInput() {
    try {
      await this.page.locator('.spacerSelected.spacer.empty').click({ timeout: 2000, force: true });
    } catch (error) {
      try {
        await this.page.locator('.editorAddInterface').click({ timeout: 2000, force: true });
      } catch (error2) {
        // Use existing moveCursorToEnd helper
        await this.moveCursorToEnd();
      }
    }
  }

  async getTextLocator(text: string): Promise<Locator> {
    return this.page.locator('span[data-slate-string="true"]', { hasText: text });
  }

  /**
   * Methods to add components to the sheet editor
   * Simulate user actions to add text, sources, images, and media.
   */

  async addText(text: string) {
    await this.focusTextInput();
    //delay is used to simulate user typing and ensure the save state is detected/updated
    await this.page.keyboard.type(text);
    await this.page.waitForTimeout(100); // Extra wait for auto-save
    await this.page.keyboard.press('Enter');
  }

  async addSampleSource() {
    await this.clickAddSource();
    await this.page.getByRole('textbox', { name: 'Search for a Text or' }).fill('genesis 1:1');
    await this.page.getByRole('button', { name: 'Add Source' }).click();
  };

  async addSampleImage() {
    await this.clickAddImage();
    const imagePath = 'e2e-tests/fixtures/test-image.jpg';
    const fileInput = this.page.locator('#addImageFileSelector');
    await fileInput.setInputFiles(imagePath);
    // Wait for the image to be added to the sheet
    await expect(this.addedImage()).toBeVisible({ timeout: 10000 });
  };

  async addSampleMedia(link: string) {
    await this.clickAddMedia();
    const mediaInput = this.page.getByRole('textbox', { name: 'Paste a link to an image, video, or audio' });
    await mediaInput.fill(link);
    // Wait for the "Add Media" button to appear (it only appears after valid URL is entered)
    const addButton = this.page.getByRole('button', { name: 'Add Media' });
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();
    // Wait a moment for the media to be embedded
    await this.page.waitForTimeout(500);
  };

  async moveCursorToEnd() {
    await this.page.evaluate(() => {
      const elements = document.querySelectorAll('.spacerSelected .cursorHolder[contenteditable="true"]');
      const lastElement = elements[elements.length - 1] as HTMLElement;
      if (lastElement) {
        lastElement.focus();
        const range = document.createRange();
        range.selectNodeContents(lastElement);
        range.collapse(false); // Move to end
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });
  }

  async sampleSourceNotEditable() {
    const sourceBox = this.page.locator('.sourceBox').last();
    await sourceBox.click();
    const contentEditable = sourceBox.locator('[contenteditable="true"]');
    const originalText = await contentEditable.innerText();
    await contentEditable.click({ trial: true }).catch(() => { });
    //delay to simulate user typing and detect/update save state if necessary
    await this.page.keyboard.type('Dummy text to test editability', { delay: 30 });
    const newText = await contentEditable.innerText();
    expect(newText).toBe(originalText);
  }

  //Connectivity/Login Functions--------------------------------------------

  async loginViaTooltip(language = LANGUAGES.EN) {
    this.page.once('dialog', async dialog => {
      await dialog.accept();
    });
    await this.page.getByRole('link', { name: 'Log in' }).click();
    const loginPage = new LoginPage(this.page, language);
    await loginPage.loginAs(testUser);
  };

  async waitForConnectionState(expectedState: 'online' | 'offline') {
    const expectedText = expectedState === 'online' ? 'Saved' : 'Trying to Connect';

    await this.page.waitForFunction(
      (text) => {
        const el = document.querySelector('.editorSaveStateIndicator .saveStateMessage');
        return el && el.textContent?.trim() === text;
      },
      expectedText,
      { timeout: this.maxSaveStateTimeout }
    );
  };

  async validateEditingIsBlocked() {

    // 1. Title should not be editable
    expect(await isClickable(this.title())).toBe(false);

    // 2. Common add buttons should not be interactable
    const addButtons = [
      '#addSourceButton',
      '#addImageButton',
      '#addMediaButton',
      '.editorAddLineButton',
    ];

    for (const selector of addButtons) {
      const btn = this.page.locator(selector);
      if (await btn.count()) {
        expect(await isClickable(btn)).toBe(false);
      }
    }

    // 3. Plain text editor should not be interactable
    const textEditor = this.page.locator('[data-slate-editor="true"][contenteditable="true"]');
    if (await textEditor.count()) {
      expect(await isClickable(textEditor)).toBe(false);
    }

    // 4. Source boxes should not be editable
    //await this.sampleSourceNotEditable();


    // 5. Drag-and-drop handles should not be interactable
    const dragHandles = this.page.locator('.segment .sourceDraggable');
    if (await dragHandles.count()) {
      const isDraggable = await dragHandles.first().evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.pointerEvents !== 'none';
      });
      expect(isDraggable).toBe(false);
    }

    // 6. Hover formatting menu should not appear
    const hoverMenu = this.page.locator('.hoverMenu');
    if (await hoverMenu.count()) {
      const isVisible = await hoverMenu.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
      });

      // In blocked state, it should not be both visible and interactive
      expect(isVisible && await isClickable(hoverMenu)).toBe(false);
    }
  }

  // MDL  Additional Methods--------------------------------------------

  /**
   * Click the main Publish button to open the publish modal
   */
  async clickPublishButton() {
    const publishButton = this.page.getByRole('button', { name: /publish/i });
    await publishButton.click();
    await this.page.waitForTimeout(500); // Wait for modal to appear
  }

  /**
   * Fill out the publish form with title, summary, and optional topics
   * @param title - Sheet title
   * @param summary - Sheet summary/description
   * @param topics - Optional array of topic names to add
   */
  async fillPublishForm(title: string, summary: string, topics?: string[]) {
    // Fill title
    const titleInput = this.page.locator('input[type="text"]').first();
    await titleInput.clear();
    await titleInput.fill(title);

    // Fill summary
    const summaryTextarea = this.page.locator('textarea').first();
    await summaryTextarea.clear();
    await summaryTextarea.fill(summary);

    // Add topics if provided
    if (topics && topics.length > 0) {
      for (const topic of topics) {
        const topicInput = this.page.locator('.react-tags__search-input').first();
        await topicInput.click();
        await topicInput.fill(topic);

        const suggestion = this.page.locator('.react-tags__suggestions li')
          .filter({ hasText: new RegExp(topic, 'i') }).first();
        await expect(suggestion).toBeVisible({ timeout: 5000 });
        await suggestion.click();
        await this.page.waitForTimeout(300);
      }
    }
  }

  /**
   * Click the final Publish button in the modal to publish the sheet
   */
  async publishSheet() {
    const publishButton = this.page.locator('button')
      .filter({ hasText: /publish/i }).last();
    await publishButton.click();
    await this.page.waitForLoadState('domcontentloaded');
    // Assert error saying please add a ... doesnt appear
    await expect(this.page.getByText('Please add a')).not.toBeVisible();
    // Assert that the popup Success! appears
    await expect(this.page.getByText('Success!')).toBeVisible();
  }

  /**
   * Open the options menu (ellipses button)
   */
  async openOptionsMenu() {
    const ellipsisButton = this.page.locator('img[src="/static/icons/ellipses.svg"]');
    await ellipsisButton.click();
    await this.page.waitForTimeout(300); // Wait for menu to appear
  }

  /**
   * Unpublish a published sheet via the options menu
   */
  async unpublishSheet() {
    await this.openOptionsMenu();

    const unpublishOption = this.page.getByText('Unpublish');
    await unpublishOption.click();
    await this.page.waitForLoadState('domcontentloaded');
    // Assert that the popup Success! appears
    await expect(this.page.getByText('Success!')).toBeVisible();
  }

  /**
   * Open the collections modal via the options menu
   */
  async openCollectionsModal() {
    await this.openOptionsMenu();

    const collectionsOption = this.page.getByText(/Edit Collections|Add to Collection/);
    await collectionsOption.click();
    await this.page.waitForTimeout(500); // Wait for modal to appear
  }

  /**
   * Create a new collection and add the current sheet to it
   * @param newCollectionName - Name of the new collection to create
   */
  async createAndAddToCollection(newCollectionName: string) {
    await this.openCollectionsModal();

    // Create new collection
    const createInput = this.page.locator('.collectionsWidgetCreateInput');
    await createInput.fill(newCollectionName);

    const createButton = this.page.locator('.collectionsWidgetCreateButton');
    await createButton.click();

    // Wait for collection to be created and auto-checked
    await this.page.waitForTimeout(800);

    // Click Done
    const doneButton = this.page.locator('.button.large.fillWidth');
    await doneButton.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Delete the current sheet via the options menu
   */
  async deleteSheet() {
    await this.openOptionsMenu();

    const deleteOption = this.page.getByText('Delete Sheet').click();
    const dialogPromise = this.page.waitForEvent('dialog');
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain("Are you sure you want to delete this sheet?");
    await dialog.accept();
    await this.page.waitForTimeout(500);

    await this.page.waitForLoadState('networkidle');
  }


}



