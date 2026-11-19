import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { LinkInfo } from './developersCommon';

/**
 * The portal homepage, `/` (DEV-HOME; brief §4.1). Discord buttons ("home_hero",
 * "home_community") are reached through DevelopersShellPage.discordButton().
 */
export class DevelopersHomePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get main() {
    return this.page.getByRole('main');
  }

  private get heroHeading() {
    return this.main.getByRole('heading', { level: 1 });
  }

  /** C6 HomeCarousel: a region of radio inputs labelled by each card's title. */
  private get carousel() {
    return this.main.getByRole('region', { name: 'Featured projects' });
  }

  private get radios() {
    return this.carousel.getByRole('radio');
  }

  private get tools() {
    return this.main.getByRole('region', { name: 'Developer tools' });
  }

  private async linkInfo(link: Locator, name?: string): Promise<LinkInfo> {
    const info = await link.evaluate((a) => ({
      name: ((a as HTMLElement).innerText || a.getAttribute('aria-label') || '').trim(),
      href: a.getAttribute('href') ?? '',
      opensInNewTab: a.getAttribute('target') === '_blank',
    }));
    return name === undefined ? info : { ...info, name };
  }

  /** "Expand Digital Torah". */
  async heroTitle(): Promise<string> {
    await expect(this.heroHeading).toBeVisible({ timeout: t(10000) });
    return (await this.heroHeading.innerText()).trim();
  }

  async heroSubtitle(): Promise<string> {
    // The subtitle is the paragraph that follows the hero title.
    const subtitle = this.heroHeading.locator('xpath=following-sibling::p[1]');
    await expect(subtitle).toBeVisible({ timeout: t(10000) });
    return (await subtitle.innerText()).trim();
  }

  /** The typed code line once the animation has finished (`Ref("Shabbat 4b")…`). */
  async heroCodeText(): Promise<string> {
    // Decorative (aria-hidden), so it has no role or name: the text is the anchor.
    const code = this.main.getByText(/^Ref\("/).first();
    await expect(code).toBeAttached({ timeout: t(10000) });
    await expect.poll(async () => ((await code.textContent()) ?? '').trim(), { timeout: t(15000) }).toMatch(/\)$/);
    return ((await code.textContent()) ?? '').trim();
  }

  /** Distance in CSS px from the bottom of the header to the top of the hero title (D-11). */
  async heroTopSpacing(): Promise<number> {
    await expect(this.heroHeading).toBeVisible({ timeout: t(10000) });
    const header = await this.page.getByRole('banner').boundingBox();
    const title = await this.heroHeading.boundingBox();
    if (!header || !title) throw new Error('header or hero title not rendered');
    return Math.round(title.y - (header.y + header.height));
  }

  /** The featured-project cards of the carousel, in order. */
  async carouselCards(): Promise<LinkInfo[]> {
    await expect(this.radios.first()).toBeAttached({ timeout: t(10000) });
    const titles = await this.radios.evaluateAll((inputs) => inputs.map((i) => i.getAttribute('aria-label') ?? ''));
    const cards: LinkInfo[] = [];
    for (const title of titles) {
      // Each card's call-to-action link follows its title inside the carousel region.
      const link = this.carousel
        .getByText(title, { exact: true })
        .locator('xpath=ancestor::*[.//a][1]')
        .getByRole('link')
        .first();
      cards.push(await this.linkInfo(link, title));
    }
    return cards;
  }

  /** Number of radio controls of the CSS-only carousel. */
  async carouselControlCount(): Promise<number> {
    await expect(this.radios.first()).toBeAttached({ timeout: t(10000) });
    return this.radios.count();
  }

  /** Select slide `index` (0-based) through its radio control. */
  async selectCarouselSlide(index: number): Promise<void> {
    // The radios are visually hidden and their labels are aria-hidden dots, so pointer clicks land on the
    // cards; a radio group is driven from the keyboard instead: focus the checked radio, then arrow keys.
    const current = await this.activeCarouselSlide();
    await this.radios.nth(current).focus();
    for (let i = current; i !== index; i += index > current ? 1 : -1) {
      await this.page.keyboard.press(index > current ? 'ArrowRight' : 'ArrowLeft');
    }
    await expect(this.radios.nth(index)).toBeChecked({ timeout: t(5000) });
  }

  /** Index (0-based) of the slide whose radio is checked. */
  async activeCarouselSlide(): Promise<number> {
    return this.radios.evaluateAll((inputs) => inputs.findIndex((i) => (i as HTMLInputElement).checked));
  }

  /** The carousel's button to the gallery. */
  async galleryButton(): Promise<LinkInfo> {
    return this.linkInfo(this.carousel.getByRole('link', { name: /Sefaria-Powered Projects/ }));
  }

  /** The six tool tiles, in order. */
  async toolTiles(): Promise<LinkInfo[]> {
    const tiles = this.tools.getByRole('link');
    await expect(tiles.first()).toBeVisible({ timeout: t(10000) });
    return tiles.evaluateAll((anchors) =>
      anchors.map((a) => {
        // The whole tile is the link; its title is the first line of its text.
        const title = a.querySelector('h2, h3, h4, [class*="title"]') as HTMLElement | null;
        return {
          name: (title?.innerText ?? (a as HTMLElement).innerText.split('\n')[0]).trim(),
          href: a.getAttribute('href') ?? '',
          opensInNewTab: a.getAttribute('target') === '_blank',
        };
      })
    );
  }

  /** Click a same-tab tile and wait for the navigation. */
  async clickToolTile(name: string): Promise<void> {
    const before = this.page.url();
    await this.tools.getByRole('link', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
    await this.page.waitForURL((url) => url.toString() !== before, { timeout: t(15000) });
  }

  /** The newsletter band's link (ActiveCampaign form 46). */
  async newsletterLink(): Promise<LinkInfo> {
    const link = this.main.getByRole('link', { name: 'Sign Up', exact: true });
    await expect(link).toBeVisible({ timeout: t(10000) });
    return this.linkInfo(link);
  }

  /** The community band's heading and body text. */
  async communityBandText(): Promise<string> {
    const band = this.main.getByRole('region', { name: 'Join the developer community' });
    await expect(band).toBeVisible({ timeout: t(10000) });
    return (await band.innerText()).replace(/\s+/g, ' ').trim();
  }
}
