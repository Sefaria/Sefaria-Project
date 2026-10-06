/*
 * PURPOSE: WCAG 2.1 checks for the dark mode feature on the desktop header and recoloured
 * pages (Library module), in light and dark. Evidence for the dark-mode compliance report.
 *
 * WCAG 2.1 criteria covered here (A unless marked):
 *   1.4.1 links in running text        THEME-A008
 *   1.4.3 (AA) text contrast scans     THEME-A006, THEME-A007 (dark fails; light is a reported baseline)
 *   2.1.1 / 2.1.2 keyboard, no trap    THEME-A001, THEME-A004
 *   2.1.4 character key shortcuts      THEME-A005
 *   2.4.1 bypass blocks (skip link)    THEME-A003
 *   2.4.3 focus order                  THEME-A001, THEME-A011
 *   2.4.7 (AA) focus visible           THEME-A002
 *   3.1.1 language of page             THEME-A004
 *   3.2.1 / 3.2.2 on focus / on input  THEME-A004, THEME-A005
 *   4.1.1 parsing (duplicate ids)      THEME-A009
 *   axe-core wcag2a/21a/2aa/21aa       THEME-A010 (skipped unless axe-core is installed)
 * Role, name and state, label-in-name and the token contrast audit are Jest tests
 * (static/js/tests/themeAccessibility.test.js, cssColorLiterals.test.js "WCAG token audit").
 * The mobile menu lives in "mobile web/theme-a11y.spec.ts" (THEME-AM0xx).
 *
 * Dark state is seeded with the `theme` cookie before the first navigation, so each test starts
 * on a server-rendered dark page, the way a returning visitor sees it.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import { THEME, THEME_A11Y, ThemeName, seedThemeCookie } from '../pages/themeTogglePage';
import { axeSource } from '../support/a11y-scan.js';

const LIBRARY = MODULE_URLS.EN.LIBRARY;
const url = (p: string, base: string = LIBRARY) => `${base}${p}`;
const THEMES: ThemeName[] = ['light', 'dark'];
const AXE_AVAILABLE = !!axeSource();

for (const themeName of THEMES) {
  test.describe(`Library Theme Accessibility — English, ${themeName}`, () => {
    let page: Page;
    let pm: PageManager;

    test.beforeEach(async ({ context }) => {
      const start = url(THEME_A11Y.PATHS.TEXTS);
      if (themeName === 'dark') await seedThemeCookie(context, start, THEME.DARK);
      page = await goToPageWithLang(context, start, LANGUAGES.EN);
      pm = new PageManager(page, LANGUAGES.EN);
      await hideAllModalsAndPopups(page);
      await pm.onThemeToggle().expectTheme(themeName);
      await pm.onThemeToggle().expectDesktopToggleVisible();
    });

    test(`THEME-A001: ${themeName}: Tab goes skip link -> header -> module switcher -> toggle -> account menu -> page, no trap`, async () => {
      await pm.onThemeToggle().expectHeaderTabSequence();
    });

    test(`THEME-A002: ${themeName}: the toggle's keyboard focus ring is visible and at least 3:1`, async () => {
      await pm.onThemeToggle().tabToDesktopToggle();
      const { info } = await pm.onThemeToggle().expectFocusIndicator();
      expect(info.ring?.source).toBe('outline');
    });

    test(`THEME-A003: ${themeName}: the skip link shows on focus, is readable, and jumps to the main content`, async () => {
      await pm.onThemeToggle().expectSkipLinkWorks();
    });

    test(`THEME-A004: ${themeName}: Enter and Space toggle in place (same URL, title, lang, focus; no reload)`, async () => {
      await pm.onThemeToggle().tabToDesktopToggle();
      await pm.onThemeToggle().expectKeyTogglesInPlace('Enter');
      await pm.onThemeToggle().expectKeyTogglesInPlace('Space');
      await pm.onThemeToggle().expectTheme(themeName);
    });

    test(`THEME-A005: ${themeName}: focus alone and single character keys never switch the theme`, async () => {
      await pm.onThemeToggle().focusModuleSwitcher();
      await pm.onThemeToggle().expectFocusAloneChangesNothing();
      await pm.onThemeToggle().expectCharacterKeysDoNothing();
      await pm.onThemeToggle().expectTheme(themeName);
    });

    test(`THEME-A006: ${themeName}: /texts text contrast scan (fails in dark; light is a reported baseline)`, async ({}, testInfo) => {
      if (themeName === 'dark') await pm.onThemeToggle().expectTextContrast(testInfo, 'texts-dark');
      else await pm.onThemeToggle().reportTextContrast(testInfo, 'texts-light');
    });

    test(`THEME-A007: ${themeName}: reader and connections panel text contrast scan`, async ({}, testInfo) => {
      test.slow();
      for (const [label, path] of [['reader', THEME_A11Y.PATHS.READER], ['connections', THEME_A11Y.PATHS.CONNECTIONS]] as const) {
        await pm.onThemeToggle().goto(url(path));
        await pm.onThemeToggle().expectTheme(themeName);
        await expect(page.locator('.segment').first()).toBeVisible({ timeout: t(20000) });
        if (themeName === 'dark') await pm.onThemeToggle().expectTextContrast(testInfo, `${label}-dark`);
        else await pm.onThemeToggle().reportTextContrast(testInfo, `${label}-light`);
      }
    });

    test(`THEME-A008: ${themeName}: links in running text are told apart from the text by more than colour`, async ({}, testInfo) => {
      await pm.onThemeToggle().goto(url(THEME_A11Y.PATHS.TOPICS));
      await pm.onThemeToggle().expectTheme(themeName);
      if (themeName === 'dark') {
        await pm.onThemeToggle().expectInlineLinksDistinguishable();
      } else {
        // Light mode predates this work: topic-description links are #4B71B7 on #666 text (1.2:1), not underlined.
        const rows = await pm.onThemeToggle().inlineLinks();
        testInfo.annotations.push({ type: 'light-baseline', description: `${rows.filter((r) => r.status === 'fail').length} of ${rows.length} running-text links rely on colour alone` });
      }
    });

    test(`THEME-A009: ${themeName}: no duplicate ids in the header or the page`, async () => {
      await pm.onThemeToggle().expectNoDuplicateIds('.header');
      await pm.onThemeToggle().expectNoDuplicateIds();
    });

    test(`THEME-A010: ${themeName}: axe-core finds no violations on the theme controls, and none that only dark mode has`, async () => {
      test.skip(!AXE_AVAILABLE, 'axe-core is not a dependency of this repo; set AXE_CORE_PATH or `npm i --no-save axe-core` to run it');
      const header = await pm.onThemeToggle().runAxe(['.header']);
      const onControls = header!.violations.filter((v) => v.nodes.some((n) => /themeToggle/.test(n.html)));
      expect(onControls, JSON.stringify(onControls, null, 1)).toEqual([]);
      if (themeName === 'dark') {
        const dark = (await pm.onThemeToggle().runAxe())!.violations.map((v) => v.id);
        await pm.onThemeToggle().clickDesktopToggle();
        await pm.onThemeToggle().expectTheme('light');
        const light = (await pm.onThemeToggle().runAxe())!.violations.map((v) => v.id);
        expect(dark.filter((id) => !light.includes(id)), `dark-only axe violations (light: ${light.join(', ')})`).toEqual([]);
        expect(dark).not.toContain('color-contrast');
      }
    });
  });
}

test.describe('Library Theme Accessibility — Hebrew, dark', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    const start = url(THEME_A11Y.PATHS.TEXTS, MODULE_URLS.HE.LIBRARY);
    await seedThemeCookie(context, start, THEME.DARK);
    page = await goToPageWithLang(context, start, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onThemeToggle().expectTheme('dark');
  });

  test('THEME-A011: Hebrew (RTL): Tab order through the header, focus ring, keys, and contrast', async ({}, testInfo) => {
    await pm.onThemeToggle().expectDesktopTogglePlacement();
    await pm.onThemeToggle().expectHeaderTabSequence();
    await pm.onThemeToggle().tabToDesktopToggle();
    await pm.onThemeToggle().expectFocusIndicator();
    await pm.onThemeToggle().expectKeyTogglesInPlace('Space');
    await pm.onThemeToggle().expectKeyTogglesInPlace('Enter');
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectTextContrast(testInfo, 'texts-he-dark');
  });
});
