/*
 * PURPOSE: WCAG 2.1 checks for the Appearance setting (Auto / Light / Dark) in the desktop
 * account menu and for the recoloured pages (Library module), in light and dark. Evidence for
 * the dark-mode compliance report.
 *
 * Test IDs (THEME-A0xx; each runs once per theme, A013 is Hebrew dark), with the WCAG 2.1
 * criteria they cover (A unless marked):
 *   A001 header Tab order, menu closed: skip link first, account menu right after the module
 *        switcher, no theme stop in the header, focus moves on   2.1.1, 2.1.2, 2.4.3
 *   A002 the menu opened from the keyboard: Auto, Light, Dark right after Site Language, then
 *        the next menu item; Shift+Tab back                       2.1.1, 2.4.3
 *   A003 focus ring on every option, visible and at least 3:1    2.4.7 (AA)
 *   A004 Enter and Space choose in place (same URL, title, lang, dir, focus; menu open; no
 *        reload)                                                  2.1.1, 3.1.1, 3.2.2
 *   A005 no trap: Tab moves on from the group, Escape closes the menu, Tab then leaves the
 *        header. Focus not returned to the account button after Escape is annotated as a known
 *        gap (pre-existing in DropdownMenu, see expectEscapeClosesMenu)   2.1.2
 *   A006 skip link                                                2.4.1
 *   A007 focus alone and single character keys change nothing   3.2.1, 2.1.4
 *   A008 /texts and open-menu text contrast (dark fails; light is a reported baseline), option
 *        chip and icon contrast (both themes)                     1.4.3 (AA), 1.4.11 (AA)
 *   A009 reader and connections panel text contrast              1.4.3 (AA)
 *   A010 links in running text                                    1.4.1
 *   A011 name, role, state: a named group, three named buttons, exactly one aria-pressed;
 *        no duplicate ids in the header, the open menu, the page  4.1.1, 4.1.2
 *   A012 axe-core wcag2a/21a/2aa/21aa on the open menu (skipped unless axe-core is installed)
 *   A013 Hebrew (RTL), dark: header and menu Tab order, focus ring, keys, contrast
 * The token contrast audit is a Jest test (cssColorLiterals.test.js "WCAG token audit").
 * The mobile menu lives in "mobile web/appearance-a11y.spec.ts" (THEME-AM0xx).
 *
 * The theme is seeded with the `theme` cookie (light or dark) before the first navigation, so
 * each test starts on a server-rendered page, the way a returning visitor sees it. Auto resolves
 * to light here (Playwright's default colour scheme).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import {
  APPEARANCE_A11Y,
  PREFERENCES,
  Preference,
  ThemeName,
  seedThemeCookie,
  themeFor,
} from '../pages/appearancePage';
import { axeSource } from '../support/a11y-scan.js';

const LIBRARY = MODULE_URLS.EN.LIBRARY;
const url = (p: string, base: string = LIBRARY) => `${base}${p}`;
const THEMES: ThemeName[] = ['light', 'dark'];
const AXE_AVAILABLE = !!axeSource();
const MENU = APPEARANCE_A11Y.SCAN_ACCOUNT_MENU;

/** Every other option, then back to the seeded one: each step changes the choice. */
const choicesFrom = (seeded: Preference): Preference[] => [...PREFERENCES.filter((p) => p !== seeded), seeded];

