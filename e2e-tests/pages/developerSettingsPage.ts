import { Locator, Page, expect } from '@playwright/test';
import { HelperBase } from './helperBase';
import { LANGUAGES, t } from '../globals';

/**
 * Developer Settings (/settings/developer): the welcome screen, setup steps, the projects and
 * keys home page, and the publish form. Used by the Developer Settings behavior stories
 * (e2e-tests/feature-specs/features/account/developer-settings-behavior-specs.feature).
 *
 * Copy is looked up by translation key in the running page (Sefaria._keyedString), never matched
 * as English or Hebrew words, so copy edits in Weblate don't break the stories.
 */
export class DeveloperSettingsPage extends HelperBase {
  static readonly PATH = '/settings/developer';

  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- Navigation ----------------------------------------------------------------------

  async open(): Promise<void> {
    await this.page.goto(new URL(DeveloperSettingsPage.PATH, this.page.url()).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await this.root().waitFor({ state: 'visible', timeout: t(20000) });
  }

  /** The Developer Settings content (inside the settings page frame). */
  root(): Locator {
    return this.page.locator('.devPocPage').first();
  }

  // --- Copy by key -----------------------------------------------------------------------

  /**
   * The interface string for `key` in the page's interface language, with {placeholders} filled
   * and any HTML tags removed (some strings carry a link or <strong>).
   */
  async str(key: string, params: Record<string, string | number> = {}): Promise<string> {
    const lang = this.language === LANGUAGES.HE ? 'he' : 'en';
    const raw = await this.page.evaluate(
      ([k, l]) => {
        const S = (window as any).Sefaria;
        return S && S._keyedString ? S._keyedString(k, l) : null;
      },
      [key, lang]
    );
    if (raw == null || raw === key) throw new Error(`No interface string for key ${key}`);
    let s = String(raw);
    for (const [name, value] of Object.entries(params)) s = s.split(`{${name}}`).join(String(value));
    return s
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** The raw string for `key` in a given language ('en' or 'he'), placeholders left in. */
  async strIn(key: string, lang: 'en' | 'he'): Promise<string> {
    const raw = await this.page.evaluate(
      ([k, l]) => (window as any).Sefaria?._keyedString?.(k, l) ?? null,
      [key, lang]
    );
    if (raw == null || raw === key) throw new Error(`No interface string for key ${key}`);
    return String(raw)
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** The string for `key` with any remaining {placeholder} turned into a wildcard, as a RegExp. */
  async strPattern(key: string, params: Record<string, string | number> = {}): Promise<RegExp> {
    const s = await this.str(key, params);
    const escaped = s
      .split(/\{[a-zA-Z0-9_]+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(escaped);
  }

  // --- Common locators -------------------------------------------------------------------

  /** The current full-screen step's title (setup steps, key and project forms). */
  stepTitle(): Locator {
    return this.page.locator('#devEStepTitle');
  }

  /** A project on the home page: a region named for the project. */
  project(name: string): Locator {
    // A project with an organization is named "<name> · <organization>".
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.root().getByRole('region', { name: new RegExp(`^${escaped}( · .*)?$`) });
  }

  /** A key's row in its project's table. */
  keyRow(projectName: string, keyLabel: string): Locator {
    return this.project(projectName)
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell', { name: keyLabel, exact: true }) });
  }

  button(name: string | RegExp, scope?: Locator): Locator {
    return (scope ?? this.root()).getByRole('button', { name, exact: typeof name === 'string' });
  }

  dialog(): Locator {
    // Confirm windows are alertdialogs; the rest are dialogs.
    return this.page.getByRole('alertdialog').or(this.page.getByRole('dialog'));
  }

  // --- Assertions ------------------------------------------------------------------------

  async expectText(text: string | RegExp): Promise<void> {
    await expect(
      this.root()
        .getByText(text, { exact: typeof text === 'string' })
        .first()
    ).toBeVisible({
      timeout: t(15000),
    });
  }

  async expectStepTitle(text: string | RegExp): Promise<void> {
    await expect(this.stepTitle()).toContainText(text, { timeout: t(15000) });
  }

  /** The home page has loaded: the "Projects and API keys" heading is showing. */
  async expectHome(): Promise<void> {
    const heading = await this.str('developer.common.projects_and_keys.header');
    await expect(this.root().getByRole('heading', { name: heading, level: 2 })).toBeVisible({ timeout: t(15000) });
  }
}
