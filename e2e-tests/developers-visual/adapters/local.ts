/**
 * Local adapter: drives the rebuilt portal through the page objects in
 * `e2e-tests/pages/developers/` (written in parallel by W14). Every method throws until the page
 * object it delegates to exists; the TODO on each names that method.
 *
 * Contract with the portal (requested of the Integrator, see README):
 * - comparison regions carry `data-visual-region="<RegionId>"`, masks `data-visual-mask="<MaskId>"`,
 *   mapped elements `data-visual="<key>"`, and deviation areas `data-visual-deviation="D-n"`;
 * - Try It is fulfilled from `fixtures/tryit-responses.ts` by routing the portal's own Try It
 *   request (the portal calls www.sefaria.org directly; no proxy), via `TryItController.handle`.
 */
import type { Page } from 'playwright';
import type { PlaygroundLanguage, ScrollOptions, TryItOptions, VisualAdapter } from '../adapter.ts';
import { REGIONS, MASKS, type MaskId, type RegionId } from '../regions.ts';
import { MAPPED_ELEMENTS } from '../mapped-elements.ts';

const notImplemented = (): never => {
  throw new Error('local adapter: not implemented');
};

export class LocalAdapter implements VisualAdapter {
  readonly name = 'local' as const;
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // TODO(W14 page objects): DevportalShellPage.goto(path) + waitForSettled()
  async goto(_path: string): Promise<void> {
    notImplemented();
  }
  // TODO: shared helper; same semantics as LiveAdapter.scrollToRegion over regionSelector()
  async scrollToRegion(_region: RegionId, _options?: ScrollOptions): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalShellPage.scrollToTop()
  async scrollToTop(): Promise<void> {
    notImplemented();
  }
  // TODO: likely a no-op on the portal (the window scrolls); keep for symmetry with live
  async prepareFullPage(): Promise<void> {
    notImplemented();
  }
  // TODO: HomePage.freezeAnimations()
  async freezeAnimations(): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalShellPage.parkPointer()
  async parkPointer(): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalHeaderPage.openLinksMenu()
  async openLinksMenu(): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalHeaderPage.openMobileNav()
  async openMobileNav(): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalHeaderPage.openMobileSubnav()
  async openMobileSubnav(): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalSearchPage.open()
  async openSearch(): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalSearchPage.searchFor(query) + waitForResults()
  async searchFor(_query: string): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalSidebarPage.collapse()
  async collapseSidebar(): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalSidebarPage.expandGroup(label, nth)
  async expandSidebarGroup(_label: string, _nth?: number): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalSidebarPage.filter(text)
  async filterSidebar(_text: string): Promise<void> {
    notImplemented();
  }
  // TODO: DevportalSidebarPage.scrollTo(label, nth)
  async scrollSidebarTo(_label: string, _nth?: number): Promise<void> {
    notImplemented();
  }
  // TODO: ReferencePage.openCopyPageMenu()
  async openCopyPageMenu(): Promise<void> {
    notImplemented();
  }
  // TODO: ReferencePage.openTagsPopover()
  async openTagsPopover(): Promise<void> {
    notImplemented();
  }
  // TODO: ReferenceParamsPage.openExamples(param)
  async openParamExamples(_param: string): Promise<void> {
    notImplemented();
  }
  // TODO: ReferenceParamsPage.fill(param, value)
  async fillParam(_param: string, _value: string): Promise<void> {
    notImplemented();
  }
  // TODO: ReferenceParamsPage.select(param, value)
  async selectParamOption(_param: string, _value: string): Promise<void> {
    notImplemented();
  }
  // TODO: ReferenceParamsPage.expandObject(param)
  async expandBodyParam(_param: string): Promise<void> {
    notImplemented();
  }
  // TODO: ReferenceResponseSchemaPage.expand(status)
  async expandResponseSchema(_status: string): Promise<void> {
    notImplemented();
  }
  // TODO: ReferenceResponseSchemaPage.expandFirstArray()
  async expandSchemaChildAttributes(): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.selectLanguage(lang)
  async selectLanguage(_lang: PlaygroundLanguage): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.openLibraryMenu()
  async openLibraryMenu(): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.openMoreLanguages()
  async openMoreLanguages(): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.hoverTryIt()
  async hoverTryIt(): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.tryIt() with the route fulfilled by TryItController (fixtures/tryit-responses.ts)
  async runTryIt(_options: TryItOptions): Promise<void> {
    notImplemented();
  }
  // TODO: TryItController.release() + PlaygroundPage.waitForResponse()
  async releaseTryIt(): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.openResponseMenu()
  async openResponseMenu(): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.openExampleMenu()
  async openResponseExampleMenu(): Promise<void> {
    notImplemented();
  }
  // TODO: PlaygroundPage.openHeadersModal()
  async openResponseHeaders(): Promise<void> {
    notImplemented();
  }
  // TODO: RecentRequestsPage.selectRow(index)
  async selectRecentRequestRow(_index: number): Promise<void> {
    notImplemented();
  }
  // TODO: PageFooterPage.openFeedback(answer) — never submits
  async openFeedback(_answer: 'yes' | 'no'): Promise<void> {
    notImplemented();
  }
  // TODO: DocsPage.openImageLightbox()
  async openImageLightbox(): Promise<void> {
    notImplemented();
  }

  regionSelector(region: RegionId): string | null {
    return REGIONS[region].local;
  }

  maskSelector(mask: MaskId): string | null {
    return MASKS[mask].local;
  }

  mappedSelector(key: string): string | null {
    return MAPPED_ELEMENTS.find((e) => e.key === key)?.local ?? null;
  }
}