for (const themeName of THEMES) {
  test.describe(`Library Appearance Accessibility — English, ${themeName}`, () => {
    let page: Page;
    let pm: PageManager;

    test.beforeEach(async ({ context }) => {
      const start = url(APPEARANCE_A11Y.PATHS.TEXTS);
      await seedThemeCookie(context, start, themeName);
      page = await goToPageWithLang(context, start, LANGUAGES.EN);
      pm = new PageManager(page, LANGUAGES.EN);
      await hideAllModalsAndPopups(page);
      await pm.onAppearance().expectTheme(themeName);
    });

    test(`THEME-A001: ${themeName}: Tab goes skip link -> header -> module switcher -> account menu -> page; no theme stop in the header`, async () => {
      await pm.onAppearance().expectHeaderTabSequence();
    });

    test(`THEME-A002: ${themeName}: the account menu opened with Enter; Tab reaches Auto, Light, Dark right after Site Language`, async () => {
      await pm.onAppearance().openAccountMenuWithKeyboard();
      await pm.onAppearance().expectMenuTabOrder();
    });

    test(`THEME-A003: ${themeName}: every option's keyboard focus ring is visible and at least 3:1`, async () => {
      await pm.onAppearance().openAccountMenuWithKeyboard();
      await pm.onAppearance().tabToDesktopOption('auto');
      for (const pref of PREFERENCES) {
        await pm.onAppearance().moveFocusToOption('desktop', pref);
        const { info } = await pm.onAppearance().expectFocusIndicator();
        expect(info.ring?.source, `${pref} focus ring`).toBe('outline');
      }
    });

    test(`THEME-A004: ${themeName}: Enter and Space choose in place (same URL, title, lang, focus; menu open; no reload)`, async () => {
      await pm.onAppearance().openAccountMenuWithKeyboard();
      await pm.onAppearance().tabToDesktopOption('auto');
      const keys = ['Enter', 'Space'] as const;
      for (const [i, pref] of choicesFrom(themeName).entries()) {
        await pm.onAppearance().moveFocusToOption('desktop', pref);
        await pm.onAppearance().expectKeyChoosesInPlace('desktop', keys[i % 2], themeFor(pref));
      }
      await pm.onAppearance().expectAccountMenuStillOpen();
      await pm.onAppearance().expectTheme(themeName);
    });

    test(`THEME-A005: ${themeName}: no keyboard trap: Tab moves on from the group; Escape closes the menu; Tab leaves the header`, async ({}, testInfo) => {
      await pm.onAppearance().openAccountMenuWithKeyboard();
      await pm.onAppearance().tabToDesktopOption('dark');
      await pm.onAppearance().expectTabMovesOnFromGroup('desktop');
      const escape = await pm.onAppearance().expectEscapeClosesMenu();
      if (escape.focus !== 'account-button') {
        testInfo.annotations.push({ type: 'known-gap', description: `Escape left focus on ${escape.focus} (${escape.detail}), not the account button: common/Button.jsx does not forward the ref DropdownMenu returns focus to (all header dropdowns)` });
      }
      await pm.onAppearance().expectTabLeavesHeader();
    });

    test(`THEME-A006: ${themeName}: the skip link shows on focus, is readable, and jumps to the main content`, async () => {
      await pm.onAppearance().expectSkipLinkWorks();
    });

    test(`THEME-A007: ${themeName}: focus alone and single character keys never change the appearance`, async () => {
      await pm.onAppearance().openAccountMenuWithKeyboard();
      await pm.onAppearance().expectFocusAloneChangesNothing('desktop');
      await pm.onAppearance().expectCharacterKeysDoNothing();
      await pm.onAppearance().expectTheme(themeName);
    });

    test(`THEME-A008: ${themeName}: /texts and open-menu text contrast; option chip and icon contrast`, async ({}, testInfo) => {
      if (themeName === 'dark') await pm.onAppearance().expectTextContrast(testInfo, 'texts-dark');
      else await pm.onAppearance().reportTextContrast(testInfo, 'texts-light');
      await pm.onAppearance().openAccountMenu();
      if (themeName === 'dark') await pm.onAppearance().expectTextContrast(testInfo, 'account-menu-dark', MENU, 3);
      else await pm.onAppearance().reportTextContrast(testInfo, 'account-menu-light', MENU);
      const rows = await pm.onAppearance().expectOptionContrast('desktop');
      await testInfo.attach(`options-${themeName}.json`, { body: JSON.stringify(rows, null, 1), contentType: 'application/json' });
    });

    test(`THEME-A009: ${themeName}: reader and connections panel text contrast scan`, async ({}, testInfo) => {
      test.slow();
      for (const [label, path] of [['reader', APPEARANCE_A11Y.PATHS.READER], ['connections', APPEARANCE_A11Y.PATHS.CONNECTIONS]] as const) {
        await pm.onAppearance().goto(url(path));
        await pm.onAppearance().expectTheme(themeName);
        await expect(page.locator('.segment').first()).toBeVisible({ timeout: t(20000) });
        if (themeName === 'dark') await pm.onAppearance().expectTextContrast(testInfo, `${label}-dark`);
        else await pm.onAppearance().reportTextContrast(testInfo, `${label}-light`);
      }
    });

    test(`THEME-A010: ${themeName}: links in running text are told apart from the text by more than colour`, async ({}, testInfo) => {
      await pm.onAppearance().goto(url(APPEARANCE_A11Y.PATHS.TOPICS));
      await pm.onAppearance().expectTheme(themeName);
      if (themeName === 'dark') {
        await pm.onAppearance().expectInlineLinksDistinguishable();
      } else {
        // Light mode predates this work: topic-description links are #4B71B7 on #666 text (1.2:1), not underlined.
        const rows = await pm.onAppearance().inlineLinks();
        testInfo.annotations.push({ type: 'light-baseline', description: `${rows.filter((r) => r.status === 'fail').length} of ${rows.length} running-text links rely on colour alone` });
      }
    });

    test(`THEME-A011: ${themeName}: a named group of three named buttons, exactly one pressed; no duplicate ids`, async () => {
      await pm.onAppearance().expectDesktopPressed(themeName);
      await pm.onAppearance().expectNoDuplicateIds(APPEARANCE_A11Y.SCAN_ACCOUNT_MENU[0]);
      await pm.onAppearance().expectNoDuplicateIds('.header');
      await pm.onAppearance().expectNoDuplicateIds();
    });

    test(`THEME-A012: ${themeName}: axe-core finds no violations on the Appearance controls, and none that only dark mode has`, async () => {
      test.skip(!AXE_AVAILABLE, 'axe-core is not a dependency of this repo; set AXE_CORE_PATH or `npm i --no-save axe-core` to run it');
      await pm.onAppearance().openAccountMenu();
      const menu = (await pm.onAppearance().runAxe(MENU))!;
      const onControls = menu.violations.filter((v) => v.nodes.some((n) => /appearanceOption|dropdownAppearanceToggle|appearanceHeader/.test(n.html)));
      expect(onControls, JSON.stringify(onControls, null, 1)).toEqual([]);
      if (themeName === 'dark') {
        const dark = (await pm.onAppearance().runAxe())!.violations.map((v) => v.id);
        await pm.onAppearance().selectDesktop('light', 'light');
        const light = (await pm.onAppearance().runAxe())!.violations.map((v) => v.id);
        expect(dark.filter((id) => !light.includes(id)), `dark-only axe violations (light: ${light.join(', ')})`).toEqual([]);
        expect(dark).not.toContain('color-contrast');
      }
    });
  });
}

