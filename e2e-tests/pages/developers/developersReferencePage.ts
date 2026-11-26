import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { Box, CodeLanguage, HttpMethod, ParamSection, ParameterInfo, ResponseStatus } from './developersCommon';

/**
 * An endpoint page, `/reference/<slug>` (DEV-REF; PLAN §6.2 A–D and the tag popover of F):
 * headline, parameters, responses, the request card with code samples, and the response
 * card before Try It runs. Running requests is DevelopersTryItPage; sidebar, footer and
 * Discord are DevelopersShellPage.
 *
 * Names come from contract C6 and devportal-ui/src/reference/. Parameter inputs are found by
 * their ids (`<in>-<operationId>_<name>`, body fields `body-<operationId>_<a>_<b>`), which the
 * form builds from the spec, because several sections can hold a field with the same name.
 */
export class DevelopersReferencePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Locators ---------------------------------------------------------------------------

  private get article() {
    return this.page.locator('article#content');
  }

  private get playground() {
    return this.page.locator('#ReferencePlayground');
  }

  private get responseCard() {
    return this.playground.getByRole('region', { name: 'Response', exact: true });
  }

  private get requestCard() {
    return this.playground.locator('.dp-rm-request-card');
  }

  /** The input or select of a parameter; `name` is a dotted path for body fields ("text.body"). */
  private control(section: ParamSection, name: string): Locator {
    const suffix = `_${name.replace(/\./g, '_')}`;
    return this.page.locator(`form#api-request-form :is(input, select)[id^="${section}-"][id$="${suffix}"]`).first();
  }

  /** The header row (name, type, required, default, anchor) that labels a parameter's control. */
  private async headerRow(section: ParamSection, name: string): Promise<Locator> {
    const control = this.control(section, name);
    await expect(control).toBeAttached({ timeout: t(10000) });
    const labelId = await control.getAttribute('aria-labelledby');
    return this.page.locator(`[id="${labelId}"]`).locator('xpath=..');
  }

  /** The row of a parameter: its header, description, control and "Allowed:" chips. */
  private async row(section: ParamSection, name: string): Promise<Locator> {
    const header = await this.headerRow(section, name);
    return header.locator('xpath=ancestor::div[.//*[self::input or self::select]][1]/..');
  }

  private responseToggle(code: string): Locator {
    return this.article
      .getByRole('heading', { level: 3 })
      .getByRole('button')
      .filter({ has: this.page.getByRole('img', { name: code, exact: true }) })
      .first();
  }

  private async responsePanel(code: string): Promise<Locator> {
    const toggle = this.responseToggle(code);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    const id = await toggle.getAttribute('aria-controls');
    return this.page.locator(`[id="${id}"]`);
  }

  private get responseMenuButton() {
    // C6 ResponseStatusMenu: the response card's status button that opens the examples menu.
    return this.responseCard
      .locator('button[aria-haspopup]')
      .filter({ hasNot: this.page.getByText('Headers') })
      .first();
  }

  private async menuEntries(menu: Locator): Promise<string[]> {
    const items = menu.getByRole('menuitem');
    await expect(items.first()).toBeVisible({ timeout: t(5000) });
    // Items may carry an icon abbreviation before their label (MenuItem's label span).
    return items.evaluateAll((list) =>
      list.map((item) =>
        ((item.querySelector('[class*="menuItemLabel"]') ?? item) as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
      )
    );
  }

  private static codeText(pre: Locator): Promise<string> {
    // Line numbers are aria-hidden spans; read only the text column of each row.
    return pre.evaluate((el) => {
      const rows = Array.from(el.querySelectorAll('[class*="__content"]'));
      if (rows.length === 0) return (el.textContent ?? '').trim();
      return rows.map((r) => r.textContent ?? '').join('\n');
    });
  }

  // ---- Headline ---------------------------------------------------------------------------

  async methodBadge(): Promise<HttpMethod> {
    const badge = this.article.getByTestId('http-method').first();
    await expect(badge).toBeVisible({ timeout: t(10000) });
    return (await badge.innerText()).trim().toUpperCase() as HttpMethod;
  }

  /** The URL line as shown, e.g. "https://www.sefaria.org/api/v3/texts/{tref}". */
  async urlLineText(): Promise<string> {
    const url = this.article.getByTestId('serverurl');
    await expect(url).toBeVisible({ timeout: t(10000) });
    return ((await url.textContent()) ?? '').trim();
  }

  /** True when the "Deprecated Endpoint" marker is shown. */
  async isDeprecated(): Promise<boolean> {
    await expect(this.article.getByTestId('http-method').first()).toBeVisible({ timeout: t(10000) });
    const marker = this.article
      .getByRole('button', { name: 'Deprecated Endpoint' })
      .or(this.article.getByText('deprecated', { exact: true }).first());
    return (await marker.count()) > 0;
  }

  /** Click the tag button next to the title; returns the popover's text (the tag's name). */
  async openTagPopover(): Promise<string> {
    await this.article.getByRole('button', { name: 'View tags' }).click();
    const popover = this.page.getByRole('dialog', { name: 'Tags' });
    await expect(popover).toBeVisible({ timeout: t(5000) });
    return (await popover.innerText()).trim();
  }

  /** Bounding boxes of the three columns, for the breakpoint checks; null when not rendered. */
  async layoutBoxes(): Promise<{ sidebar: Box | null; article: Box | null; playground: Box | null }> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    const box = async (locator: Locator) =>
      (await locator.count()) && (await locator.first().isVisible()) ? locator.first().boundingBox() : null;
    return {
      sidebar: await box(this.page.getByRole('navigation', { name: 'Secondary navigation' })),
      article: await box(this.article),
      playground: await box(this.playground),
    };
  }

  // ---- Parameters -------------------------------------------------------------------------

  /** Parameter names of a section, in order; [] when the section is absent. */
  async parameterNames(section: ParamSection): Promise<string[]> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    const header = this.page.locator(`header[id="${section}-params"]`);
    if ((await header.count()) === 0) return [];
    return this.page
      .locator(`[id^="${section}-params-"]`)
      .evaluateAll(
        (rows, prefix) => rows.map((r) => (r.id.startsWith(prefix) ? r.id.slice(prefix.length) : r.id)),
        `${section}-params-`
      );
  }

  async parameterInfo(section: ParamSection, name: string): Promise<ParameterInfo> {
    const header = await this.headerRow(section, name);
    const control = this.control(section, name);
    const parts = await header.evaluate((el) => {
      const texts = Array.from(el.children).map((c) => (c.textContent ?? '').trim());
      return {
        type: texts[1] ?? '',
        required: texts.includes('required'),
        defaultText: texts.find((x) => x.startsWith('Defaults to')) ?? null,
        anchor: el.id,
      };
    });
    const isEnum = (await control.evaluate((el) => el.tagName)) === 'SELECT';
    const placeholder = isEnum
      ? await control.evaluate((el) => (el as HTMLSelectElement).querySelector('option[hidden]')?.textContent ?? null)
      : await control.getAttribute('placeholder');
    return {
      name,
      type: parts.type,
      required: parts.required,
      defaultText: parts.defaultText,
      placeholder: placeholder || null,
      value: await this.parameterValue(section, name),
      isEnum,
      anchor: parts.anchor || `${section}-params-${name}`,
    };
  }

  /** Section anchor ids present on the page (`path-params`, `query-params`, `body-params`, `response-schemas`). */
  async sectionAnchors(): Promise<string[]> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.article
      .getByRole('link', { name: /^Skip link to / })
      .evaluateAll((links) =>
        links
          .map((a) => (a.getAttribute('href') ?? '').replace(/^#/, ''))
          .filter((id) => ['path-params', 'query-params', 'body-params', 'response-schemas'].includes(id))
      );
  }

  /** Type into a text input (clears it first). For a body field use its dotted path, e.g. "text.body". */
  async fillParameter(section: ParamSection, name: string, value: string): Promise<void> {
    const control = this.control(section, name);
    await control.scrollIntoViewIfNeeded({ timeout: t(10000) });
    await control.fill('');
    await control.pressSequentially(value);
    await control.press('Escape');
  }

  async parameterValue(section: ParamSection, name: string): Promise<string> {
    const value = await this.control(section, name).inputValue();
    // An enum's hidden first option shows the example while nothing is chosen (Params.tsx).
    return value === '__placeholder__' ? '' : value;
  }

  async focusParameter(section: ParamSection, name: string): Promise<void> {
    await this.control(section, name).focus();
  }

  async isParameterFocused(section: ParamSection, name: string): Promise<boolean> {
    return this.control(section, name).evaluate((el) => el === document.activeElement);
  }

  /** Choose an option of an enum's select. */
  async selectEnumValue(section: ParamSection, name: string, value: string): Promise<void> {
    // By value: the hidden placeholder option's label is the first example, which can equal a value.
    await this.control(section, name).selectOption({ value });
  }

  /** The "Allowed:" chips of an enum. */
  async allowedChips(section: ParamSection, name: string): Promise<string[]> {
    const row = await this.row(section, name);
    const chips = row
      .getByText('Allowed:', { exact: true })
      .locator('xpath=following-sibling::*[1]')
      .getByRole('button');
    return (await chips.allTextContents()).map((text) => text.replace(/Copied!$/, '').trim());
  }

  /** Click an "Allowed:" chip; returns the feedback it shows ("Copied!"). */
  async clickAllowedChip(section: ParamSection, name: string, value: string): Promise<string> {
    await this.page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => undefined);
    const row = await this.row(section, name);
    const chip = row.getByRole('button', { name: value, exact: true });
    await chip.click();
    const status = chip.getByRole('status');
    await expect(status).toBeVisible({ timeout: t(5000) });
    return (await status.innerText()).trim();
  }

  /** Focus an input with examples; returns its "Use example value" entries. */
  async openExampleList(section: ParamSection, name: string): Promise<string[]> {
    const control = this.control(section, name);
    await control.focus();
    const menu = this.page.getByRole('menu', { name: `Examples for ${name.split('.').pop()}` });
    const items = menu.getByRole('menuitem');
    await expect(items.first()).toBeVisible({ timeout: t(5000) });
    return items.evaluateAll((buttons) =>
      buttons.map((b) => (b.lastElementChild?.textContent ?? b.textContent ?? '').trim())
    );
  }

  /** True while a parameter's "Use example value" list is shown. */
  async isExampleListOpen(section: ParamSection, name: string): Promise<boolean> {
    return this.page.getByRole('menu', { name: `Examples for ${name.split('.').pop()}` }).isVisible();
  }

  /** Press Tab once, moving keyboard focus to the next stop (Shift+Tab with `backwards`). */
  async pressTab(backwards = false): Promise<void> {
    await this.page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }

  async useExampleValue(section: ParamSection, name: string, example: string): Promise<void> {
    await this.openExampleList(section, name);
    const menu = this.page.getByRole('menu', { name: `Examples for ${name.split('.').pop()}` });
    // The entry whose value is exactly `example` ("Rashi on Genesis 1:1" is a prefix of "…1:1:1").
    await menu
      .getByRole('menuitem')
      .filter({ has: this.page.getByText(example, { exact: true }) })
      .first()
      .click();
    await expect(menu).toBeHidden({ timeout: t(5000) });
  }

  /** Expand an object body parameter with "+"; returns its field names. */
  async expandBodyObject(name: string): Promise<string[]> {
    const form = this.page.locator('form#api-request-form');
    const button = form.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)} object`) }).first();
    // Retried: React replaces the server's prerendered form once the spec has loaded, which can detach the button
    // (or leave a click on the inert server markup) while this runs.
    await expect(async () => {
      await button.scrollIntoViewIfNeeded({ timeout: t(3000) });
      if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click({ timeout: t(3000) });
      await expect(button).toHaveAttribute('aria-expanded', 'true', { timeout: t(2000) });
    }).toPass({ timeout: t(15000) });
    return button.evaluate((b) =>
      Array.from(b.parentElement?.querySelectorAll('[data-visual="paramName"]') ?? []).map((l) =>
        (l.textContent ?? '').trim()
      )
    );
  }

  /** Click a `{placeholder}` chip in the URL line (focuses its input). */
  async clickUrlPlaceholder(name: string): Promise<void> {
    await this.article.getByTestId('serverurl').getByText(`{${name}}`, { exact: true }).click();
  }

  // ---- Responses --------------------------------------------------------------------------

  /** "Response" or "Responses". */
  async responsesHeading(): Promise<string> {
    const heading = this.page.locator('header[id="response-schemas"]').getByRole('heading', { level: 2 });
    await expect(heading).toBeVisible({ timeout: t(10000) });
    return (await heading.innerText()).trim();
  }

  async responseStatuses(): Promise<ResponseStatus[]> {
    const toggles = this.article
      .getByRole('heading', { level: 3 })
      .getByRole('button')
      .filter({ has: this.page.getByRole('img') });
    await expect(toggles.first()).toBeVisible({ timeout: t(10000) });
    return toggles.evaluateAll((buttons) =>
      buttons.map((b) => {
        const dot = b.querySelector('[role="img"]') as HTMLElement;
        const code = dot.getAttribute('aria-label') ?? '';
        const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
        // The visible text repeats the code once before the description.
        const description = text.replace(new RegExp(`^(${code}\\s*)+`), '').trim();
        return { code, description, dotColor: getComputedStyle(dot).backgroundColor };
      })
    );
  }

  async toggleResponse(code: string): Promise<void> {
    const toggle = this.responseToggle(code);
    const before = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-expanded', before ?? '', { timeout: t(5000) });
  }

  async isResponseExpanded(code: string): Promise<boolean> {
    const toggle = this.responseToggle(code);
    await expect(toggle).toBeVisible({ timeout: t(10000) });
    return (await toggle.getAttribute('aria-expanded')) === 'true';
  }

  /** Property names shown under "RESPONSE BODY" of an expanded status, at the top level. */
  async responseProperties(code: string): Promise<string[]> {
    const panel = await this.responsePanel(code);
    await expect(panel).toBeVisible({ timeout: t(5000) });
    return panel.evaluate((el) => {
      const names = Array.from(el.querySelectorAll('[class*="propName"]'));
      return names
        .filter((n) => !n.parentElement?.closest('[class*="propChildren"], [class*="expandChildren"]'))
        .map((n) => (n.textContent ?? '').trim());
    });
  }

  /**
   * Open a property's "child attributes"; returns the child property names. Arrays of objects at the top
   * level show their item properties in sub-cards; deeper ones sit behind an expander, which is opened.
   */
  async expandChildAttributes(code: string, property: string): Promise<string[]> {
    return this.openProperty(code, property);
  }

  /** Pick a variant in a union type's select. */
  async selectUnionVariant(code: string, property: string, variant: string): Promise<void> {
    const panel = await this.responsePanel(code);
    const select = panel.getByRole('combobox', { name: `${property} type` }).first();
    await select.selectOption({ label: variant });
  }

  /** The variant a union type's select shows. Added by W14. */
  async unionVariant(code: string, property: string): Promise<string> {
    const panel = await this.responsePanel(code);
    const select = panel.getByRole('combobox', { name: `${property} type` }).first();
    return select.evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? '');
  }

  /** Open a nested array's expander; returns its item properties. */
  async openNestedArray(code: string, property: string): Promise<string[]> {
    return this.openProperty(code, property, true);
  }

  /** Whether any nested-array expander is open. Added by W14. */
  async isNestedArrayOpen(): Promise<boolean> {
    return (
      (await this.article
        .locator('button[aria-expanded="true"]')
        .filter({ hasText: / array$/ })
        .count()) > 0
    );
  }

  /** Close the open nested array with its ✕. */
  async closeNestedArray(): Promise<void> {
    const expanders = this.article.locator('button[aria-expanded]').filter({ hasText: / array$/ });
    const index = await expanders.evaluateAll((list) =>
      list.map((b) => b.getAttribute('aria-expanded')).lastIndexOf('true')
    );
    const open = expanders.nth(index);
    await open.click();
    await expect(open).toHaveAttribute('aria-expanded', 'false', { timeout: t(5000) });
  }

  private async openProperty(code: string, property: string, requireExpander = false): Promise<string[]> {
    const panel = await this.responsePanel(code);
    // The innermost property row of the first property with that name.
    const row = panel
      .locator(
        `xpath=.//span[contains(@class,"propName") and normalize-space()="${property}"]/ancestor::div[contains(@class,"propRow")][1]`
      )
      .first();
    await row.scrollIntoViewIfNeeded({ timeout: t(10000) });
    const expander = row
      .getByRole('button', { name: new RegExp(`^${escapeRegExp(property)} (array|object)$`) })
      .first();
    if (requireExpander || (await expander.count())) {
      if ((await expander.getAttribute('aria-expanded')) !== 'true') await expander.click();
      await expect(expander).toHaveAttribute('aria-expanded', 'true', { timeout: t(5000) });
    }
    return row.evaluate((el) =>
      Array.from(el.querySelectorAll('[class*="propName"]'))
        .filter((n) => {
          const own = n.closest('[class*="propRow"]');
          return own !== el && own?.parentElement?.closest('[class*="propRow"]') === el;
        })
        .map((n) => (n.textContent ?? '').trim())
    );
  }

  /** The example shown, e.g. "200 - Esther 1.1"; null in the empty state. */
  async responseExampleLabel(): Promise<string | null> {
    await expect(this.responseCard).toBeVisible({ timeout: t(10000) });
    if ((await this.responseMenuButton.count()) === 0) return null;
    if (await this.responseCard.getByText(/to start a request and see the response here/).isVisible()) return null;
    return (await this.responseMenuButton.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Open the status dropdown; returns its entries (examples, then "Clear Example"). */
  async openResponseExampleMenu(): Promise<string[]> {
    await this.responseMenuButton.click();
    return this.menuEntries(this.page.getByRole('menu', { name: 'Response examples' }));
  }

  async chooseResponseExample(label: string): Promise<void> {
    const menu = this.page.getByRole('menu', { name: 'Response examples' });
    if (!(await menu.isVisible())) await this.responseMenuButton.click();
    await menu.getByRole('menuitem').filter({ hasText: label }).first().click();
    await expect(menu).toBeHidden({ timeout: t(5000) });
  }

  async clearResponseExample(): Promise<void> {
    const menu = this.page.getByRole('menu', { name: 'Response examples' });
    if (!(await menu.isVisible())) await this.responseMenuButton.click();
    await menu.getByRole('menuitem', { name: 'Clear Example' }).click();
    await expect(this.responseCard.getByText(/to start a request and see the response here/)).toBeVisible({
      timeout: t(5000),
    });
  }

  /** The example chips of the empty state. */
  async emptyStateExampleChips(): Promise<string[]> {
    await expect(this.responseCard.getByText(/to start a request and see the response here/)).toBeVisible({
      timeout: t(5000),
    });
    const chips = this.responseCard.getByRole('button').filter({ has: this.page.getByRole('img') });
    return (await chips.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
  }

  // ---- Code samples -----------------------------------------------------------------------

  private get languageButtonsLocator() {
    return this.playground.locator('button[aria-pressed]');
  }

  async languageButtons(): Promise<CodeLanguage[]> {
    await expect(this.languageButtonsLocator.first()).toBeVisible({ timeout: t(10000) });
    // A button may show a small logo text before its label ("php"): the label is the last line.
    return (await this.languageButtonsLocator.allInnerTexts()).map(
      (text) => text.trim().split(/\n/).pop()!.trim() as CodeLanguage
    );
  }

  /** The pressed language button (aria-pressed). */
  async selectedLanguage(): Promise<CodeLanguage> {
    const pressed = this.playground.locator('button[aria-pressed="true"]');
    await expect(pressed).toBeVisible({ timeout: t(10000) });
    return (await pressed.innerText()).trim().split(/\n/).pop()!.trim() as CodeLanguage;
  }

  async selectLanguage(language: CodeLanguage): Promise<void> {
    const button = this.languageButtonsLocator.filter({ hasText: new RegExp(`${language}$`) }).first();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: t(5000) });
  }

  /** Open the "⋯" menu; returns its entries (18). */
  async openMoreLanguages(): Promise<string[]> {
    await this.playground.getByRole('button', { name: 'More Languages' }).click();
    return this.menuEntries(this.page.getByRole('menu', { name: 'More Languages' }).last());
  }

  async chooseMoreLanguage(name: string): Promise<void> {
    const menu = this.page.getByRole('menu', { name: 'More Languages' }).last();
    if (!(await menu.isVisible())) await this.playground.getByRole('button', { name: 'More Languages' }).click();
    await menu.getByRole('menuitem', { name, exact: true }).click();
  }

  private get libraryButton() {
    return this.requestCard.locator('button[title="Toggle library"]');
  }

  /** Open the request card's library menu for the language; returns its entries. */
  async openLibraryMenu(): Promise<string[]> {
    await this.libraryButton.click();
    return this.menuEntries(this.page.getByRole('menu', { name: 'Library' }));
  }

  async selectLibrary(name: string): Promise<void> {
    const menu = this.page.getByRole('menu', { name: 'Library' });
    if (!(await menu.isVisible())) await this.libraryButton.click();
    await menu.getByRole('menuitem').filter({ hasText: name }).first().click();
    await expect(menu).toBeHidden({ timeout: t(5000) });
  }

  async selectedLibrary(): Promise<string> {
    await expect(this.requestCard).toBeVisible({ timeout: t(10000) });
    const label = (await this.libraryButton.count())
      ? this.libraryButton
      : this.requestCard.locator('header section').first();
    return (await label.innerText()).replace(/\s+/g, ' ').trim();
  }

  async codeSampleText(): Promise<string> {
    const pre = this.requestCard.locator('pre[aria-label$="request sample"]');
    await expect(pre).toBeVisible({ timeout: t(10000) });
    return DevelopersReferencePage.codeText(pre);
  }

  /** Click the request card's copy button; returns its label afterwards ("Copied!"). */
  async copyCodeSample(): Promise<string> {
    await this.page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => undefined);
    const button = this.requestCard.getByRole('button', { name: 'Copy to clipboard' });
    await button.click();
    const status = button.getByRole('status');
    await expect(status).toBeVisible({ timeout: t(5000) });
    return (await status.innerText()).trim();
  }

  /** The clipboard's text (after a copy button). Added by W14. */
  async clipboardText(): Promise<string> {
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  /** POST pages: the "Examples" dropdown of request bodies; [] when absent. */
  async requestBodyExamples(): Promise<string[]> {
    await expect(this.requestCard).toBeVisible({ timeout: t(10000) });
    const button = this.requestCard.getByRole('button', { name: 'Examples' });
    if ((await button.count()) === 0) return [];
    await button.click();
    const entries = await this.menuEntries(this.page.getByRole('menu', { name: 'Examples' }));
    await this.page.keyboard.press('Escape');
    return entries;
  }

  async selectRequestBodyExample(name: string): Promise<void> {
    await this.requestCard.getByRole('button', { name: 'Examples' }).click();
    const menu = this.page.getByRole('menu', { name: 'Examples' });
    await menu.getByRole('menuitem').filter({ hasText: name }).first().click();
    await expect(menu).toBeHidden({ timeout: t(5000) });
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
