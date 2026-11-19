import { Locator, Page, Request, expect } from '@playwright/test';
import { DeveloperSettingsPage } from './developerSettingsPage';
import { t } from '../globals';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "What are you building?" answers: the value the server stores and the option's interface string. */
export const PURPOSES: Record<string, { value: string; key: string }> = {
  Personal: { value: 'personal', key: 'developer.project_form.purpose.option_01' },
  School: { value: 'school', key: 'developer.project_form.purpose.option_02' },
  Research: { value: 'research', key: 'developer.project_form.purpose.option_03' },
  Community: { value: 'community', key: 'developer.project_form.purpose.option_04' },
  Commercial: { value: 'commercial', key: 'developer.project_form.purpose.option_05' },
  Other: { value: 'other', key: 'developer.project_form.purpose.option_06' },
};

export const purposeKey = (value: string): string => {
  const found = Object.values(PURPOSES).find((p) => p.value === value);
  if (!found) throw new Error(`Unknown purpose ${value}`);
  return found.key;
};

/**
 * Developer Settings projects: the project form (new and edit), the delete-project and
 * remove-website windows, the project blocks on the home page, and Back through the steps.
 * Used by devSettings.projects.steps.ts (DS-PROJ-*, DS-NAV-2..4).
 */
export class DeveloperSettingsProjectsPage extends DeveloperSettingsPage {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- Home page -----------------------------------------------------------------------

  /**
   * A project block on the home page. Its accessible name is its heading, which also carries
   * " · <organization>" when there is one, so match the name at the start.
   */
  projectBlock(name: string): Locator {
    return this.root()
      .getByRole('region')
      .filter({
        has: this.page.getByRole('heading', { level: 3, name: new RegExp(`^${escapeRe(name)}(\\s*·.*)?$`) }),
      });
  }

  /** The project's website link (the desktop one; the phone copy is hidden by CSS on desktop). */
  websiteLink(projectName: string, host: string): Locator {
    return this.projectBlock(projectName)
      .getByRole('link', { name: new RegExp(`^${escapeRe(host)}\\b`) })
      .filter({ visible: true });
  }

  async newProjectButton(): Promise<Locator> {
    return this.button(await this.str('developer.home.new_project.button'));
  }

  async createProjectButton(): Promise<Locator> {
    return this.button(await this.str('developer.home.empty.create_project.button'));
  }

  async editDetailsButton(projectName: string): Promise<Locator> {
    const name = await this.str('developer.home.project.edit_details.button');
    return this.projectBlock(projectName).getByRole('button', { name, exact: true }).filter({ visible: true });
  }

  async openEditDetails(projectName: string): Promise<void> {
    const button = await this.editDetailsButton(projectName);
    await expect(button).toBeVisible({ timeout: t(15000) });
    await button.click();
    await this.expectStepTitle(await this.str('developer.edit_project.intro', { project_name: projectName }));
  }

  /** Opens the new-project form from the home page: "New project", or "Create a project" with none. */
  async openNewProjectForm(): Promise<void> {
    const button = (await this.newProjectButton()).or(await this.createProjectButton());
    await expect(button.first()).toBeVisible({ timeout: t(15000) });
    await button.first().click();
    await expect(this.siteField()).toBeVisible({ timeout: t(15000) });
  }

  async addKeyButton(projectName: string): Promise<Locator> {
    const name = await this.str('developer.home.project.add_key.button');
    return this.projectBlock(projectName).getByRole('button', { name, exact: true });
  }

  /** The tooltip or phone note that says why New project is off. */
  projectLimitReason(): Locator {
    return this.page.locator('#devEProjLimitTip');
  }

  async developerTab(): Promise<Locator> {
    const name = await this.str('developer.frame.developer_tab.label');
    return this.page.getByRole('navigation').getByRole('link', { name, exact: true });
  }

  // --- Project form --------------------------------------------------------------------

  nameField(): Locator {
    return this.page.locator('#devEProjName');
  }
  orgField(): Locator {
    return this.page.locator('#devEProjOrg');
  }
  descriptionField(): Locator {
    return this.page.locator('#devEProjDesc');
  }
  siteField(): Locator {
    return this.page.locator('#devEProjSite');
  }
  /** "What are you building?": a button that opens a listbox. */
  purposeControl(): Locator {
    return this.page.locator('#devEProjPurpose');
  }
  fieldError(fieldId: string): Locator {
    return this.page.locator(`#${fieldId}-error`);
  }

