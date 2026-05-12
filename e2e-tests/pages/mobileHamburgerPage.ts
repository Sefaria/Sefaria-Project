import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { t } from '../globals';
import { MOBILE_HAMBURGER, MOBILE_PAGE_URLS, SEARCH_DROPDOWN } from '../constants';

/**
 * Page object for the mobile hamburger menu rendered by Sefaria's
 * `<Header>` component (static/js/Header.jsx) when the viewport is below
 * the tablet breakpoint (width < 843 px).
 *
 * Locators are anchored on stable handles in this order of preference:
 *   1. ARIA role/label   (Menu button, navigation landmark, logo)
 *   2. `href` attribute  (Texts, Topics, About, Products, Developers, /interface/*)
 *   3. Visible text      (Donate, Get Help, Voices on Sefaria, Sefaria Library)
 *   4. Class only as a last resort (`.mobileNavMenu`, `.mobileModuleSwitcher`)
 *
 * The menu is a left-anchored drawer; while closed, the same DOM exists with
 * `.closed`, so we always assert against `.mobileNavMenu:not(.closed)` for
 * visibility checks rather than `toBeVisible()` alone.
 */
export class MobileHamburgerPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---------------------------------------------------------------------------
  // Element accessors
  // ---------------------------------------------------------------------------

  private get menuButton(): Locator {
    return this.page.getByRole('button', { name: 'Menu' });
  }

  private get libraryLogo(): Locator {
    return this.page.getByRole('link', { name: MOBILE_HAMBURGER.LIBRARY_LOGO_LABEL });
  }

  private get headerLanguageToggle(): Locator {
    return this.page.locator(MOBILE_HAMBURGER.HEADER_LANG_TOGGLE);
  }

  private get navMenu(): Locator {
    return this.page.getByRole('navigation', { name: MOBILE_HAMBURGER.NAV_MENU_LABEL });
  }

  /** Open-state container — present in DOM only when the drawer is expanded. */
  private get navMenuOpen(): Locator {
    return this.page.locator(MOBILE_HAMBURGER.NAV_MENU_OPEN);
  }

  private get searchInput(): Locator {
    // Downshift enhances the <input id="searchInput"> with role="combobox".
    // Scoping the role-locator under the mobile navigation guarantees we never
    // collide with a duplicate desktop input that may render off-screen.
    return this.navMenu.getByRole('combobox', {
      name: 'Search for Texts or Keywords Here',
    });
  }

  private get searchLine(): Locator {
    return this.page.locator(MOBILE_HAMBURGER.SEARCH_LINE);
  }

  /**
   * Suggestion-list role on the autocomplete. Downshift sets role="listbox"
   * on the open dropdown — easier to detect "results showed up" than the
   * inner `.type-title` divs (which carry InterfaceText-rendered labels that
   * can briefly render empty during hydration).
   */
  private get searchResultsListbox(): Locator {
    return this.navMenu.getByRole('listbox');
  }

  /**
   * Every non-`search` suggestion is rendered with an inline `<img alt="...">`
   * whose alt text is the raw result type from the API: `AuthorTopic`,
   * `Topic`, `TocCategory`, `ref`, `User`, `Collection`. Reading the alts
   * gives us a stable, language-independent view of which categories the
   * dropdown is presenting.
   */
  private async collectResultTypes(): Promise<string[]> {
    const imgs = this.searchResultsListbox.locator('img[alt]');
    const alts = await imgs.evaluateAll((nodes: Element[]) =>
      nodes.map((n) => n.getAttribute('alt') ?? ''),
    );
    // Filter the "search" override icon and any empty alts (e.g. button-icon).
    return alts.filter((a) => a && a !== 'search' && a !== 'Search');
  }

  // In-menu link helpers — all scoped under `.mobileNavMenu`.
  private menuLink(hrefOrText: { href?: string; text?: string }): Locator {
    if (hrefOrText.href) {
      return this.navMenu.locator(`a[href="${hrefOrText.href}"]`);
    }
    return this.navMenu.getByRole('link', { name: hrefOrText.text!, exact: true });
  }

  private get donateLink(): Locator {
    // `<DonateLink>` renders a normal `<a>` with an external href and the text
    // "Donate". Scope to the menu to avoid the in-header "Donate" link.
    return this.navMenu.locator('a', { hasText: 'Donate' }).first();
  }

  private get getHelpLink(): Locator {
    // Rendered through the shared `Button` component — when `href` is set the
    // Button emits an <a role="button"> rather than a plain <a>, so the
    // accessible role is "button" even though the underlying tag is <a>.
    return this.navMenu.getByRole('button', { name: 'Get Help', exact: true });
  }

  private get aboutLink(): Locator {
    return this.navMenu.locator(`a[href="${MOBILE_HAMBURGER.HREFS.ABOUT}"]`);
  }

  private get voicesOnSefariaLink(): Locator {
    return this.navMenu
      .locator(MOBILE_HAMBURGER.MODULE_SWITCHER_ANCHOR)
      .filter({ hasText: MOBILE_HAMBURGER.LABELS.VOICES_ON_SEFARIA });
  }

  private get sefariaLibraryLink(): Locator {
    return this.navMenu
      .locator(MOBILE_HAMBURGER.MODULE_SWITCHER_ANCHOR)
      .filter({ hasText: MOBILE_HAMBURGER.LABELS.SEFARIA_LIBRARY });
  }

  private get developersLink(): Locator {
    return this.navMenu.locator(
      `a.mobileModuleSwitcher[href="${MOBILE_HAMBURGER.HREFS.DEVELOPERS}"]`,
    );
  }

  private get moreFromSefariaLink(): Locator {
    return this.navMenu.locator(`a[href="${MOBILE_HAMBURGER.HREFS.MORE_FROM_SEFARIA}"]`);
  }

  private get interfaceLanguageToggle(): Locator {
    return this.navMenu.locator(MOBILE_HAMBURGER.LABELS.LANG_TOGGLE_CONTAINER);
  }

  private get englishLanguageLinkInMenu(): Locator {
    // NextRedirectAnchor flips href to "#" on hydrate and intercepts the
    // click in JS, so we anchor on the rendered classes (int-en / int-he)
    // that the React source guarantees.
    return this.interfaceLanguageToggle.locator('a.int-en');
  }

  private get hebrewLanguageLinkInMenu(): Locator {
    return this.interfaceLanguageToggle.locator('a.int-he');
  }

  private get signupLink(): Locator {
    return this.navMenu.locator(MOBILE_HAMBURGER.SIGNUP_LINK_CLASS);
  }

  private get loginLink(): Locator {
    return this.navMenu.locator(MOBILE_HAMBURGER.LOGIN_LINK_CLASS);
  }

  // ---------------------------------------------------------------------------
  // State helpers
  // ---------------------------------------------------------------------------

  async waitForHeaderReady(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.menuButton).toBeVisible({ timeout: t(15000) });
    // Some pages (especially the voices home on a fresh popup) inject an
    // "interrupting message" overlay milliseconds after the header mounts —
    // dismiss it explicitly so the next tap doesn't hit it. We hide the
    // overlay element entirely so any handler that targets it can't block
    // pointer events on the menu button.
    await this.page
      .locator('#interruptingMessageClose')
      .click({ timeout: t(1500) })
      .catch(() => {});
    await this.page
      .evaluate(() => {
        document
          .querySelectorAll<HTMLElement>('#interruptingMessageOverlay, #interruptingMessageBox')
          .forEach((el) => {
            el.style.display = 'none';
          });
      })
      .catch(() => {});
  }

  async isMenuOpen(): Promise<boolean> {
    return await this.navMenuOpen.isVisible({ timeout: t(1500) }).catch(() => false);
  }

  /** Tap the hamburger button. Does NOT toggle — caller asserts the desired state. */
  async tapMenuButton(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.menuButton).toBeVisible({ timeout: t(5000) });
    await this.menuButton.tap();
  }

  async openMenu(): Promise<void> {
    if (await this.isMenuOpen()) return;
    await this.tapMenuButton();
    await expect(this.navMenuOpen).toBeVisible({ timeout: t(5000) });
  }

  async closeMenu(): Promise<void> {
    if (!(await this.isMenuOpen())) return;
    await this.tapMenuButton();
    await expect(this.navMenuOpen).toBeHidden({ timeout: t(5000) });
  }

  /**
   * Idempotent: switch UI language to English if not already English.
   * Detection uses the body class set by Sefaria for the active interface
   * language (`interface-english` vs `interface-hebrew`).
   * Clicking the in-menu English link triggers a full page navigation to
   * `/interface/english`, so the menu re-renders closed afterwards.
   */
  async switchToEnglishIfNeeded(): Promise<void> {
    const bodyClass = (await this.page.locator('body').getAttribute('class')) ?? '';
    if (bodyClass.includes('interface-english')) return;

    await this.openMenu();
    await expect(this.englishLanguageLinkInMenu).toBeVisible({ timeout: t(5000) });
    await this.englishLanguageLinkInMenu.tap();
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.locator('body')).toHaveClass(/interface-english/, {
      timeout: t(10000),
    });
    await hideAllModalsAndPopups(this.page);
  }

  // ---------------------------------------------------------------------------
  // Assertions — header chrome
  // ---------------------------------------------------------------------------

  async expectMobileHeaderArtifactsVisible(): Promise<void> {
    await expect(this.menuButton).toBeVisible({ timeout: t(5000) });
    await expect(this.libraryLogo).toBeVisible({ timeout: t(5000) });
    // The A/א toggle renders as <a class="languageToggle"> wrapping two SVG
    // <img>s — one with class "en" (aleph.svg = "א" glyph shown in EN UI to
    // *toggle to* Hebrew) and one with class "he" (aye.svg). CSS hides one
    // based on the parent's interface-language class. Assert both <img> tags
    // are present in the DOM and the wrapper is the only visible A/א control.
    await expect(this.headerLanguageToggle).toBeVisible({ timeout: t(5000) });
    await expect(this.headerLanguageToggle.locator('img.en')).toHaveCount(1, {
      timeout: t(5000),
    });
    await expect(this.headerLanguageToggle.locator('img.he')).toHaveCount(1, {
      timeout: t(5000),
    });
  }

  // ---------------------------------------------------------------------------
  // Assertions — open-menu contents
  // ---------------------------------------------------------------------------

  /**
   * Assert every item the user listed as required for the Library hamburger.
   * Each assertion targets a stable locator (role / href / text) so a missing
   * artefact fails loudly with a clear locator name.
   */
  async expectLibraryMenuArtifactsVisible(): Promise<void> {
    await expect(this.navMenuOpen).toBeVisible({ timeout: t(5000) });

    // Search bar
    await expect(this.searchLine).toBeVisible({ timeout: t(5000) });
    await expect(this.searchInput).toBeVisible({ timeout: t(5000) });

    // Primary nav (Library module)
    await expect(this.menuLink({ href: MOBILE_HAMBURGER.HREFS.TEXTS })).toBeVisible({
      timeout: t(5000),
    });
    await expect(this.menuLink({ href: MOBILE_HAMBURGER.HREFS.TOPICS })).toBeVisible({
      timeout: t(5000),
    });
    await expect(
      this.menuLink({ href: MOBILE_HAMBURGER.HREFS.LEARNING_SCHEDULES }),
    ).toBeVisible({ timeout: t(5000) });

    // Donate
    await expect(this.donateLink).toBeVisible({ timeout: t(5000) });

    // Language choices — both /interface/english AND /interface/hebrew
    // rendered in the same `MobileInterfaceLanguageToggle`, one of them with
    // the `inactive` class.
    await expect(this.interfaceLanguageToggle).toBeVisible({ timeout: t(5000) });
    await expect(this.englishLanguageLinkInMenu).toBeVisible({ timeout: t(5000) });
    await expect(this.hebrewLanguageLinkInMenu).toBeVisible({ timeout: t(5000) });

    // Help, About, Voices on Sefaria, Developers, More from Sefaria
    await expect(this.getHelpLink).toBeVisible({ timeout: t(5000) });
    await expect(this.aboutLink).toBeVisible({ timeout: t(5000) });
    await expect(this.voicesOnSefariaLink).toBeVisible({ timeout: t(5000) });
    await expect(this.developersLink).toBeVisible({ timeout: t(5000) });
    await expect(this.moreFromSefariaLink).toBeVisible({ timeout: t(5000) });

    // Sign up / Log in (anonymous user)
    await expect(this.signupLink).toBeVisible({ timeout: t(5000) });
    await expect(this.loginLink).toBeVisible({ timeout: t(5000) });
  }

  // ---------------------------------------------------------------------------
  // Search dropdown
  // ---------------------------------------------------------------------------

  /**
   * Type into the search bar and wait for the suggestions dropdown to appear.
   * Returns the raw set of result-type tokens collected from the per-item
   * `<img alt="...">` markers ("AuthorTopic", "Topic", "TocCategory", "ref",
   * and — if the server returns them — "User" / "Collection").
   */
  async typeIntoSearchAndCollectTypes(query: string): Promise<string[]> {
    await expect(this.searchInput).toBeVisible({ timeout: t(5000) });
    await this.searchInput.tap();
    await this.searchInput.fill(query);
    // Suggestions are debounced; wait for the listbox to materialise.
    await expect(this.searchResultsListbox).toBeVisible({ timeout: t(10000) });
    // Allow Downshift to flush the full grouped result set before reading.
    await expect
      .poll(async () => (await this.collectResultTypes()).length, { timeout: t(10000) })
      .toBeGreaterThan(0);
    return this.collectResultTypes();
  }

  /**
   * Hard assertion: every result-type icon in the mobile dropdown must be one
   * of the Library-allowed types and none of the excluded types. We assert on
   * the type-icon `alt` attribute (raw server type) rather than the
   * `type-title` text node, which can render empty during InterfaceText
   * hydration on a freshly-loaded dropdown.
   *
   * Mapping (Sefaria-Project/static/js/HeaderAutocomplete.jsx `type_title_map`):
   *   AuthorTopic / PersonTopic → Authors
   *   Topic                     → Topics
   *   TocCategory               → Categories
   *   ref                       → Books
   *   User / Collection         → must NOT appear in the Library module
   */
  async expectLibrarySearchGroupsOnly(): Promise<void> {
    const types = new Set(
      await this.typeIntoSearchAndCollectTypes(
        SEARCH_DROPDOWN.TEST_SEARCH_TERMS.LIBRARY_SHOW_ALL,
      ),
    );

    const typeToSection: Record<string, string> = {
      AuthorTopic: 'Authors',
      PersonTopic: 'Authors',
      Topic: 'Topics',
      TocCategory: 'Categories',
      ref: 'Books',
      User: 'Users',
      Collection: 'Collections',
      Term: 'Terms',
    };

    const sectionsPresent = new Set<string>();
    for (const t of types) {
      const section = typeToSection[t] ?? t;
      sectionsPresent.add(section);
    }

    // Every section that appeared must be in the canonical Library set.
    const allowed = new Set<string>(SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS);
    for (const section of sectionsPresent) {
      expect(
        allowed,
        `Unexpected section "${section}" in mobile Library search dropdown`,
      ).toContain(section);
    }

    // No excluded section may have appeared.
    for (const excluded of SEARCH_DROPDOWN.LIBRARY_EXCLUDED_SECTIONS) {
      expect(
        sectionsPresent.has(excluded),
        `Excluded section "${excluded}" appeared in mobile Library search dropdown`,
      ).toBeFalsy();
    }

    // All 4 canonical sections must be present for the "mid" query.
    for (const expected of SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS) {
      expect(
        sectionsPresent.has(expected),
        `Expected section "${expected}" missing from mobile search dropdown for query "mid"`,
      ).toBeTruthy();
    }
  }

  /**
   * Exit the search bar without selecting a result. Blurring the input collapses
   * the suggestions; the menu remains open (visible) because we never tapped
   * away from it.
   */
  async exitSearch(): Promise<void> {
    await this.searchInput.fill('');
    await this.page.keyboard.press('Escape');
    // Tap somewhere neutral inside the menu (the menu's nav container itself)
    // to ensure the input loses focus and the suggestions list is dismissed.
    await this.navMenu.tap({ position: { x: 5, y: 5 } }).catch(() => {});
    await expect(this.searchResultsListbox).toBeHidden({ timeout: t(5000) });
    await expect(this.navMenuOpen).toBeVisible({ timeout: t(5000) });
  }

  // ---------------------------------------------------------------------------
  // Navigation actions — each performs the tap, then asserts arrival URL.
  // ---------------------------------------------------------------------------

  async clickTextsAndExpectTextsPage(): Promise<void> {
    const link = this.menuLink({ href: MOBILE_HAMBURGER.HREFS.TEXTS });
    await expect(link).toBeVisible({ timeout: t(5000) });
    await link.tap();
    await expect(this.page).toHaveURL(MOBILE_PAGE_URLS.TEXTS, { timeout: t(15000) });
  }

  async clickTopicsAndExpectTopicsPage(): Promise<void> {
    const link = this.menuLink({ href: MOBILE_HAMBURGER.HREFS.TOPICS });
    await expect(link).toBeVisible({ timeout: t(5000) });
    await link.tap();
    await expect(this.page).toHaveURL(MOBILE_PAGE_URLS.TOPICS, { timeout: t(15000) });
  }

  async clickAboutAndExpectAboutPage(): Promise<void> {
    await expect(this.aboutLink).toBeVisible({ timeout: t(5000) });
    await this.aboutLink.tap();
    await expect(this.page).toHaveURL(MOBILE_PAGE_URLS.ABOUT, { timeout: t(15000) });
  }

  async clickMoreFromSefariaAndExpectProductsPage(): Promise<void> {
    await expect(this.moreFromSefariaLink).toBeVisible({ timeout: t(5000) });
    await this.moreFromSefariaLink.tap();
    await expect(this.page).toHaveURL(MOBILE_PAGE_URLS.MORE_FROM_SEFARIA, {
      timeout: t(15000),
    });
  }

  /**
   * "Voices on Sefaria" is rendered with `data-target-module={VOICES_MODULE}`
   * and `href="/"`. Sefaria's `ReaderApp.openURL` interceptor (see
   * ReaderApp.jsx:1264) detects that the target module differs from the active
   * module and calls `window.open(url, '_blank')` — so this navigation
   * opens in a NEW TAB, not the same tab.
   *
   * Returns the popup page (now on voices.*) for the caller to drive further.
   */
  async clickVoicesOnSefariaAndExpectVoicesModule(voicesUrlPattern: RegExp): Promise<Page> {
    await expect(this.voicesOnSefariaLink).toBeVisible({ timeout: t(5000) });
    const popupPromise = this.page.context().waitForEvent('page', { timeout: t(20000) });
    await this.voicesOnSefariaLink.tap();
    const voicesPage = await popupPromise;
    await voicesPage
      .waitForLoadState('domcontentloaded', { timeout: t(20000) })
      .catch(() => {
        /* domcontentloaded sometimes flakes on cross-subdomain redirects */
      });
    await expect(voicesPage).toHaveURL(voicesUrlPattern, { timeout: t(20000) });
    return voicesPage;
  }

  async expectSefariaLibraryLinkPresent(): Promise<void> {
    await expect(this.sefariaLibraryLink).toBeVisible({ timeout: t(5000) });
    await expect(this.voicesOnSefariaLink).toHaveCount(0, { timeout: t(2000) });
  }

  // ---------------------------------------------------------------------------
  // External-link (popup) helpers
  // ---------------------------------------------------------------------------
  //
  // Donate, Get Help, and Developers all carry target="_blank" in source.
  // On the Pixel 5 / iPhone 13 emulation Playwright treats the click as a
  // popup (a new page opens). The user-facing requirement ("back to hamburger
  // page") is satisfied by closing the popup — the original tab is still on
  // the library page with the menu in its previous state.

  private async openInPopupAndAssert(
    locator: Locator,
    urlPattern: RegExp,
  ): Promise<void> {
    await expect(locator).toBeVisible({ timeout: t(5000) });

    const popupPromise = this.page.context().waitForEvent('page', { timeout: t(15000) });
    await locator.tap();
    const popup = await popupPromise;
    await popup
      .waitForLoadState('domcontentloaded', { timeout: t(15000) })
      .catch(() => {
        /* some external hosts never fire DCL — URL match below is the real check */
      });
    await expect(popup).toHaveURL(urlPattern, { timeout: t(20000) });
    await popup.close();
  }

  async clickDonateAndCloseExternalTab(): Promise<void> {
    await this.openInPopupAndAssert(this.donateLink, /donate\.sefaria\.org/);
  }

  async clickGetHelpAndCloseExternalTab(): Promise<void> {
    // Help-center URL is configured per environment via siteSettings; matching
    // on `help` keeps the assertion stable across sandboxes.
    await this.openInPopupAndAssert(this.getHelpLink, /help|zendesk|support/i);
  }

  async clickDevelopersAndCloseExternalTab(): Promise<void> {
    await this.openInPopupAndAssert(this.developersLink, /developers\.sefaria\.org/);
  }
}
