import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { LANGUAGES, t } from '../globals';

// The keyed interface-string maps are the runtime source of truth for
// translator-editable UI text (see static/js/sefaria/strings.js). en.json keys
// are the stable IDs (e.g. "header.donate"); values are the English display
// text. he.json holds the Hebrew values for the same IDs.
const keyedEn: Record<string, string> = {
  ...require('../../static/js/sefaria/i18n/interface/en.json'),
};
const keyedHe: Record<string, string> = {
  ...require('../../static/js/sefaria/i18n/interface/he.json'),
};

export const KEYED_STRING_IDS = Object.keys(keyedEn);

/**
 * Normalize rendered text for comparison: lowercase (CSS text-transform:
 * uppercase leaks into innerText), map non-breaking spaces to plain spaces,
 * and collapse whitespace runs (innerText splits strings across line breaks).
 */
const normalize = (s: string): string =>
  s.toLowerCase().replace(/[\s ‏‎]+/g, ' ').trim();

/**
 * Page object for verifying the keyed interface strings (strings.js) on any
 * rendered page. Two checks:
 *  - expectStringsPresent: the localized value of each expected keyed ID is
 *    rendered (visible text or a localizable attribute).
 *  - expectNoLeakedIds: no raw keyed ID (e.g. "common.cancel") appears in the
 *    rendered output — which is what a broken Sefaria._() router produces.
 */
export class InterfaceStringsPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /**
   * Gate on a page-specific "data loaded" element before asserting strings —
   * container anchors confirm React mounted, not that async content arrived,
   * so manifests point this at a child inside the loaded content.
   */
  async waitForAnchor(selector: string): Promise<void> {
    await expect(this.page.locator(selector).first()).toBeVisible({ timeout: t(30000) });
  }

  /** The value Sefaria._(id) should render in this page object's language. */
  localizedValue(id: string): string {
    const map = this.language === LANGUAGES.HE ? keyedHe : keyedEn;
    const value = map[id] ?? keyedEn[id]; // he.json gaps fall back to English at runtime
    if (value === undefined) {
      throw new Error(`Unknown keyed string ID in test manifest: "${id}"`);
    }
    return value;
  }

  /**
   * Visible text plus every localizable attribute value, in one atomic
   * evaluate (avoids sequential-locator race windows under full parallelism).
   */
  private async collectRenderedStrings(): Promise<string> {
    return this.page.evaluate(() => {
      const parts: string[] = [document.body.innerText];
      for (const attr of ['aria-label', 'alt', 'title', 'placeholder']) {
        document.querySelectorAll(`[${attr}]`).forEach((el) => {
          parts.push(el.getAttribute(attr) || '');
        });
      }
      return parts.join('\n');
    });
  }

  /**
   * Assert the localized value of every keyed ID in `ids` is rendered on the
   * page. Polls (content streams in async), and reports every missing string
   * at once with both the ID and the text it expected.
   */
  // Default timeout is generous: async sidebar/topic data is rate-limit-queued
  // under full parallelism, and the poll returns early once everything renders.
  async expectStringsPresent(ids: string[], timeout = t(40000)): Promise<void> {
    const wanted = ids.map((id) => ({ id, value: this.localizedValue(id) }));
    await expect
      .poll(
        async () => {
          const rendered = normalize(await this.collectRenderedStrings());
          return wanted
            .filter(({ value }) => !rendered.includes(normalize(value)))
            .map(({ id, value }) => `${id} → "${value}"`);
        },
        {
          timeout,
          message: `Keyed interface strings missing from ${this.page.url()} (${this.language})`,
        }
      )
      .toEqual([]);
  }

  /**
   * Assert the localized value of a keyed ID appears in document.title.
   * Covers the Sefaria.getPageTitle path (base titles and the page-type
   * suffix table), which never reaches the DOM body. Only use IDs whose
   * values are NOT overridden at runtime by site settings
   * (common.site_name / common.library_name render the sandbox's own names).
   */
  async expectTitleIncludes(id: string, timeout = t(20000)): Promise<void> {
    const value = normalize(this.localizedValue(id));
    await expect
      .poll(async () => normalize(await this.page.title()), {
        timeout,
        message: `document.title on ${this.page.url()} (${this.language}) missing "${id}"`,
      })
      .toContain(value);
  }

  /**
   * Assert no raw keyed string ID leaked into the rendered page. A leak means
   * Sefaria._() returned the ID itself instead of a translation (broken
   * router, ID missing from en.json, etc.). Call after expectStringsPresent
   * (or another data-loaded gate) so async content has already rendered.
   */
  async expectNoLeakedIds(): Promise<void> {
    const rendered = normalize(await this.collectRenderedStrings());
    const leaked = KEYED_STRING_IDS.filter((id) => rendered.includes(id));
    expect(leaked, `Raw keyed string IDs leaked into ${this.page.url()} (${this.language})`).toEqual([]);
  }
}
