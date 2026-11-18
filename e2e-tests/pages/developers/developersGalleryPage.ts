import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { GalleryCard, GalleryFacet, GallerySort, GalleryView, LinkInfo, notImplemented } from './developersCommon';

/**
 * The "Powered by Sefaria" gallery under `/powered-by` (DEV-GAL; brief §4.8, PLAN §2.14):
 * browse with search, filters, known-issues switch, sort, view, featured band, project pages.
 * All browse state lives in the URL; read it with `page.url()`.
 */
export class DevelopersGalleryPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Browse -----------------------------------------------------------------------------

  /** Wait until the project list has loaded (from /api/powered-by). */
  async waitForProjects(): Promise<void> {
    return notImplemented('DevelopersGalleryPage.waitForProjects');
  }

  /** Cards currently shown, in order. */
  async projectCards(): Promise<GalleryCard[]> {
    return notImplemented('DevelopersGalleryPage.projectCards');
  }

  /** The result count the page announces ("N projects"). */
  async resultCount(): Promise<number> {
    return notImplemented('DevelopersGalleryPage.resultCount');
  }

  /** "Show more": appends the next batch; returns the title of the card that gets focus. */
  async showMore(): Promise<string> {
    return notImplemented('DevelopersGalleryPage.showMore');
  }

  async search(query: string): Promise<void> {
    return notImplemented('DevelopersGalleryPage.search');
  }

  async clearSearch(): Promise<void> {
    return notImplemented('DevelopersGalleryPage.clearSearch');
  }

  // ---- Filters ----------------------------------------------------------------------------

  /** Expand a filter section's disclosure. */
  async openFilterSection(facet: GalleryFacet): Promise<void> {
    return notImplemented('DevelopersGalleryPage.openFilterSection');
  }

  async isFilterSectionOpen(facet: GalleryFacet): Promise<boolean> {
    return notImplemented('DevelopersGalleryPage.isFilterSectionOpen');
  }

  /** Check or uncheck a value (or choose a Category). */
  async toggleFilter(facet: GalleryFacet, value: string): Promise<void> {
    return notImplemented('DevelopersGalleryPage.toggleFilter');
  }

  /** The count shown next to a value. */
  async filterCount(facet: GalleryFacet, value: string): Promise<number> {
    return notImplemented('DevelopersGalleryPage.filterCount');
  }

  /** "Show all" in a long section; returns the values now listed. */
  async showAllInSection(facet: GalleryFacet): Promise<string[]> {
    return notImplemented('DevelopersGalleryPage.showAllInSection');
  }

  /** Type into a searchable section's own box (e.g. "Filter topics"); returns the values left. */
  async narrowFilterSection(facet: GalleryFacet, text: string): Promise<string[]> {
    return notImplemented('DevelopersGalleryPage.narrowFilterSection');
  }

  /** Active-filter chips, e.g. "Built with: Python". */
  async activeFilterChips(): Promise<string[]> {
    return notImplemented('DevelopersGalleryPage.activeFilterChips');
  }

  async removeFilterChip(label: string): Promise<void> {
    return notImplemented('DevelopersGalleryPage.removeFilterChip');
  }

  /** "Clear filters" (also offered by the empty state). */
  async clearFilters(): Promise<void> {
    return notImplemented('DevelopersGalleryPage.clearFilters');
  }

  /** The empty state's text, or null when projects are shown. */
  async emptyStateText(): Promise<string | null> {
    return notImplemented('DevelopersGalleryPage.emptyStateText');
  }

  async setKnownIssuesShown(shown: boolean): Promise<void> {
    return notImplemented('DevelopersGalleryPage.setKnownIssuesShown');
  }

  async areKnownIssuesShown(): Promise<boolean> {
    return notImplemented('DevelopersGalleryPage.areKnownIssuesShown');
  }

  // ---- Mobile filter sheet ----------------------------------------------------------------

  async openFilterSheet(): Promise<void> {
    return notImplemented('DevelopersGalleryPage.openFilterSheet');
  }

  /** The sheet's "Show N projects" button: applies the pending selection. */
  async applyFilterSheet(): Promise<void> {
    return notImplemented('DevelopersGalleryPage.applyFilterSheet');
  }

  /** Close the sheet without applying (discards the pending selection). */
  async closeFilterSheet(): Promise<void> {
    return notImplemented('DevelopersGalleryPage.closeFilterSheet');
  }

  // ---- Sort and view ----------------------------------------------------------------------

  async sortBy(sort: GallerySort): Promise<void> {
    return notImplemented('DevelopersGalleryPage.sortBy');
  }

  async currentSort(): Promise<GallerySort> {
    return notImplemented('DevelopersGalleryPage.currentSort');
  }

  async setView(view: GalleryView): Promise<void> {
    return notImplemented('DevelopersGalleryPage.setView');
  }

  async currentView(): Promise<GalleryView> {
    return notImplemented('DevelopersGalleryPage.currentView');
  }

  // ---- Featured band ----------------------------------------------------------------------

  /** Featured cards (up to 3), or [] when the band is absent. */
  async featuredCards(): Promise<GalleryCard[]> {
    return notImplemented('DevelopersGalleryPage.featuredCards');
  }

  // ---- Project page -----------------------------------------------------------------------

  /** Open a project from its card (or the arrow of a known-issues card). */
  async openProject(title: string): Promise<void> {
    return notImplemented('DevelopersGalleryPage.openProject');
  }

  async projectTitle(): Promise<string> {
    return notImplemented('DevelopersGalleryPage.projectTitle');
  }

  /** The known-issues notice on a project page, or null. */
  async knownIssuesNotice(): Promise<string | null> {
    return notImplemented('DevelopersGalleryPage.knownIssuesNotice');
  }

  /** The project's primary link (its site or repository). */
  async projectPrimaryLink(): Promise<LinkInfo> {
    return notImplemented('DevelopersGalleryPage.projectPrimaryLink');
  }

  /** Browser Back to the gallery. */
  async goBack(): Promise<void> {
    return notImplemented('DevelopersGalleryPage.goBack');
  }

  /** True when the gallery's "not found" view is shown. */
  async isNotFound(): Promise<boolean> {
    return notImplemented('DevelopersGalleryPage.isNotFound');
  }

  // ---- Gallery actions moved from its old header (PLAN §2.14 item 5) ----------------------

  async submitProjectLink(): Promise<LinkInfo> {
    return notImplemented('DevelopersGalleryPage.submitProjectLink');
  }

  async donateLink(): Promise<LinkInfo> {
    return notImplemented('DevelopersGalleryPage.donateLink');
  }

  // ---- Charts (/powered-by/charts) --------------------------------------------------------

  /** Number of charts rendered on the unlisted charts page. */
  async chartCount(): Promise<number> {
    return notImplemented('DevelopersGalleryPage.chartCount');
  }

  /** Toggle the table alternative of chart `index`; returns its rows. */
  async chartTable(index: number): Promise<string[][]> {
    return notImplemented('DevelopersGalleryPage.chartTable');
  }
}
