import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { RequestCapture, interceptRequests, notImplemented } from './developersCommon';

/**
 * A docs page (`/docs/<slug>`), a guide page inside the reference section, or a custom page
 * (`/page/<slug>`): the article body, its components (PLAN §2.6) and the right rail
 * (DEV-DOC, DEV-FORM; PLAN §6.2 G). Title, footer, sidebar and Discord buttons are on
 * DevelopersShellPage; Copy Page is on DevelopersCopyPage.
 */
export class DevelopersDocsPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Table of contents and scroll spy ---------------------------------------------------

  async isTocVisible(): Promise<boolean> {
    return notImplemented('DevelopersDocsPage.isTocVisible');
  }

  async tocEntries(): Promise<string[]> {
    return notImplemented('DevelopersDocsPage.tocEntries');
  }

  /** The entry marked current, or null when none is. */
  async activeTocEntry(): Promise<string | null> {
    return notImplemented('DevelopersDocsPage.activeTocEntry');
  }

  async clickTocEntry(name: string): Promise<void> {
    return notImplemented('DevelopersDocsPage.clickTocEntry');
  }

  /** Scroll the article until the heading is at the top of the viewport. */
  async scrollToHeading(name: string): Promise<void> {
    return notImplemented('DevelopersDocsPage.scrollToHeading');
  }

  // ---- Headings and anchors ---------------------------------------------------------------

  /** Hover a heading and return the href of the anchor link it reveals (e.g. "#overview"). */
  async hoverHeadingAnchor(name: string): Promise<string> {
    return notImplemented('DevelopersDocsPage.hoverHeadingAnchor');
  }

  /** The id of the heading with that text. */
  async headingId(name: string): Promise<string> {
    return notImplemented('DevelopersDocsPage.headingId');
  }

  // ---- Code blocks ------------------------------------------------------------------------

  async codeBlockCount(): Promise<number> {
    return notImplemented('DevelopersDocsPage.codeBlockCount');
  }

  /** Text of code block `index` (0-based), of its selected tab. */
  async codeBlockText(index: number): Promise<string> {
    return notImplemented('DevelopersDocsPage.codeBlockText');
  }

  /** Tab labels of a titled or grouped block; [] for a plain block. */
  async codeBlockTabs(index: number): Promise<string[]> {
    return notImplemented('DevelopersDocsPage.codeBlockTabs');
  }

  async selectCodeBlockTab(index: number, label: string): Promise<void> {
    return notImplemented('DevelopersDocsPage.selectCodeBlockTab');
  }

  /** Click the block's copy button; returns the button's label afterwards ("Copied!"). */
  async copyCodeBlock(index: number): Promise<string> {
    return notImplemented('DevelopersDocsPage.copyCodeBlock');
  }

  // ---- Images -----------------------------------------------------------------------------

  async imageCount(): Promise<number> {
    return notImplemented('DevelopersDocsPage.imageCount');
  }

  /** Caption, frame and alignment of image `index`. */
  async imageInfo(index: number): Promise<{ alt: string; caption: string | null; framed: boolean; align: string }> {
    return notImplemented('DevelopersDocsPage.imageInfo');
  }

  async openImageLightbox(index: number): Promise<void> {
    return notImplemented('DevelopersDocsPage.openImageLightbox');
  }

  async isLightboxOpen(): Promise<boolean> {
    return notImplemented('DevelopersDocsPage.isLightboxOpen');
  }

  async closeLightbox(): Promise<void> {
    return notImplemented('DevelopersDocsPage.closeLightbox');
  }

  // ---- Other components -------------------------------------------------------------------

  /** Callouts in document order: their emoji, theme (info, warn, error, success…) and title. */
  async callouts(): Promise<{ emoji: string; theme: string; title: string }[]> {
    return notImplemented('DevelopersDocsPage.callouts');
  }

  async tableCount(): Promise<number> {
    return notImplemented('DevelopersDocsPage.tableCount');
  }

  /** Embeds (iframes of external media) in document order. */
  async embeds(): Promise<{ src: string; title: string }[]> {
    return notImplemented('DevelopersDocsPage.embeds');
  }

  /** HTML blocks: each is a sandboxed frame (PLAN §2.12). */
  async htmlBlockFrames(): Promise<{ src: string; sandbox: string | null }[]> {
    return notImplemented('DevelopersDocsPage.htmlBlockFrames');
  }

  /** Computed `direction` of the article ("rtl" on the Hebrew page). */
  async articleDirection(): Promise<'ltr' | 'rtl'> {
    return notImplemented('DevelopersDocsPage.articleDirection');
  }

  /** Links inside the article body, in order. */
  async articleLinks(): Promise<{ name: string; href: string }[]> {
    return notImplemented('DevelopersDocsPage.articleLinks');
  }

  // ---- Forms (DEV-FORM) -------------------------------------------------------------------

  /** The `src` of the Formstack frame on the page (contact page), or null. */
  async formstackFrameSrc(): Promise<string | null> {
    return notImplemented('DevelopersDocsPage.formstackFrameSrc');
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