test.describe('Library Appearance Accessibility — Hebrew, dark', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    const start = url(APPEARANCE_A11Y.PATHS.TEXTS, MODULE_URLS.HE.LIBRARY);
    await seedThemeCookie(context, start, 'dark');
    page = await goToPageWithLang(context, start, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onAppearance().expectTheme('dark');
  });

  test('THEME-A013: Hebrew (RTL): header and menu Tab order, focus ring, keys, and contrast', async ({}, testInfo) => {
    test.slow();
    await pm.onAppearance().expectHeaderTabSequence();
    await pm.onAppearance().openAccountMenuWithKeyboard();
    await pm.onAppearance().expectMenuTabOrder();
    await pm.onAppearance().expectFocusIndicator();
    await pm.onAppearance().moveFocusToOption('desktop', 'light');
    await pm.onAppearance().expectKeyChoosesInPlace('desktop', 'Space', 'light');
    await pm.onAppearance().moveFocusToOption('desktop', 'dark');
    await pm.onAppearance().expectKeyChoosesInPlace('desktop', 'Enter', 'dark');
    await pm.onAppearance().expectDesktopPressed('dark');
    await pm.onAppearance().expectOptionContrast('desktop');
    await pm.onAppearance().closeAccountMenu();
    await pm.onAppearance().expectTextContrast(testInfo, 'texts-he-dark');
  });
});
