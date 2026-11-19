import { expect, Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { RequestCapture, interceptRequests } from './developersCommon';

/** Code blocks of the body: a tab group (titled or grouped blocks) or a plain `pre` outside one. */
const CODE_BLOCKS = '.dp-codetabs, pre:not(.dp-codetabs pre)';

/**
 * A docs page (`/docs/<slug>`), a guide page inside the reference section, or a custom page
 * (`/page/<slug>`): the article body, its components (PLAN §2.6) and the right rail
 * (DEV-DOC, DEV-FORM; PLAN §6.2 G). Title, footer, sidebar and Discord buttons are on
 * DevelopersShellPage; Copy Page is on DevelopersCopyPage.
 *
 * The body is server-rendered Markdown (devportal/markdown/renderer.py) that the browser
 * enhances (devportal-ui/src/docs/). Its components have no landmark of their own, so the
 * locators start at the article and use the renderer's class names only where no role or name
 * exists (code-block grouping, callout themes, image frames).
 */
export class DevelopersDocsPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get article() {
    return this.page.locator('article#content');
  }

  private get toc() {
    return this.page.getByRole('navigation', { name: 'Table of Contents' });
  }

  private get codeBlocks() {
    return this.article.locator(CODE_BLOCKS);
  }

  private get lightboxTriggers() {
    // Images may have an empty alt (role "presentation"), so the trigger is found by the img it holds.
    return this.article.locator('[role="button"]:has(img)');
  }

  private get lightbox() {
    return this.page.locator('dialog[open]');
  }

  private heading(name: string) {
    return this.article.getByRole('heading', { name, exact: false }).filter({ hasText: name }).first();
  }

  // ---- Table of contents and scroll spy ---------------------------------------------------

  async isTocVisible(): Promise<boolean> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.toc.isVisible();
  }

  async tocEntries(): Promise<string[]> {
    const links = this.toc.getByRole('link');
    await expect(links.first()).toBeAttached({ timeout: t(10000) });
    return (await links.allTextContents()).map((text) => text.trim());
  }

  /** The entry marked current, or null when none is. */
  async activeTocEntry(): Promise<string | null> {
    const current = this.toc.locator('[aria-current]');
    if ((await current.count()) === 0) return null;
    return ((await current.first().textContent()) ?? '').trim();
  }

  async clickTocEntry(name: string): Promise<void> {
    await this.toc.getByRole('link', { name, exact: true }).click();
  }

  /** Scroll the article until the heading is at the top of the viewport. */
  async scrollToHeading(name: string): Promise<void> {
    const heading = this.heading(name);
    await expect(heading).toBeAttached({ timeout: t(10000) });
    await heading.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    // Settled when two reads agree (smooth scrolling, scroll-margin).
    let last = NaN;
    await expect
      .poll(
        async () => {
          const top = await heading.evaluate((el) => Math.round(el.getBoundingClientRect().top));
          const settled = top === last;
          last = top;
          return settled;
        },
        { timeout: t(5000) }
      )
      .toBe(true);
  }

  /** Hover a heading and return the href of the anchor link it reveals (e.g. "#overview"). */
  async hoverHeadingAnchor(name: string): Promise<string> {
    const heading = this.heading(name);
    await heading.scrollIntoViewIfNeeded({ timeout: t(10000) });
    await heading.hover();
    const anchor = heading.getByRole('link', { name: `Skip link to ${name}` });
    await expect(anchor).toBeVisible({ timeout: t(5000) });
    return (await anchor.getAttribute('href')) ?? '';
  }

  /** The id of the heading with that text. */
  async headingId(name: string): Promise<string> {
    const heading = this.heading(name);
    await expect(heading).toBeAttached({ timeout: t(10000) });
    return (await heading.getAttribute('id')) ?? '';
  }

  // ---- Code blocks ------------------------------------------------------------------------

  async codeBlockCount(): Promise<number> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.codeBlocks.count();
  }

  /** Text of code block `index` (0-based), of its selected tab. */
  async codeBlockText(index: number): Promise<string> {
    const block = this.codeBlocks.nth(index);
    const code = block.locator('pre:visible code, code:visible').first();
    return ((await code.textContent()) ?? '').replace(/\n$/, '');
  }

  /** Tab labels of a titled or grouped block; [] for a plain block. */
  async codeBlockTabs(index: number): Promise<string[]> {
    const tabs = this.codeBlocks.nth(index).getByRole('tab');
    return (await tabs.allTextContents()).map((text) => text.trim());
  }

  async selectCodeBlockTab(index: number, label: string): Promise<void> {
    const tab = this.codeBlocks.nth(index).getByRole('tab', { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: t(5000) });
  }

  /** Click the block's copy button; returns the button's label afterwards ("Copied!"). */
  async copyCodeBlock(index: number): Promise<string> {
    await this.page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => undefined);
    const block = this.codeBlocks.nth(index);
    await block.scrollIntoViewIfNeeded();
    await block.hover();
    const button = block.getByRole('button', { name: 'Copy to clipboard' }).first();
    await button.click();
    const copied = block.getByRole('button', { name: 'Copied!' }).first();
    await expect(copied).toBeAttached({ timeout: t(5000) });
    return (await copied.getAttribute('aria-label')) ?? '';
  }

  // ---- Images -----------------------------------------------------------------------------

  async imageCount(): Promise<number> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.lightboxTriggers.count();
  }

  /** Caption, frame and alignment of image `index`. */
  async imageInfo(index: number): Promise<{ alt: string; caption: string | null; framed: boolean; align: string }> {
    return this.lightboxTriggers.nth(index).evaluate((trigger) => {
      const img = trigger.querySelector('img')!;
      const figure = trigger.closest('figure');
      const caption = figure?.querySelector('figcaption')?.textContent?.trim() || null;
      const alignClass = Array.from(img.classList).find((c) => c.startsWith('dp-img-align-'));
      const figureAlign = figure
        ? Array.from(figure.classList).find((c) => c.startsWith('dp-figure-align-'))
        : undefined;
      return {
        alt: img.getAttribute('alt') ?? '',
        caption,
        framed: !!figure?.classList.contains('dp-figure-framed'),
        align: (alignClass ?? figureAlign ?? '').replace(/^dp-(img|figure)-align-/, '') || 'center',
      };
    });
  }

  async openImageLightbox(index: number): Promise<void> {
    const trigger = this.lightboxTriggers.nth(index);
    await trigger.scrollIntoViewIfNeeded({ timeout: t(10000) });
    await trigger.click();
    await expect(this.lightbox).toBeVisible({ timeout: t(5000) });
  }

  async isLightboxOpen(): Promise<boolean> {
    return this.lightbox.isVisible();
  }

  async closeLightbox(): Promise<void> {
    await this.lightbox.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(this.lightbox).toBeHidden({ timeout: t(5000) });
  }

  // ---- Other components -------------------------------------------------------------------

  /** Callouts in document order: their emoji, theme (info, warn, error, success…) and title. */
  async callouts(): Promise<{ emoji: string; theme: string; title: string }[]> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.article.locator('blockquote').evaluateAll((quotes) =>
      quotes
        .filter((q) => Array.from(q.classList).some((c) => /^dp-callout-/.test(c)))
        .map((q) => {
          const theme = Array.from(q.classList)
            .find((c) => /^dp-callout-/.test(c))!
            .replace('dp-callout-', '');
          const icon = q.querySelector('[aria-hidden="true"]');
          const title = q.querySelector('h1, h2, h3, h4, h5, h6');
          return {
            emoji: (icon?.textContent ?? '').trim(),
            theme,
            title: ((title?.querySelector('[class*="text"]') ?? title)?.textContent ?? '').trim(),
          };
        })
    );
  }

  async tableCount(): Promise<number> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.article.getByRole('table').count();
  }

  /** Embeds (iframes of external media) in document order. */
  async embeds(): Promise<{ src: string; title: string }[]> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.article
      .locator('iframe:not([sandbox])')
      .evaluateAll((frames) =>
        frames.map((f) => ({ src: f.getAttribute('src') ?? '', title: f.getAttribute('title') ?? '' }))
      );
  }

  /** HTML blocks: each is a sandboxed frame (PLAN §2.12). */
  async htmlBlockFrames(): Promise<{ src: string; sandbox: string | null }[]> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.article
      .locator('iframe[title^="HTML block"]')
      .evaluateAll((frames) =>
        frames.map((f) => ({ src: (f as HTMLIFrameElement).src, sandbox: f.getAttribute('sandbox') }))
      );
  }

  /** Computed `direction` of the article ("rtl" on the Hebrew page). */
  async articleDirection(): Promise<'ltr' | 'rtl'> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    // The direction is carried by the body's text blocks (left to right, as live), not by the article. A
    // page whose body is an HTML block (the Hebrew citation page, P09) carries it inside that frame.
    const firstTextDirection = (root: Element) => {
      const blocks = Array.from(root.querySelectorAll('p, h1, h2, h3, h4, li, td, div[dir]'));
      const block = blocks.find((el) => (el.textContent ?? '').trim().length > 0);
      return block ? (getComputedStyle(block).direction as 'ltr' | 'rtl') : null;
    };
    const body = this.article.locator('#dp-article-body');
    const own = (await body.count()) ? await body.evaluate(firstTextDirection) : null;
    if (own) return own;
    const frame = this.article.locator('iframe[title^="HTML block"]').first();
    if (await frame.count()) {
      const inner = this.page.frameLocator('article#content iframe[title^="HTML block"]').first().locator('body');
      await expect(inner).toBeAttached({ timeout: t(10000) });
      const direction = await inner.evaluate(firstTextDirection);
      if (direction) return direction;
    }
    return this.article.evaluate((el) => getComputedStyle(el).direction as 'ltr' | 'rtl');
  }

  /** Links inside the article body, in order. */
  async articleLinks(): Promise<{ name: string; href: string }[]> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    return this.article
      .getByRole('link')
      .evaluateAll((anchors) =>
        anchors
          .filter((a) => !(a.getAttribute('aria-label') ?? '').startsWith('Skip link to '))
          .map((a) => ({ name: ((a as HTMLElement).innerText || '').trim(), href: a.getAttribute('href') ?? '' }))
      );
  }

  // ---- Forms ------------------------------------------------------------------------------

  /** The `src` of the Formstack frame on the page (contact page), or null. */
  async formstackFrameSrc(): Promise<string | null> {
    await expect(this.article).toBeVisible({ timeout: t(10000) });
    const frame = this.page.locator('iframe[src*="formstack.com"]').first();
    if ((await frame.count()) === 0) return null;
    return frame.getAttribute('src');
  }

  /** The Formstack frame's accessible title (C6 ContactForm: "Developer contact form"). Added by W14. */
  async formstackFrameTitle(): Promise<string | null> {
    const frame = this.page.locator('iframe[src*="formstack.com"]').first();
    if ((await frame.count()) === 0) return null;
    return frame.getAttribute('title');
  }

  /** Move keyboard focus into the Formstack frame (fires C8 `contact_form_start`). Added by W14. */
  async focusFormstackFrame(): Promise<void> {
    const frame = this.page.locator('iframe[src*="formstack.com"]').first();
    await frame.scrollIntoViewIfNeeded({ timeout: t(10000) });
    await frame.focus();
    await frame.click({ position: { x: 20, y: 20 } }).catch(() => undefined);
  }

  /** Answer every request to Formstack locally (200, empty) and record it. Reads included. */
  async interceptFormstack(): Promise<RequestCapture> {
    return interceptRequests(
      this.page,
      /^https:\/\/[^/]*formstack\.com\//,
      { status: 200, contentType: 'text/html', body: '<!doctype html><title>Formstack stub</title>' },
      { includeReads: true }
    );
  }
}