  /** The step number next to a setup step's title. */
  stepCounter(): Locator {
    return this.stepTitle().locator('.devE-stepN');
  }

  /** The link above a single step back to the projects ("Projects and API keys"). */
  async backToProjectsLink(): Promise<Locator> {
    return this.button(await this.str('developer.common.projects_and_keys.header'));
  }

  async choosePurpose(english: string): Promise<void> {
    const purpose = PURPOSES[english];
    if (!purpose) throw new Error(`No "What are you building?" answer ${english}`);
    await this.purposeControl().click();
    await this.page.getByRole('option', { name: await this.str(purpose.key), exact: true }).click();
    await expect(this.purposeControl()).toHaveText(await this.str(purpose.key));
  }

  async typeInSite(value: string): Promise<void> {
    await this.siteField().fill(value);
    await this.siteField().blur();
  }

  async saveProject(): Promise<void> {
    await this.button(await this.str('developer.edit_project.save.button')).click();
  }

  // --- Windows -------------------------------------------------------------------------

  /** The confirm windows (delete project, remove website) are alert dialogs. */
  alertDialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  anyDialog(): Locator {
    return this.page.getByRole('alertdialog').or(this.page.getByRole('dialog'));
  }

  // --- Key form ------------------------------------------------------------------------

  keyNameField(): Locator {
    return this.page.locator('#devEKeyName');
  }

  async createKeyFromForm(label: string): Promise<void> {
    await this.keyNameField().fill(label);
    await this.button(await this.str('developer.key_form.create.button')).click();
  }

  // --- Browser history -----------------------------------------------------------------

  /** The browser's Back. The steps are same-address history entries, so wait on history.state. */
  async browserBack(): Promise<void> {
    // The page writes its history entry after the step renders: wait until the entry matches what
    // is on screen (a step, or home), or Back would go one entry too far.
    const inStep = await this.stepTitle().isVisible();
    await expect
      .poll(() => this.page.evaluate(() => !!(window.history.state && window.history.state.devView)), {
        timeout: t(10000),
      })
      .toBe(inStep);
    const before = await this.historyMark();
    await this.page
      .evaluate(() => window.history.back())
      .catch(() => {
        /* the page left: the next check sees it */
      });
    await expect.poll(async () => (await this.historyMark()) !== before, { timeout: t(15000) }).toBe(true);
    await this.page.waitForLoadState('domcontentloaded');
  }

  private async historyMark(): Promise<string> {
    try {
      const state = await this.page.evaluate(() => JSON.stringify(window.history.state ?? null));
      return this.page.url() + '|' + state;
    } catch {
      return 'navigating';
    }
  }

  // --- Network -------------------------------------------------------------------------

  /** Records the developer API writes (POST/DELETE) the page sends until stop() is called. */
  recordApiWrites(): { requests: { method: string; path: string; body: any }[]; stop: () => void } {
    const requests: { method: string; path: string; body: any }[] = [];
    const listener = (r: Request) => {
      const url = new URL(r.url());
      if (!url.pathname.startsWith('/api/developer/') || r.method() === 'GET') return;
      let body: any = null;
      try {
        body = r.postDataJSON();
      } catch {
        body = r.postData();
      }
      requests.push({ method: r.method(), path: url.pathname, body });
    };
    this.page.on('request', listener);
    return { requests, stop: () => this.page.off('request', listener) };
  }

  /**
   * The status the developer API answers for a key, by id. The call only turns the key's website
   * limit off, which changes nothing for a key that no longer exists: that one gets 404.
   */
  async keyStatus(keyId: string): Promise<number> {
    const origin = new URL(this.page.url()).origin;
    const cookies = await this.page.context().cookies(origin);
    const csrf = cookies.find((c) => c.name === 'csrftoken')?.value ?? '';
    const r = await this.page.request.fetch(`${origin}/api/developer/keys/${keyId}`, {
      method: 'POST',
      headers: { 'X-CSRFToken': csrf, Referer: origin + DeveloperSettingsPage.PATH },
      data: { restrictToWebsite: false },
    });
    return r.status();
  }
}
