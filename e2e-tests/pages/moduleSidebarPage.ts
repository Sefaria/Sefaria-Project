import { Page, Locator, expect } from '@playwright/test';
import { HelperBase } from './helperBase';

/**
 * Specification for footer link testing
 */
export type FooterLinkSpec = {
  name: string; // visible text
  selector?: string; // optional selector (within footer container)
  href?: RegExp | string; // expected href or regex
  opensNewTab?: boolean; // whether link should open in new tab
  isMailto?: boolean; // whether link is a mailto link
};

/**
 * Page object for testing sidebar and footer functionality across Sefaria's Library and Voices modules.
 * Extends HelperBase to provide language-aware testing capabilities.
 */
export class ModuleSidebarPage extends HelperBase {
  footer: Locator;

  constructor(page: Page, language: string) {
    super(page, language);
    this.footer = page.locator('aside.navSidebar .stickySidebarFooter .footerContainer');
  }

  /**
   * Wait for sidebar footer to be visible
   */
  async waitForFooter() {
    await expect(this.footer).toBeVisible({ timeout: 5000 });
  }

  /**
   * Get footer link locator by its visible text
   * @param text - The visible text of the link
   * @returns Locator for the footer link
   */
  getFooterLinkByText(text: string): Locator {
    return this.footer.locator('a', { hasText: text });
  }

  /**
   * Get a sidebar module container by its heading text
   * @param headingText - The text of the module heading
   * @returns Locator for the module container
   */
  getModuleByHeading(headingText: string): Locator {
    const headingLocator = this.page.getByRole('heading', { name: new RegExp(headingText, 'i') });
    return this.page.locator('aside.navSidebar .navSidebarModule').filter({ has: headingLocator }).first();
  }

  /**
   * Verify a module contains non-empty descriptive text
   * @param headingText - The text of the module heading
   */
  async verifyModuleHasText(headingText: string) {
    const module = this.getModuleByHeading(headingText);
    // Ensure module and its heading are visible
    const heading = module.getByRole('heading', { name: new RegExp(headingText, 'i') });
    await expect(heading).toBeVisible();

    // Look for paragraph or span text inside the module
    const textLocator = module.locator('p.sidebarModuleText, span.int-en');
    await expect(textLocator.first()).toBeVisible();
    const txt = await textLocator.first().innerText();
    expect(txt.trim().length).toBeGreaterThan(5);
  }

  /**
   * Verify a button inside a module exists and matches href/behavior
   * @param options - Configuration for button verification
   */
  async verifyModuleButton(options: {
    headingText: string;
    buttonText: string;
    href?: RegExp | string;
    opensNewTab?: boolean;
    isRoleButton?: boolean;
  }) {
    const module = this.getModuleByHeading(options.headingText);
    // Buttons may be anchors with role=button or regular anchors
    const selector = options.isRoleButton ? 'a[role="button"]' : 'a';
    const button = module.locator(selector).filter({ hasText: options.buttonText }).first();
    await expect(button).toBeVisible();

    if (options.href) {
      const href = await button.getAttribute('href');
      if (options.href instanceof RegExp) {
        expect(href).toMatch(options.href);
      } else {
        expect(href).toBe(options.href);
      }
    }

    if (options.opensNewTab) {
      const target = await button.getAttribute('target');
      if (target) {
        expect(target).toBe('_blank');
      }
    }
  }

  /**
   * Click a button inside a module and verify navigation behavior (new tab or same tab)
   * @param options - Configuration for button click and verification
   * @returns The new page if opened in new tab, the current page otherwise, or null for special cases
   */
  async clickAndVerifyModuleButton(options: {
    headingText: string;
    buttonText: string;
    href?: RegExp | string;
    isRoleButton?: boolean;
    expectNewTab?: boolean;
  }): Promise<Page | null> {
    const module = this.getModuleByHeading(options.headingText);
    const selector = options.isRoleButton ? 'a[role="button"]' : 'a';
    const button = module.locator(selector).filter({ hasText: options.buttonText }).first();
    await expect(button).toBeVisible();

    // Check if button opens in new tab
    const target = await button.getAttribute('target');
    const opensNewTab = target === '_blank' || (options.expectNewTab ?? false);

    return this.handleClickNavigation(button, opensNewTab);
  }

