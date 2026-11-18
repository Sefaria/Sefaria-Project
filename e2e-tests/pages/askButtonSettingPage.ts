import { Locator, Page, expect } from '@playwright/test';
import { HelperBase } from './helperBase';
import { LibraryAssistantQ4Page } from './libraryAssistantQ4Page';
import { MobileHamburgerPage } from './mobileHamburgerPage';
import { assistantString, sefariaString } from '../support/assistantStrings';
import { MOBILE_HAMBURGER } from '../constants';
import { t } from '../globals';

/**
 * The Library Assistant's "Hide / Show Ask button" setting (sc-48380, LA-HIDE-*): the item in
 * the assistant's More options menu and the "Hide or show Ask button" dialog it opens.
 *
 * Copy is read by translation key (support/assistantStrings.ts), so a copy edit in Weblate
 * doesn't break a test. Opening and closing the assistant reuse LibraryAssistantQ4Page.
 */

/** Sefaria brand blue (--action-primary → --core-navy-700, #18345D), as getComputedStyle reports it. */
const SEFARIA_BLUE = 'rgb(24, 52, 93)';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class AskButtonSettingPage extends HelperBase {
  readonly la: LibraryAssistantQ4Page;

  constructor(page: Page, language: string) {
    super(page, language);
    this.la = new LibraryAssistantQ4Page(page, language);
  }

  /** Text for an `assistant.*` translation key in this page's interface language. */
  a(key: string): string {
    return assistantString(key, this.language);
  }

  // ---------------------------------------------------------------------------
  // Locators
  // ---------------------------------------------------------------------------

  /** The floating "✦ Ask" button. */
  private get askButton(): Locator {
    const label = escapeRegExp(this.a('assistant.floating_button.label'));
    return this.page.getByRole('button').filter({ hasText: new RegExp(`^\\s*✦?\\s*${label}\\s*$`) });
  }

  /** The open assistant: a floating panel on wide screens, a full-screen sheet on phones. */
  private get assistant(): Locator {
    return this.page.getByRole('dialog', { name: this.a('assistant.header.chatWindow') });
  }

  private get minimizeButton(): Locator {
    return this.assistant.getByRole('button', { name: this.a('assistant.header.close.tooltip'), exact: true });
  }

  private get moreOptionsButton(): Locator {
    return this.assistant.getByRole('button', { name: this.a('assistant.header.moreOptions'), exact: true }).first();
  }

  private get menuItems(): Locator {
    return this.assistant.getByRole('menuitem');
  }

  /** A More options item, by the key of its visible words. */
  menuItem(key: string): Locator {
    const words = escapeRegExp(this.a(key));
    return this.menuItems.filter({ hasText: new RegExp(`^\\s*${words}\\s*$`) });
  }

  /** The "Hide or show Ask button" dialog. */
  private get settingDialog(): Locator {
    return this.page.getByRole('dialog', { name: this.a('assistant.floating_button_modal.title') });
  }

  private get switchControl(): Locator {
    return this.settingDialog.getByRole('switch');
  }

  private get doneButton(): Locator {
    return this.settingDialog.getByRole('button', { name: this.a('assistant.floating_button_modal.done'), exact: true });
  }

  private get dialogLinks(): Locator {
    return this.settingDialog.getByRole('link');
  }

  /** "Library Assistant" in Sefaria's phone hamburger menu. */
  private get hamburgerItem(): Locator {
    const name = new RegExp(escapeRegExp(sefariaString('header.library_assistant', this.language)));
    const menu = this.page.getByRole('navigation', { name: MOBILE_HAMBURGER.NAV_MENU_LABEL });
    return menu.getByRole('link', { name }).or(menu.getByRole('button', { name })).first();
  }

  private async isTouch(): Promise<boolean> {
    return this.page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
  }

  private async press(locator: Locator): Promise<void> {
    if (await this.isTouch()) await locator.tap();
    else await locator.click();
  }

  private async isPhoneHeader(): Promise<boolean> {
    return this.page.evaluate(() => window.innerWidth < 843);
  }

  // ---------------------------------------------------------------------------
  // The assistant and the Ask button
  // ---------------------------------------------------------------------------

  /** The assistant has loaded on the page. */
  async waitForAssistant(): Promise<void> {
    await expect(this.page.locator('lc-chatbot')).toHaveCount(1, { timeout: t(15000) });
    await this.page.waitForLoadState('load').catch(() => {});
  }

  /** Open the assistant: with the Ask button when it shows, otherwise from the header or hamburger menu. */
  async openAssistant(): Promise<void> {
    await this.waitForAssistant();
    if (await this.assistant.isVisible()) return;
    if (await this.askButton.isVisible()) await this.press(this.askButton);
    else if (await this.isPhoneHeader()) await this.openFromHamburgerMenu();
    else await this.openFromHeader();
    await this.expectAssistantOpen();
  }

  async openFromHeader(): Promise<void> {
    await this.la.clickHeaderPill();
    await this.expectAssistantOpen();
  }

  async openFromHamburgerMenu(): Promise<void> {
    await new MobileHamburgerPage(this.page, this.language).openMenu();
    await this.hamburgerItem.tap();
    await this.expectAssistantOpen();
  }

  async closeAssistant(): Promise<void> {
    await this.press(this.minimizeButton);
    await expect(this.assistant).toBeHidden({ timeout: t(5000) });
  }

  /** The assistant can open by itself on load (its last state, or the host's default). */
  async closeAssistantIfOpen(): Promise<void> {
    await expect(this.askButton.or(this.assistant).first()).toBeVisible({ timeout: t(15000) }).catch(() => {});
    if (await this.assistant.isVisible()) await this.closeAssistant();
  }

  async expectAssistantOpen(): Promise<void> {
    await expect(this.assistant).toBeVisible({ timeout: t(10000) });
  }

  async expectAskButton(shown: boolean): Promise<void> {
    await this.waitForAssistant();
    // The assistant can open by itself on load; the Ask button only shows while it's closed.
    if (shown) await this.closeAssistantIfOpen();
    if (shown) await expect(this.askButton).toBeVisible({ timeout: t(10000) });
    else await expect(this.askButton).toBeHidden({ timeout: t(5000) });
  }

  /** LA-HIDE-10: the Ask button is back in the bottom corner of the window. */
  async expectAskButtonInBottomCorner(): Promise<void> {
    await expect(this.askButton).toBeVisible({ timeout: t(10000) });
    const box = (await this.askButton.boundingBox())!;
    const { width, height } = this.page.viewportSize()!;
    expect(height - (box.y + box.height), 'gap below the Ask button').toBeLessThan(80);
    const side = Math.min(box.x, width - (box.x + box.width));
    expect(side, 'gap beside the Ask button').toBeLessThan(80);
  }

  async expectHeaderItem(): Promise<void> {
    await this.la.expectHeaderPillShows('full');
  }

  async expectNoHeaderItem(): Promise<void> {
    await this.la.expectNoHeaderPill();
  }

  async expectHamburgerItem(): Promise<void> {
    await new MobileHamburgerPage(this.page, this.language).openMenu();
    await expect(this.hamburgerItem).toBeVisible({ timeout: t(5000) });
  }

  // ---------------------------------------------------------------------------
  // The More options menu
  // ---------------------------------------------------------------------------

  async openMoreOptions(): Promise<void> {
    await this.openAssistant();
    await this.press(this.moreOptionsButton);
    await expect(this.menuItems.first()).toBeVisible({ timeout: t(5000) });
  }

  async chooseMenuItem(key: string): Promise<void> {
    await this.listenForClicks();
    await this.press(this.menuItem(key));
  }

  async expectMenuClosed(): Promise<void> {
    await expect(this.menuItems).toHaveCount(0, { timeout: t(5000) });
  }

  /** LA-HIDE-1: the item's words, and its icon (`eye` or `eye-off`). */
  async expectMenuItemWithIcon(key: string, icon: 'eye' | 'eye-off'): Promise<void> {
    const item = this.menuItem(key);
    await expect(item).toBeVisible({ timeout: t(5000) });
    await expect(item.locator('img')).toHaveAttribute('src', new RegExp(`/${icon}\\.svg$`));
  }

  private async menuWords(): Promise<string[]> {
    return (await this.menuItems.allInnerTexts()).map((s) => s.trim());
  }

  async expectComesRightAfter(key: string, previousKey: string): Promise<void> {
    const words = await this.menuWords();
    const at = words.indexOf(this.a(key));
    expect(at, `"${this.a(key)}" in the menu ${JSON.stringify(words)}`).toBeGreaterThan(0);
    expect(words[at - 1]).toBe(this.a(previousKey));
  }

  async expectLastItem(key: string): Promise<void> {
    const words = await this.menuWords();
    expect(words[words.length - 1], `last item of ${JSON.stringify(words)}`).toBe(this.a(key));
  }

  /** LA-HIDE-37: the item's accessible name, which analytics records as the click's name. */
  async expectMenuItemNamed(key: string, nameKey: string): Promise<void> {
    await expect(this.menuItem(key)).toHaveAccessibleName(this.a(nameKey));
  }

  // ---------------------------------------------------------------------------
  // The "Hide or show Ask button" dialog
  // ---------------------------------------------------------------------------

  async openSettingDialog(): Promise<void> {
    await this.openMoreOptions();
    const hidden = await this.menuItem('assistant.menu.show_floating_button').isVisible();
    await this.chooseMenuItem(hidden ? 'assistant.menu.show_floating_button' : 'assistant.menu.hide_floating_button');
    await this.expectSettingDialogOpen();
  }

  async expectSettingDialogOpen(): Promise<void> {
    await expect(this.settingDialog).toBeVisible({ timeout: t(5000) });
    await expect(this.assistant).toBeVisible();
  }

  async expectSettingDialogClosed(): Promise<void> {
    await expect(this.settingDialog).toBeHidden({ timeout: t(5000) });
  }

  /** LA-HIDE-4: the switch sits beside "Show the Ask button" and is on or off. */
  async expectSwitch(on: boolean): Promise<void> {
    await expect(this.switchControl).toBeVisible({ timeout: t(5000) });
    const row = this.settingDialog.locator('label').filter({ has: this.page.getByRole('switch') });
    await expect(row).toContainText(this.a('assistant.floating_button_modal.toggle'));
    if (on) await expect(this.switchControl).toBeChecked({ timeout: t(5000) });
    else await expect(this.switchControl).not.toBeChecked({ timeout: t(5000) });
  }

  async expectDoneButton(): Promise<void> {
    await expect(this.doneButton).toBeVisible();
  }

  async setSwitch(on: boolean): Promise<void> {
    if ((await this.switchControl.isChecked()) !== on) await this.pressSwitch();
    await this.expectSwitch(on);
  }

  async pressSwitch(): Promise<void> {
    await this.listenForClicks();
    await this.press(this.switchControl);
  }

  /** LA-HIDE-11 */
  async toggleSwitchWithKeyboard(): Promise<void> {
    await this.switchControl.focus();
    await this.page.keyboard.press('Space');
  }

  async pressDone(): Promise<void> {
    await this.press(this.doneButton);
    await this.expectSettingDialogClosed();
  }

  /** LA-HIDE-39: the switch's accessible name. */
  async expectSwitchNamed(nameKey: string): Promise<void> {
    await expect(this.switchControl).toHaveAccessibleName(this.a(nameKey));
  }

  /** Set the Ask button from wherever the page is, leaving the assistant closed. */
  async setAskButton(shown: boolean): Promise<void> {
    await this.openSettingDialog();
    await this.setSwitch(shown);
    await this.pressDone();
    await this.closeAssistant();
    await this.expectAskButton(shown);
  }

  /** The dialog's sentence for `key`, with each {placeholder} filled with its link's words. */
  private sentence(key: string): string {
    return this.a(key).replace(/\{(\w+)\}/g, (_, name) => this.a(`assistant.floating_button_modal.${name}`));
  }

  async expectDialogSays(key: string): Promise<void> {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    await expect.poll(async () => normalize(await this.settingDialog.innerText())).toContain(normalize(this.sentence(key)));
  }

  async expectDialogLinks(keys: string[]): Promise<void> {
    await expect(this.dialogLinks).toHaveText(keys.map((key) => this.a(key)));
  }

  async clickDialogLink(key: string): Promise<void> {
    await this.dialogLinks.filter({ hasText: this.a(key) }).click();
  }

  /** LA-HIDE-36 / 33: the switch's colour, and which side of the track its knob is on. */
  async switchLook(): Promise<{ background: string; knob: 'left' | 'right'; visible: boolean }> {
    await this.page.waitForTimeout(t(300)); // let the 0.15s colour and knob transitions finish
    return this.switchControl.evaluate((input) => {
      const style = getComputedStyle(input);
      const transform = getComputedStyle(input, '::after').transform;
      const shift = transform && transform !== 'none' ? new DOMMatrix(transform).m41 : 0;
      const startsLeft = style.direction !== 'rtl';
      const knobAtStart = shift === 0;
      const box = input.getBoundingClientRect();
      return {
        background: style.backgroundColor,
        knob: knobAtStart === startsLeft ? 'left' : 'right',
        visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.opacity !== '0',
      };
    });
  }

  async expectSwitchLook(on: boolean): Promise<void> {
    const look = await this.switchLook();
    expect(look.visible, 'the switch should be visible').toBe(true);
    if (on) {
      expect(look.background, 'an on switch is Sefaria blue').toBe(SEFARIA_BLUE);
    } else {
      const [r, g, b] = look.background.match(/\d+/g)!.map(Number);
      expect(Math.max(r, g, b) - Math.min(r, g, b), `an off switch is gray (${look.background})`).toBeLessThanOrEqual(12);
      expect(r, `an off switch is a visible gray (${look.background})`).toBeLessThan(240);
    }
    const onSide = this.isHebrew ? 'left' : 'right';
    const offSide = onSide === 'left' ? 'right' : 'left';
    expect(look.knob, 'the knob is on its side').toBe(on ? onSide : offSide);
  }

  private get isHebrew(): boolean {
    return this.language === 'hebrew';
  }

  /** LA-HIDE-33: the dialog's text runs right to left and is right-aligned. */
  async expectDialogRightToLeft(): Promise<void> {
    const texts = this.settingDialog.locator('p');
    for (const p of await texts.all()) {
      const { direction, textAlign } = await p.evaluate((el) => {
        const s = getComputedStyle(el);
        return { direction: s.direction, textAlign: s.textAlign };
      });
      expect(direction).toBe('rtl');
      expect(['right', 'start']).toContain(textAlign);
    }
  }

  /** LA-HIDE-33: "sign up" sits to the right of "log in", so it's read first. */
  async expectSignUpReadFirst(): Promise<void> {
    const signUp = (await this.dialogLinks.filter({ hasText: this.a('assistant.floating_button_modal.sign_up') }).boundingBox())!;
    const logIn = (await this.dialogLinks.filter({ hasText: this.a('assistant.floating_button_modal.log_in') }).boundingBox())!;
    if (Math.abs(signUp.y - logIn.y) < 4) expect(signUp.x).toBeGreaterThan(logIn.x);
    else expect(signUp.y).toBeLessThan(logIn.y);
  }

  /** LA-HIDE-32: none of the item's or dialog's words are English or a raw key. */
  async expectReadsInHebrew(scope: 'menu item' | 'dialog'): Promise<void> {
    const words = scope === 'menu item'
      ? [await this.menuItem('assistant.menu.hide_floating_button').innerText()]
      : [await this.settingDialog.innerText()];
    for (const text of words) {
      expect(text, 'no raw translation key').not.toMatch(/assistant\.\w/);
      expect(text, 'no English words').not.toMatch(/[A-Za-z]{2,}/);
      expect(text, 'Hebrew words').toMatch(/[֐-׿]/);
    }
  }

  /** LA-HIDE-34: nothing in the dialog sticks out sideways, and its controls are tall enough to tap. */
  async expectDialogFitsPhone(): Promise<void> {
    const box = (await this.settingDialog.boundingBox())!;
    const { width } = this.page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const overflow = await this.settingDialog.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, 'no sideways scrolling inside the dialog').toBeLessThanOrEqual(0);
  }

  async expectTapTargets(minHeight: number): Promise<void> {
    const row = this.settingDialog.locator('label').filter({ has: this.page.getByRole('switch') });
    for (const target of [row, this.doneButton]) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(minHeight - 0.5);
    }
  }

  // ---------------------------------------------------------------------------
  // Analytics (LA-HIDE-37 to 39)
  // ---------------------------------------------------------------------------

  /** Record the assistant's analytics events from now on, wrapping gtag (or standing in for it). */
  async listenForClicks(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as unknown as { gtag?: (...args: unknown[]) => void; __laClicks?: string[] };
      if (w.__laClicks) return;
      const clicks: string[] = [];
      const original = w.gtag;
      w.__laClicks = clicks;
      w.gtag = (...args: unknown[]) => {
        const [type, event, params] = args as [string, string, { feature_name?: string }];
        if (type === 'event' && event === 'assistant_click' && params?.feature_name) clicks.push(params.feature_name);
        if (typeof original === 'function') original(...args);
      };
    });
  }

  async expectClickRecorded(nameKey: string): Promise<void> {
    const name = this.a(nameKey);
    await expect.poll(() => this.page.evaluate(() => (window as unknown as { __laClicks?: string[] }).__laClicks ?? []))
      .toContain(name);
  }
}
