import { Locator, Page, Request, expect } from '@playwright/test';
import { DeveloperSettingsPage } from './developerSettingsPage';
import { t } from '../globals';

/**
 * The "Publish your project" form in Developer Settings (EShareProject in static/js/SettingsPage.jsx), its
 * "submitted" page, and the project's publish chip on the home page. Used by the DS-PUB-* stories
 * (e2e-tests/feature-specs/features/account/developer-settings-behavior-specs.feature).
 */
export class DeveloperSettingsPublishPage extends DeveloperSettingsPage {
  /** The interface-string keys of "What are you building?"'s options, in the order of their stored values. */
  static readonly PURPOSES: [string, string][] = [
    ['personal', 'developer.project_form.purpose.option_01'],
    ['school', 'developer.project_form.purpose.option_02'],
    ['research', 'developer.project_form.purpose.option_03'],
    ['community', 'developer.project_form.purpose.option_04'],
    ['commercial', 'developer.project_form.purpose.option_05'],
    ['other', 'developer.project_form.purpose.option_06'],
  ];

  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- The form ----------------------------------------------------------------------------

  form(): Locator {
    return this.root().locator('form.devE-shareForm');
  }

  async isFormOpen(): Promise<boolean> {
    return this.form().isVisible();
  }

  async expectFormOpen(): Promise<void> {
    await this.expectStepTitle(await this.str('developer.publish_form.header'));
    await expect(this.form()).toBeVisible({ timeout: t(15000) });
  }

  /** A form section, by its heading. */
  section(title: string): Locator {
    return this.form()
      .locator('section.devE-shareSection')
      .filter({ has: this.page.getByRole('heading', { name: title, exact: true }) });
  }

  async aboutYou(): Promise<Locator> {
    return this.section(await this.str('developer.publish_form.about_you.header'));
  }

  async yourProject(): Promise<Locator> {
    return this.section(await this.str('developer.publish_form.project.header'));
  }

  submitButton(): Locator {
    return this.form().locator('[data-agent-action="share-project"]');
  }

  /** Whether any part of the element is inside the window right now. */
  async inViewport(el: Locator): Promise<boolean> {
    return el.evaluate((node) => {
      const r = (node as Element).getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    });
  }

  async submit(): Promise<void> {
    await this.submitButton().scrollIntoViewIfNeeded();
    await this.submitButton().click();
  }

  /** Submits and waits for "Your project was submitted for review". */
  async submitAndWait(): Promise<void> {
    await this.submit();
    await this.expectSubmittedPage();
  }

  async expectSubmittedPage(): Promise<void> {
    await this.expectStepTitle(await this.str('developer.publish_submitted.header'));
  }

  // --- Project picker -------------------------------------------------------------------------

  picker(): Locator {
    return this.form().locator('#devESharePick');
  }

  pickerLabel(): Locator {
    return this.form().locator('#devESharePick-label');
  }

  pickerOptions(): Locator {
    return this.form().locator('#devESharePick-list').getByRole('option');
  }

  async openPicker(): Promise<void> {
    if ((await this.picker().getAttribute('aria-expanded')) !== 'true') await this.picker().click();
    await expect(this.form().locator('#devESharePick-list')).toBeVisible({ timeout: t(5000) });
  }

  async closePicker(): Promise<void> {
    if ((await this.picker().getAttribute('aria-expanded')) === 'true') await this.picker().press('Escape');
    await expect(this.form().locator('#devESharePick-list')).toHaveCount(0);
  }

  async pickProject(name: string): Promise<void> {
    await this.openPicker();
    await this.pickerOptions().filter({ hasText: name }).first().click();
    await expect(this.picker()).toContainText(name);
  }

  // --- Project fields ---------------------------------------------------------------------------

  nameField(): Locator {
    return this.form().locator('#devEProjName');
  }
  purposeField(): Locator {
    return this.form().locator('#devEProjPurpose');
  }
  descriptionField(): Locator {
    return this.form().locator('#devEProjDesc');
  }
  websiteField(): Locator {
    return this.form().locator('#devEProjSite');
  }

  /** The inline error under a field (Input and Select both give it the id `<field id>-error`). */
  fieldError(fieldId: string): Locator {
    return this.form().locator(`#${fieldId}-error`);
  }

  /** The project's summary (name, description, website) with its Edit button. */
  async projectSummary(): Promise<Locator> {
    return (await this.yourProject()).locator('.devE-summary');
  }

  /** Opens the project's own fields (clicks Edit on its summary) unless they are open already. */
  async openProjectFields(): Promise<void> {
    if (await this.descriptionField().isVisible()) return;
    const edit = (await this.projectSummary()).getByRole('button', {
      name: await this.str('developer.publish_form.summary_edit.button'),
    });
    await edit.click();
    await expect(this.descriptionField()).toBeVisible({ timeout: t(5000) });
  }

