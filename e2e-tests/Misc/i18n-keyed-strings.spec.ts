import { test, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import { STRING_PAGES, ANONYMOUS_HEADER_IDS, LOGGED_IN_HEADER_IDS } from './i18nStringsManifest';

/**
 * Keyed interface strings (static/js/sefaria/strings.js) — rendered-DOM checks.
 *
 * The jest suite (static/js/sefaria/tests/strings.test.js) proves the JSON
 * maps and the Sefaria._() router are internally consistent; this suite
 * proves the strings actually reach the page. For every page in the manifest,
 * in both interface languages:
 *
 *  1. Presence — the localized value of each keyed ID expected on that page
 *     is rendered (visible text or aria-label/alt/title/placeholder).
 *  2. No leaks — no raw keyed ID (e.g. "common.cancel") appears anywhere in
 *     the rendered output, which is what a broken lookup produces.
 *
 * Manifest and coverage notes: ./i18nStringsManifest.ts
 */

const CONFIGS = [
  { label: 'English', lang: LANGUAGES.EN, urls: () => MODULE_URLS.EN },
  { label: 'Hebrew', lang: LANGUAGES.HE, urls: () => MODULE_URLS.HE },
];

for (const { label, lang, urls } of CONFIGS) {
  test.describe(`Keyed Interface Strings — ${label}`, () => {
    for (const [i, spec] of STRING_PAGES.entries()) {
      // Logged-in pages run in English only: the shared storage state is
      // anonymous on the Hebrew (.org.il) domain (see e2e-tests/CLAUDE.md §4).
      if (spec.auth && lang === LANGUAGES.HE) continue;

      const num = String(i + 1).padStart(3, '0');
      test(`I18N-${num}: ${spec.name} renders its keyed strings (${label})`, async ({ context }) => {
        const base = spec.module === 'voices' ? urls().VOICES : urls().LIBRARY;
        const path = lang === LANGUAGES.HE && spec.pathHe ? spec.pathHe : spec.path;
        const url = `${base}${path}`;

        const page: Page = spec.auth
          ? await goToPageWithUser(context, url, BROWSER_SETTINGS.enUser)
          : await goToPageWithLang(context, url, lang);
        const pm = new PageManager(page, lang);
        await hideAllModalsAndPopups(page);

        const headerIds = spec.headerIds ?? (spec.auth ? LOGGED_IN_HEADER_IDS : ANONYMOUS_HEADER_IDS);
        const strings = pm.onInterfaceStrings();
        await strings.waitForAnchor(spec.anchor);
        await strings.expectStringsPresent([...headerIds, ...spec.expectedIds]);
        await strings.expectNoLeakedIds();
      });
    }
  });
}
