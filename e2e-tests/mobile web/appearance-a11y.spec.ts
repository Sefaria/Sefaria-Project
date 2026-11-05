/*
 * PURPOSE: WCAG 2.1 checks for the Appearance row (Auto / Light / Dark) in the mobile hamburger
 * menu and the recoloured mobile pages, in light and dark. Evidence for the dark-mode compliance
 * report. Runs under playwright.mobileweb.config.ts.
 *
 * Test IDs (THEME-AM0xx; each runs for English and Hebrew, light and dark), with the WCAG 2.1
 * criteria they cover (A unless marked):
 *   AM001 Tab from the language row reaches Auto first, then Light and Dark, then moves on out
 *         of the row (no trap); Enter and Space choose in place; the menu stays open
 *                                                    2.1.1, 2.1.2, 2.4.3, 3.2.2
 *   AM002 focus ring on every option, visible and at least 3:1          2.4.7 (AA)
 *   AM003 menu text contrast (dark fails; light is reported), option chip and icon
 *         contrast (both themes)                                        1.4.3 (AA), 1.4.11 (AA)
 *   AM004 mobile /texts text contrast scan                              1.4.3 (AA)
 *   AM005 a named group, three named buttons, exactly one aria-pressed; no duplicate ids in the
 *         menu; axe-core wcag2a/21a/2aa/21aa (skipped unless axe-core is installed)  4.1.1, 4.1.2
 * Desktop checks: library/appearance-a11y.spec.ts (THEME-A0xx).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import { APPEARANCE_A11Y, PREFERENCES, Preference, ThemeName, seedThemeCookie, themeFor } from '../pages/appearancePage';
import { axeSource } from '../support/a11y-scan.js';

const THEMES: ThemeName[] = ['light', 'dark'];
const AXE_AVAILABLE = !!axeSource();
const MENU = APPEARANCE_A11Y.SCAN_MOBILE_MENU[0];
const CONFIGS = [
  { label: 'English', lang: LANGUAGES.EN, base: MODULE_URLS.EN.LIBRARY },
  { label: 'Hebrew', lang: LANGUAGES.HE, base: MODULE_URLS.HE.LIBRARY },
];

/** Every other option, then back to the seeded one: each step changes the choice. */
const choicesFrom = (seeded: Preference): Preference[] => [...PREFERENCES.filter((p) => p !== seeded), seeded];

for (const { label, lang, base } of CONFIGS) {
  for (const themeName of THEMES) {
    test.describe(`Mobile Appearance Accessibility — ${label}, ${themeName}`, () => {
      let page: Page;
      let pm: PageManager;

      test.beforeEach(async ({ context }) => {
        const start = `${base}${APPEARANCE_A11Y.PATHS.TEXTS}`;
        await seedThemeCookie(context, start, themeName);
        page = await goToPageWithLang(context, start, lang);
        pm = new PageManager(page, lang);
        await hideAllModalsAndPopups(page);
        await pm.onMobileHamburger().waitForHeaderReady();
        await pm.onAppearance().expectTheme(themeName);
        await pm.onMobileHamburger().openMenu();
        await pm.onAppearance().expectMobileRowVisible();
      });

      test(`THEME-AM001: ${label} ${themeName}: Tab from the language row reaches Auto, Light, Dark, then moves on; Enter and Space choose in place`, async () => {
        const steps = await pm.onAppearance().tabToMobileOptionFromLanguageRow();
        expect(steps, 'Auto is the next Tab stop after the language row').toBe(1);
        await pm.onAppearance().expectMobileTabOrder();

        const keys = ['Enter', 'Space'] as const;
        for (const [i, pref] of choicesFrom(themeName).entries()) {
          await pm.onAppearance().moveFocusToOption('mobile', pref);
          await pm.onAppearance().expectKeyChoosesInPlace('mobile', keys[i % 2], themeFor(pref));
        }
        await pm.onAppearance().expectMobileMenuStillOpen();
        await pm.onAppearance().expectMobilePressed(themeName);
      });

      test(`THEME-AM002: ${label} ${themeName}: every option's keyboard focus ring is visible and at least 3:1`, async () => {
        await pm.onAppearance().tabToMobileOptionFromLanguageRow();
        for (const pref of PREFERENCES) {
          await pm.onAppearance().moveFocusToOption('mobile', pref);
          await pm.onAppearance().expectFocusIndicator();
        }
      });

      test(`THEME-AM003: ${label} ${themeName}: menu text contrast; option chip and icon contrast`, async ({}, testInfo) => {
        if (themeName === 'dark') await pm.onAppearance().expectTextContrast(testInfo, `menu-${lang}-dark`, APPEARANCE_A11Y.SCAN_MOBILE_MENU);
        else await pm.onAppearance().reportTextContrast(testInfo, `menu-${lang}-light`, APPEARANCE_A11Y.SCAN_MOBILE_MENU);
        // The pressed chip: --color-accent-fill with a white icon in light; --dm-option-pressed
        // (theme-dark-overrides.css section 7c) in dark, 3.2:1 against the menu, icon 5.5:1.
        const rows = await pm.onAppearance().expectOptionContrast('mobile');
        await testInfo.attach(`options-${lang}-${themeName}.json`, { body: JSON.stringify(rows, null, 1), contentType: 'application/json' });
      });

      test(`THEME-AM004: ${label} ${themeName}: mobile /texts text contrast scan`, async ({}, testInfo) => {
        await pm.onMobileHamburger().closeMenu();
        if (themeName === 'dark') await pm.onAppearance().expectTextContrast(testInfo, `texts-mobile-${lang}-dark`);
        else await pm.onAppearance().reportTextContrast(testInfo, `texts-mobile-${lang}-light`);
      });

      test(`THEME-AM005: ${label} ${themeName}: a named group with exactly one pressed option; no duplicate ids; axe finds nothing on the row and no contrast violation`, async () => {
        await pm.onAppearance().expectMobilePressed(themeName);
        await pm.onAppearance().expectNoDuplicateIds(MENU);
        test.skip(!AXE_AVAILABLE, 'axe-core is not a dependency of this repo; set AXE_CORE_PATH or `npm i --no-save axe-core` to run it');
        const menu = (await pm.onAppearance().runAxe([MENU]))!;
        const onRow = menu.violations.filter((v) => v.nodes.some((n) => /mobileAppearanceToggle|appearanceOption/.test(n.html)));
        expect(onRow, JSON.stringify(onRow, null, 1)).toEqual([]);
        expect(menu.violations.map((v) => v.id)).not.toContain('color-contrast');
      });
    });
  }
}