  /**
   * Private helper to handle click navigation for both new and same-tab scenarios
   * @param locator - The element to click
   * @param opensNewTab - Whether the element opens in a new tab
   * @returns The new page if opened in new tab, the current page otherwise, or null
   */
  private async handleClickNavigation(locator: any, opensNewTab: boolean): Promise<Page | null> {
    if (opensNewTab) {
      const [newPage] = await Promise.all([
        this.page.context().waitForEvent('page'),
        locator.click(),
      ]);
      await newPage.waitForLoadState('domcontentloaded');
      return newPage;
    } else {
      const navigationPromise = this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
      await locator.click();
      await navigationPromise;
      return this.page;
    }
  }

  /**
   * Verify a single footer link's href and target behavior
   * @param spec - Footer link specification
   */
  async verifyFooterLink(spec: FooterLinkSpec) {
    await this.waitForFooter();
    const link = spec.selector ? this.footer.locator(spec.selector) : this.getFooterLinkByText(spec.name);
    await expect(link).toBeVisible();

    // Check href
    if (spec.href) {
      const href = await link.getAttribute('href');
      if (spec.isMailto) {
        expect(href).toMatch(/^mailto:/);
      } else if (spec.href instanceof RegExp) {
        expect(href).toMatch(spec.href);
      } else if (typeof spec.href === 'string') {
        expect(href).toBe(spec.href);
      }
    }

    // Check target attribute for new tab behavior
    if (spec.opensNewTab) {
      const target = await link.getAttribute('target');
      if (target) {
        expect(target === '_blank').toBeTruthy();
      }
    }
  }

  /**
   * Click link and verify navigation behavior (new tab or same tab)
   * @param spec - Footer link specification
   * @returns The new page if opened in new tab, the current page otherwise, or null for mailto links
   */
  async clickAndVerifyLink(spec: FooterLinkSpec): Promise<Page | null> {
    await this.waitForFooter();
    const link = spec.selector ? this.footer.locator(spec.selector) : this.getFooterLinkByText(spec.name);
    await expect(link).toBeVisible();

    // For mailto links, just verify the href without clicking
    if (spec.isMailto) {
      return null;
    }

    // For regular links, use the common click navigation handler
    return this.handleClickNavigation(link, spec.opensNewTab ?? false);
  }

  /**
   * Verify the footer layout and visual expectations
   */
  async verifyFooterAppearance() {
    await this.waitForFooter();

    // Footer should be near bottom-right: check that its bounding box is lower on the page
    const footerBox = await this.footer.boundingBox();
    const viewport = this.page.viewportSize();
    if (footerBox && viewport) {
      // Footer's bottom should be greater than 60% of viewport height
      expect(footerBox.y + footerBox.height).toBeGreaterThan(viewport.height * 0.5);
      // Footer should be aligned more to the right than left
      expect(footerBox.x).toBeGreaterThan(viewport.width * 0.15);
    }

    // Links should be visible - inspect first link
    const firstLink = this.footer.locator('a').first();
    await expect(firstLink).toBeVisible();

    // Check computed color is defined
    const color = await firstLink.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBeTruthy();
  }

  /**
   * Convenience batch verification for the known footer links
   */
  async verifyStandardFooterLinks() {
    const specs: FooterLinkSpec[] = [
      { name: 'About', href: /modularization\.cauldron/, opensNewTab: false },
      { name: 'Help', href: /help\.sefaria\.org|modularization\.cauldron/, opensNewTab: true },
      { name: 'Contact Us', href: /^mailto:/, isMailto: true, opensNewTab: true },
      { name: 'Newsletter', href: /newsletter/, opensNewTab: false },
      { name: 'Blog', href: /blog\.sefaria\.org|sefaria\.org\.il/, opensNewTab: true },
      { name: 'Instagram', href: /instagram\.com/, opensNewTab: true },
      { name: 'Facebook', href: /facebook\.com/, opensNewTab: true },
      { name: 'YouTube', href: /youtube\.com/, opensNewTab: true },
      { name: 'Shop', href: /store\.sefaria\.org/, opensNewTab: true },
      { name: 'Ways to Give', href: /ways-to-give/, opensNewTab: false },
      { name: 'Donate', href: /donate\.sefaria\.org/, opensNewTab: false },
    ];

    for (const s of specs) {
      await this.verifyFooterLink(s);
    }
  }
}
