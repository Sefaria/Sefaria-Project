import { BrowserContext, Cookie, ElementHandle, Locator, Page } from 'playwright-core';
import { expect } from 'playwright/test';
import {isClickable} from "../utils";
import { SaveStates, SaveState } from '../constants';
import { LANGUAGES, testUser } from '../globals';
import { HelperBase } from "./helperBase";
import { LoginPage } from './loginPage';

export class SourceSheetEditorPage extends HelperBase {
    constructor(page: Page, language: string) {
        super(page, language);
    }

    // Status Indicator Components----------------------------
    statusIndicator = () => this.page.locator('.editorSaveStateIndicator');
    statusMessage = () => this.page.locator('.saveStateMessage');
    statusTooltip = () => this.page.locator('.editorSaveStateIndicator [data-tooltip]');


    async assertSaveState(state: SaveState, language = LANGUAGES.EN, timeout = 5000) {
      const text = language === LANGUAGES.HE ? state.textHebrew : state.text;
      const tooltip = language === LANGUAGES.HE ? state.tooltipHebrew : state.tooltip;
      await expect(this.statusMessage()).toHaveText(text, { timeout: timeout});
      await this.statusIndicator().hover();
      await expect(this.statusIndicator()).toHaveAttribute('aria-label', tooltip, { timeout: timeout });
      await this.assertSaveStateIndicatorIsOnTop();
    }
    
    // Source Sheet Buttons and Locators (source, text, media, comment)------------
    closeSheetEditorButton = () => this.page.locator('.readerNavMenuCloseButton');
    title = () => this.page.locator('.title');
    loginLink= () => this.page.getByRole('link', { name: 'Log in' });
    sideBarToggleButton = () => this.page.locator('.editorSideBarToggle');


    addSomethingButton = () => this.page.locator('.editorAddLineButton');
    addSourceButton = () => this.page.locator('#addSourceButton');
    addImageButton = () => this.page.getByRole('button', { name: 'Add an image' });
    addMediaButton = () => this.page.getByRole('button', { name: 'Add media' });  
    
    // Sheet Body---------------------------------------------
    sourceSheetBody = () => this.page.locator('.sheetContent'); 
    editableTextArea = () => this.page.locator('div.cursorHolder[contenteditable="true"]');

    // Sheet Actions--------------------------------------------------
    async closeSheetEditor() {
      await this.closeSheetEditorButton().click();
    }
    
    async editTitle(newTitle: string): Promise<void> {
        const title = this.title();
        await expect(title).toBeVisible();
        await title.click({ clickCount: 3 });
        await this.page.keyboard.press('Backspace');
        await this.page.keyboard.type(newTitle);
      };
    
    async addText(text: string) {
        await this.focusTextInput(); 
        await this.page.keyboard.type(text, {delay: 100});
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


    async setAsHeader(text: string) {
      const textLocator = this.page.locator(`text=${text}`);
      await textLocator.scrollIntoViewIfNeeded();
      await textLocator.dblclick(); // Triggers the hoverMenu
      const headerButton = this.page.locator('.hoverMenu .hoverButton:has(i.fa-header)');
      await headerButton.waitFor({ state: 'visible' });
      await headerButton.click();
    }
    

    async clickAddSomething() {
        await this.addSomethingButton().click();
    }

    async clickAddSource() {
        this.clickAddSomething();
        await this.addSourceButton().click();
    }

    async clickAddText() {
        await this.addSomethingButton().click();
    }

    async clickAddMedia() {
        this.clickAddSomething();
        await this.addMediaButton().click();
    }

    async clickSidebarToggle() {
        await this.sideBarToggleButton().click();
    }

    async focusTextInput() {
        await this.page.locator('[data-slate-editor="true"][contenteditable="true"]').click();
      }
    async getHoverStatus() {
        await this.statusIndicator().hover();
    }

    async getStatusText() {
        return await this.statusIndicator().innerText();
    }

    async getTooltipText() {
        return await this.statusTooltip().getAttribute('aria-label');
    }

    async getTextLocator(text: string): Promise<Locator> {
      return this.page.locator('span[data-slate-string="true"]', { hasText: text });
    }


    async addSampleSource() {
        console.log(await this.page.content());
        await this.addSomethingButton().scrollIntoViewIfNeeded();
        await expect(this.addSomethingButton()).toBeVisible();
        await this.addSomethingButton().first().click({ force: true });
        await this.addSomethingButton().first().click({ force: true });
        await expect(this.addSourceButton()).toBeVisible();
        await this.addSourceButton().click();
        await this.page.getByRole('textbox', { name: 'Search for a Text or' }).fill('genesis 1:1');
        await this.page.getByRole('button', { name: 'Add Source' }).click();
      };
    
    async sampleSourceNotEditable() {
        const sourceBox = this.page.locator('.sourceBox').last();
        await sourceBox.click();
        const contentEditable = sourceBox.locator('[contenteditable="true"]');
        const originalText = await contentEditable.innerText();
        await contentEditable.click({ trial: true }).catch(() => {});
        await this.page.keyboard.type('Dummy text to test editability', { delay: 30 });
        const newText = await contentEditable.innerText();
        expect(newText).toBe(originalText);
    }

    async waitForAutosave() {
      await expect(this.statusMessage()).toHaveText('Saved', { timeout: 4000 });
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
        { timeout: 10000 }
      );
    };
        
    async assertSaveStateIndicatorIsOnTop(){
      const target = this.page.locator('.editorSaveStateIndicator');
      await expect(target).toBeVisible();
    
      const isOnTop = await this.page.evaluate(() => {
        const target = document.querySelector('.editorSaveStateIndicator');
        if (!target) return false;
    
        const targetRect = target.getBoundingClientRect();
        const targetZ = parseInt(getComputedStyle(target).zIndex || '0', 10);
    
        let overlappingElements: Element[] = [];
    
        // Check points within the target's rectangle (e.g. center)
        const pointsToCheck = [
          [targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2],
          [targetRect.left + 1, targetRect.top + 1], // top-left
          [targetRect.right - 1, targetRect.bottom - 1], // bottom-right
        ];
    
        for (const [x, y] of pointsToCheck) {
          const el = document.elementFromPoint(x, y);
          if (el && el !== target && !target.contains(el)) {
            overlappingElements.push(el);
          }
        }
    
        for (const el of overlappingElements) {
          const style = window.getComputedStyle(el);
          const z = parseInt(style.zIndex || '0', 10);
          const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          if (visible && z >= targetZ) {
            console.warn('Overlapping element with higher or equal z-index:', el);
            return false;
          }
        }
        return true;
      });
      expect(isOnTop).toBe(true);
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

    
}



