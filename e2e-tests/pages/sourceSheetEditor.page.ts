import { Cookie, ElementHandle, Locator, Page } from 'playwright-core';
import { expect } from 'playwright/test';
import {isClickable} from "../utils";


export class SourceSheetEditorPage {
    readonly page: Page;
    savedSessionCookie: Cookie | null = null;


    constructor(page: Page) {
        this.page = page;
    }

    // Status Indicator Components----------------------------
    statusIndicator = () => this.page.locator('.editorSaveStateIndicator');
    statusMessage = () => this.page.locator('.saveStateMessage');
    statusTooltip = () => this.page.locator('.editorSaveStateIndicator [data-tooltip]');


    // Source Sheet Buttons and Locators (source, text, media, comment)------------
    title = () => this.page.locator('.title');
    loginLink= () => this.page.getByRole('link', { name: 'Log in' });
    sideBarToggleButton = () => this.page.locator('.editorSideBarToggle');

    //addTextButton = () => this.page.getByRole('button', { name: 'Add a source, image, or other media'});
    addSomethingButton = () => this.page.locator('.editorAddLineButton');
    addSourceButton = () => this.page.locator('#addSourceButton');
    addImageButton = () => this.page.getByRole('button', { name: 'Add an image' });
    addMediaButton = () => this.page.getByRole('button', { name: 'Add media' });  


    
    // Sheet Body---------------------------------------------
    sourceSheetBody = () => this.page.locator('.sheetContent'); 
    //editable text area
    editableTextArea = () => this.page.locator('div.cursorHolder[contenteditable="true"]');

    // Sheet Actions--------------------------------------------------
    async editTitle(newTitle: string): Promise<void> {
        const title = this.title();
        // Ensure it's visible and interactable
        await expect(title).toBeVisible();
      
        // Focus and clear any existing content
        await title.click({ clickCount: 3 }); // Triple-click selects all
        await this.page.keyboard.press('Backspace');
        // Type new title
        await this.page.keyboard.type(newTitle);
      };
    
    async addText(text: string) {
        await this.focusTextInput(); 
        await this.page.keyboard.type(text);
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

    /*function to add a sample source, but there are issues with locators/differences in element names,
    so it is currently commented out in the tests*/
    
    // async addSampleSource(){
    //     await this.clickAddSource();
    //     await this.page.getByRole('textbox', { name: 'Search for a Text or' }).fill('genesis 1:1');
    //     await this.page.getByRole('button', { name: 'Add Source' }).click();
    // }

    async addSampleSource() {
        console.log(await this.page.content());
        await this.addSomethingButton().scrollIntoViewIfNeeded();
        await expect(this.addSomethingButton()).toBeVisible();
        await this.addSomethingButton().first().click({ force: true }); // Use force if anything overlays
        await this.addSomethingButton().first().click({ force: true }); // Use force if anything overlays
        await expect(this.addSourceButton()).toBeVisible();
        //main logic
        await this.addSourceButton().click();
        await this.page.getByRole('textbox', { name: 'Search for a Text or' }).fill('genesis 1:1');
        await this.page.getByRole('button', { name: 'Add Source' }).click();
      };
    
    async sampleSourceNotEditable() {
        // Locate the most recently added source
        const sourceBox = this.page.locator('.sourceBox').last();
        await sourceBox.click();
        // Find the editable content area within the source
        const contentEditable = sourceBox.locator('[contenteditable="true"]');
        // Save original content to compare later
        const originalText = await contentEditable.innerText();
        // Try to type dummy text (this won't be added if editing is blocked)
        await contentEditable.click({ trial: true }).catch(() => {});
        await this.page.keyboard.type('Dummy text to test editability', { delay: 30 });
        // Wait briefly for any potential text update
        // Re-read the content to compare
        const newText = await contentEditable.innerText();
        expect(newText).toBe(originalText);
    }

    async waitForAutosave() {
        // Wait at least 3 seconds to allow autosave to trigger
        await this.page.waitForTimeout(3000);
        // Then wait until the save state shows "Saved"
        await this.page.waitForFunction(() => {
          const el = document.querySelector('.editorSaveStateIndicator .saveStateMessage');
          return el && el.textContent?.trim() === 'Saved';
        }, null, { timeout: 5000 }); // optional timeout
      }
      
      //Connectivity/Login Functions--------------------------------------------
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
      }

    async simulateOfflineMode() {
        await this.page.context().setOffline(true);
    }

    async simulateOnlineMode() {
        await this.page.context().setOffline(false);
    }


    async simulateLogout(context) {
        const cookies = await context.cookies();
        const sessionCookie = cookies.find(c => c.name === 'sessionid');

        if (sessionCookie) {
            this.savedSessionCookie = sessionCookie;
            // Remove just the sessionid by clearing all and re-adding the rest
            const otherCookies = cookies.filter(c => c.name !== 'sessionid');
            await context.clearCookies();
            await context.addCookies(otherCookies);
        }
    }

    async simulateLogin(context) {
        if (this.savedSessionCookie) {
        await context.addCookies([this.savedSessionCookie]);
        }
    }
     
    // Checks whether a DOM element is functionally clickable or editable.
    async isElementInteractable(el: ElementHandle<HTMLElement>): Promise<{
        className: string;
        pointerEvents: string;
        tabIndex: string | null;
        ariaDisabled: string | null;
        clickable: boolean;
      }> {
        return await el.evaluate(element => {
          const style = window.getComputedStyle(element);
          const pointerEvents = style.pointerEvents;
          const className = element.className;
          const tabIndex = element.getAttribute('tabindex');
          const ariaDisabled = element.getAttribute('aria-disabled');
          const clickable =
            pointerEvents !== 'none' &&
            !element.hasAttribute('disabled') &&
            ariaDisabled !== 'true';
      
          return {
            className,
            pointerEvents,
            tabIndex,
            ariaDisabled,
            clickable,
          };
        });
      }
      
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