  async choosePurpose(label: string): Promise<void> {
    await this.purposeField().click();
    await this.form().locator('#devEProjPurpose-list').getByRole('option', { name: label, exact: true }).click();
    await expect(this.purposeField()).toContainText(label);
  }

  async fillProjectFields(f: { name: string; purposeLabel: string; description: string; website: string }) {
    await this.nameField().fill(f.name);
    await this.choosePurpose(f.purposeLabel);
    await this.descriptionField().fill(f.description);
    await this.websiteField().fill(f.website);
    await this.websiteField().blur();
  }

  // --- More about the project ---------------------------------------------------------------------

  private fieldset(legend: string): Locator {
    return this.form()
      .locator('fieldset')
      .filter({ has: this.page.locator('legend', { hasText: legend }) })
      .first();
  }

  async categories(): Promise<Locator> {
    return this.fieldset(await this.str('developer.publish_form.category.label'));
  }

  async categoryBoxes(): Promise<Locator> {
    return (await this.categories()).getByRole('checkbox');
  }

  async tools(): Promise<Locator> {
    return this.fieldset(await this.str('developer.publish_form.sefaria_tools.label'));
  }

  /** Each tool option's row (checkbox and label, with the label's link when it has one). */
  async toolRows(): Promise<Locator> {
    return (await this.tools()).locator('.sefaria-checkbox');
  }

  async setChecked(box: Locator, on: boolean): Promise<void> {
    if ((await box.isChecked()) !== on) {
      await box.scrollIntoViewIfNeeded();
      await box.click({ force: true }); // the native box is drawn over by the design system's icon
    }
    if (on) await expect(box).toBeChecked();
    else await expect(box).not.toBeChecked();
  }

  /** Ticks the category checkboxes at these positions (0-based) and unticks the rest. */
  async chooseCategories(indexes: number[]): Promise<void> {
    const boxes = await this.categoryBoxes();
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await this.setChecked(boxes.nth(i), indexes.includes(i));
  }

  async chooseTools(indexes: number[]): Promise<void> {
    const boxes = (await this.tools()).getByRole('checkbox');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await this.setChecked(boxes.nth(i), indexes.includes(i));
  }

  sourceField(): Locator {
    return this.form().locator('#devEShareSource');
  }

  anythingElseField(): Locator {
    return this.form().locator('#devEShareElse');
  }

  async showNameBox(): Promise<Locator> {
    return this.form().getByRole('checkbox', {
      name: await this.str('developer.publish_form.show_name.label'),
      exact: true,
    });
  }

  // --- Home page -------------------------------------------------------------------------------

  /** Opens the publish form from a project's "Publish project" button on the home page. */
  async openFromProject(projectName: string): Promise<void> {
    const name = await this.str('developer.home.project_menu.publish.button');
    const button = this.project(projectName).getByRole('button', { name, exact: true });
    await expect(button).toBeVisible({ timeout: t(15000) });
    await button.click();
    await this.expectFormOpen();
  }

  /** Opens the publish form from the page header's "Publish a project". */
  async openFromHeader(): Promise<void> {
    const name = await this.str('developer.frame.publish_project.button');
    const button = this.page.getByRole('button', { name, exact: true }).first();
    await expect(button).toBeVisible({ timeout: t(15000) });
    await button.click();
    await this.expectFormOpen();
  }

  /** The "Submitted for review" note of a project on the home page. */
  async submittedNote(projectName: string): Promise<Locator> {
    const text = await this.str('developer.home.project_menu.submitted.note');
    // The chip (icon and text), not just the text inside it.
    return this.project(projectName)
      .locator('.devE-projExtras .devE-chips > *')
      .filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) });
  }

  /** The look of an element and its icon: what a hover could change. */
  async look(el: Locator): Promise<Record<string, string>> {
    return el.evaluate((node) => {
      const s = getComputedStyle(node as Element);
      const svg = (node as Element).querySelector('svg');
      const i = svg ? getComputedStyle(svg) : null;
      return {
        tag: (node as Element).tagName.toLowerCase(),
        color: s.color,
        background: s.backgroundColor,
        textDecoration: s.textDecorationLine,
        borderColor: s.borderColor,
        cursor: s.cursor,
        fontWeight: s.fontWeight,
        iconColor: i ? i.color : '',
        iconStroke: i ? i.stroke : '',
      };
    });
  }

  // --- Network --------------------------------------------------------------------------------

  /** Records every write the page makes to the developer API from now on. */
  recordWrites(): Request[] {
    const writes: Request[] = [];
    this.page.on('request', (r) => {
      if (r.url().includes('/api/developer/') && r.method() !== 'GET') writes.push(r);
    });
    return writes;
  }
}
