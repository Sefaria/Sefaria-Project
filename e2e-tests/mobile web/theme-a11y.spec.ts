/*
 * PURPOSE: WCAG 2.1 checks for the dark mode switch in the mobile hamburger menu and the
 * recoloured mobile pages, in light and dark. Evidence for the dark-mode compliance report.
 *
 * WCAG 2.1 criteria covered here (A unless marked):
 *   1.4.3 (AA) text contrast scans           THEME-AM003, THEME-AM004 (dark fails; light is reported)
 *   1.4.11 (AA) switch knob and track        THEME-AM003
 *   2.1.1 / 2.1.2 keyboard, no trap          THEME-AM001
 *   2.4.3 focus order                        THEME-AM001 (switch right after the language row)
 *   2.4.7 (AA) focus visible                 THEME-AM002
 *   3.2.2 on input (menu stays open)         THEME-AM001
 *   4.1.1 parsing                            THEME-AM005
 *   axe-core wcag2a/21a/2aa/21aa             THEME-AM005 (skipped unless axe-core is installed)
 * Desktop checks: library/theme-a11y.spec.ts (THEME-A0xx). Runs under playwright.mobileweb.config.ts.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import { THEME, THEME_A11Y, ThemeName, seedThemeCookie } from '../pages/themeTogglePage';
import { axeSource } from '../support/a11y-scan.js';

const THEMES: ThemeName[] = ['light', 'dark'];
const AXE_AVAILABLE = !!axeSource();
const MENU = THEME_A11Y.SCAN_MOBILE_MENU[0];
const CONFIGS = [
  { label: 'English', lang: LANGUAGES.EN, base: MODULE_URLS.EN.LIBRARY },
  { label: 'Hebrew', lang: LANGUAGES.HE, base: MODULE_URLS.HE.LIBRARY },
];

for (const { label, lang, base } of CONFIGS) {
  for (const themeName of THEMES) {
    test.describe(`Mobile Theme Accessibility — ${label}, ${themeName}`, () => {
      let page: Page;
      let pm: PageManager;

      test.beforeEach(async ({ context }) => {
        const start = `${base}${THEME_A11Y.PATHS.TEXTS}`;
        if (themeName === 'dark') await seedThemeCookie(context, start, THEME.DARK);
        page = await goToPageWithLang(context, start, lang);
        pm = new PageManager(page, lang);
        await hideAllModalsAndPopups(page);
        await pm.onMobileHamburger().waitForHeaderReady();
        await pm.onThemeToggle().expectTheme(themeName);
        await pm.onMobileHamburger().openMenu();
        await pm.onThemeToggle().expectMobileToggleVisible();
      });

      test(`THEME-AM001: ${label} ${themeName}: Tab from the language row reaches the switch; Space and Enter toggle it in place; Tab moves on`, async () => {
        const steps = await pm.onThemeToggle().tabToMobileSwitchFromLanguageRow();
        expect(steps, 'the switch is the next Tab stop after the language row').toBe(1);
        await pm.onThemeToggle().expectKeyTogglesInPlace('Space');
        await pm.onThemeToggle().expectMobileMenuStillOpen();
        await pm.onThemeToggle().expectKeyTogglesInPlace('Enter');
        await pm.onThemeToggle().expectMobileChecked(themeName === 'dark');
        await pm.onThemeToggle().expectTabLeavesMobileSwitch();
      });

      test(`THEME-AM002: ${label} ${themeName}: the switch's keyboard focus ring is visible and at least 3:1`, async () => {
        await pm.onThemeToggle().tabToMobileSwitchFromLanguageRow();
        await pm.onThemeToggle().expectFocusIndicator();
      });

      test(`THEME-AM003: ${label} ${themeName}: menu text contrast and switch knob/track contrast`, async ({}, testInfo) => {
        // The switch is the theme: on whenever the page is dark, off whenever it is light.
        if (themeName === 'dark') {
          await pm.onThemeToggle().expectTextContrast(testInfo, `menu-${lang}-dark`, THEME_A11Y.SCAN_MOBILE_MENU);
          await pm.onThemeToggle().expectMobileChecked(true);
          await pm.onThemeToggle().mobileSwitchContrast(3);
        } else {
          await pm.onThemeToggle().reportTextContrast(testInfo, `menu-${lang}-light`, THEME_A11Y.SCAN_MOBILE_MENU);
          // Light keeps the site's existing .toggle-switch look: white knob on a #CCC track (1.6:1). Reported.
          const off = await pm.onThemeToggle().mobileSwitchContrast();
          testInfo.annotations.push({ type: 'light-baseline', description: `switch off: knob/track ${off.knobOnTrack.toFixed(2)}:1, track/menu ${off.trackOnMenu.toFixed(2)}:1` });
        }
      });

      test(`THEME-AM004: ${label} ${themeName}: mobile /texts text contrast scan`, async ({}, testInfo) => {
        await pm.onMobileHamburger().closeMenu();
        if (themeName === 'dark') await pm.onThemeToggle().expectTextContrast(testInfo, `texts-mobile-${lang}-dark`);
        else await pm.onThemeToggle().reportTextContrast(testInfo, `texts-mobile-${lang}-light`);
      });

      test(`THEME-AM005: ${label} ${themeName}: no duplicate ids in the menu; axe finds nothing on the switch or dark-only`, async () => {
        await pm.onThemeToggle().expectNoDuplicateIds(MENU);
        test.skip(!AXE_AVAILABLE, 'axe-core is not a dependency of this repo; set AXE_CORE_PATH or `npm i --no-save axe-core` to run it');
        const menu = (await pm.onThemeToggle().runAxe([MENU]))!;
        const onSwitch = menu.violations.filter((v) => v.nodes.some((n) => /mobileThemeToggle/.test(n.html)));
        expect(onSwitch, JSON.stringify(onSwitch, null, 1)).toEqual([]);
        expect(menu.violations.map((v) => v.id)).not.toContain('color-contrast');
      });
    });
  }
}
