import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { LinkInfo, notImplemented } from './developersCommon';

/**
 * The portal homepage, `/` (DEV-HOME; brief §4.1). Discord buttons ("home_hero",
 * "home_community") are reached through DevelopersShellPage.discordButton().
 */
export class DevelopersHomePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /** "Expand Digital Torah". */
  async heroTitle(): Promise<string> {
    return notImplemented('DevelopersHomePage.heroTitle');
  }

  async heroSubtitle(): Promise<string> {
    return notImplemented('DevelopersHomePage.heroSubtitle');
  }

  /** The typed code line once the animation has finished (`Ref("Shabbat 4b")…`). */
  async heroCodeText(): Promise<string> {
    return notImplemented('DevelopersHomePage.heroCodeText');
  }

  /** Distance in CSS px from the bottom of the header to the top of the hero title (D-11). */
  async heroTopSpacing(): Promise<number> {
    return notImplemented('DevelopersHomePage.heroTopSpacing');
  }

  /** The featured-project cards of the carousel, in order. */
  async carouselCards(): Promise<LinkInfo[]> {
    return notImplemented('DevelopersHomePage.carouselCards');
  }

  /** Number of radio controls of the CSS-only carousel. */
  async carouselControlCount(): Promise<number> {
    return notImplemented('DevelopersHomePage.carouselControlCount');
  }

  /** Select slide `index` (0-based) through its radio control. */
  async selectCarouselSlide(index: number): Promise<void> {
    return notImplemented('DevelopersHomePage.selectCarouselSlide');
  }

  /** Index (0-based) of the slide whose radio is checked. */
  async activeCarouselSlide(): Promise<number> {
    return notImplemented('DevelopersHomePage.activeCarouselSlide');
  }

  /** The carousel's button to the gallery. */
  async galleryButton(): Promise<LinkInfo> {
    return notImplemented('DevelopersHomePage.galleryButton');
  }

  /** The six tool tiles, in order. */
  async toolTiles(): Promise<LinkInfo[]> {
    return notImplemented('DevelopersHomePage.toolTiles');
  }

  /** Click a same-tab tile and wait for the navigation. */
  async clickToolTile(name: string): Promise<void> {
    return notImplemented('DevelopersHomePage.clickToolTile');
  }

  /** The newsletter band's link (ActiveCampaign form 46). */
  async newsletterLink(): Promise<LinkInfo> {
    return notImplemented('DevelopersHomePage.newsletterLink');
  }

  /** The community band's heading and body text. */
  async communityBandText(): Promise<string> {
    return notImplemented('DevelopersHomePage.communityBandText');
  }
}
