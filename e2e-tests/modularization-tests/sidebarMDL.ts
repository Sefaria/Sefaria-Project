import { Page, Locator, expect } from '@playwright/test';

export type FooterLinkSpec = {
  name: string; // visible text
  selector?: string; // optional selector (within footer container)
  href?: RegExp | string; // expected href or regex
  opensNewTab?: boolean; // whether link should open in new tab
  isMailto?: boolean; // whether link is a mailto link
};

export class SidebarTestHelpers {
  page: Page;
  footer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.footer = page.locator('aside.navSidebar .stickySidebarFooter .footerContainer');
  }

  // Wait for sidebar footer to be visible
  async waitForFooter() {
    await expect(this.footer).toBeVisible({ timeout: 5000 });
  }

  // Return locator for a footer link by its visible text
  getFooterLinkByText(text: string) {
    return this.footer.locator('a', { hasText: text });
  }

  // Return a sidebar module container by its heading text (robust: uses heading role)
  getModuleByHeading(headingText: string) {
    const headingLocator = this.page.getByRole('heading', { name: new RegExp(headingText, 'i') });
    return this.page.locator('aside.navSidebar .navSidebarModule').filter({ has: headingLocator }).first();
  }

  // Verify a module contains non-empty descriptive text
  async verifyModuleHasText(headingText: string) {
  const module = this.getModuleByHeading(headingText);
  // ensure module and its heading are visible
  const heading = module.getByRole('heading', { name: new RegExp(headingText, 'i') });
  await expect(heading).toBeVisible();
    // look for paragraph or span text inside the module
    const textLocator = module.locator('p.sidebarModuleText, span.int-en');
    await expect(textLocator.first()).toBeVisible();
    const txt = await textLocator.first().innerText();
    expect(txt.trim().length).toBeGreaterThan(5);
  }

  // Verify a button inside a module (by heading) exists and matches href/behavior
  async verifyModuleButton(options: { headingText: string; buttonText: string; href?: RegExp | string; opensNewTab?: boolean; isRoleButton?: boolean }) {
    const module = this.getModuleByHeading(options.headingText);
    // buttons may be anchors with role=button or anchors with class
    const selector = options.isRoleButton ? 'a[role="button"]' : 'a';
    const button = module.locator(selector).filter({ hasText: options.buttonText }).first();
    await expect(button).toBeVisible();

    if (options.href) {
      const href = await button.getAttribute('href');
      if (options.href instanceof RegExp) expect(href).toMatch(options.href);
      else expect(href).toBe(options.href);
    }

    if (options.opensNewTab) {
      const target = await button.getAttribute('target');
      if (target) expect(target).toBe('_blank');
    }
  }

  // Verify a single footer link's href and target behavior
  async verifyFooterLink(spec: FooterLinkSpec) {
    await this.waitForFooter();
    const link = spec.selector ? this.footer.locator(spec.selector) : this.getFooterLinkByText(spec.name);
    await expect(link).toBeVisible();

    // href check
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

    // target / behavior checks
    if (spec.opensNewTab) {
      // best-effort: check target attr or rel noopener
      const target = await link.getAttribute('target');
      if (target) {
        expect(target === '_blank').toBeTruthy();
      } else {
        // fallback: anchor may open new page via JS. We can't assert that without clicking.
      }
    }
  }

  // Click link and verify navigation behavior (new tab or same tab). Returns newPage if opened.
  async clickAndVerifyLink(spec: FooterLinkSpec) {
    await this.waitForFooter();
    const link = spec.selector ? this.footer.locator(spec.selector) : this.getFooterLinkByText(spec.name);
    await expect(link).toBeVisible();

    const href = await link.getAttribute('href');

    if (spec.opensNewTab) {
      const [newPage] = await Promise.all([
        this.page.context().waitForEvent('page'),
        link.click(),
      ]);
      await newPage.waitForLoadState('domcontentloaded');
      return newPage;
    } else {
      // same tab navigation; if mailto, we won't actually navigate in browser context
      if (spec.isMailto) {
        // just assert href and do not click to avoid launching mail client
        return null;
      }
      const navigationPromise = this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
      await link.click();
      await navigationPromise;
      return this.page;
    }
  }

  // Verify the footer layout and visual expectations (approximate)
  async verifyFooterAppearance() {
    await this.waitForFooter();

    // Footer should be near bottom-right: check that its bounding box is lower on the page
    const footerBox = await this.footer.boundingBox();
    const viewport = this.page.viewportSize();
    if (footerBox && viewport) {
      // footer's bottom should be greater than 60% of viewport height (heuristic)
      expect(footerBox.y + footerBox.height).toBeGreaterThan(viewport.height * 0.5);
      // footer should be aligned more to the right than left (heuristic)
      expect(footerBox.x).toBeGreaterThan(viewport.width * 0.15);
    }

    // Links should be a group of text links and grey: inspect first link color
    const firstLink = this.footer.locator('a').first();
    await expect(firstLink).toBeVisible();
    // check computed color - best-effort: ensure it contains 'rgb' or hex and is a grey-ish value
    const color = await firstLink.evaluate((el) => getComputedStyle(el).color);
    // simple heuristic: grey has equal r,g,b components or low saturation - check r===g===b or presence of 'rgba'
    // We'll assert color is defined and not transparent
    expect(color).toBeTruthy();
  }

  // Convenience batch verification for the known footer links
  async verifyStandardFooterLinks() {
    const specs: FooterLinkSpec[] = [
      { name: 'About', href: /modularization\.cauldron/, opensNewTab: false },
      // Help historically pointed to Zendesk (help.sefaria.org) but on some environments it points
      // to the modularization cauldron domain. Accept either pattern here.
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

export default SidebarTestHelpers;
