/**
 * Entry for the DEV-GAL suites: serve the gallery's API snapshot (reads only), then the house entry point.
 * The @sanity/@pr journeys (gallery-sanity.spec.ts) do not use this: they run against the real data.
 */
import { BrowserContext, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { developersUrl } from '../../pages/developers/developersCommon';
import { GalleryRow, serveGalleryFixture } from '../../pages/developers/developersGalleryPage';

export const DESCRIBE = 'Developers Gallery, English';

/** Widths the original suite's "mobile" project covered (Pixel 7, 390x844): the filter sheet, list rows. */
export const MOBILE_VIEWPORT = { width: 390, height: 844 };

export async function enterGallery(
  context: BrowserContext,
  path = '/powered-by',
  change?: (rows: GalleryRow[]) => void
): Promise<{ page: Page; pm: PageManager }> {
  await serveGalleryFixture(context, change);
  const page = await goToPageWithLang(context, developersUrl(path), LANGUAGES.EN);
  return { page, pm: new PageManager(page, LANGUAGES.EN) };
}

/** Feature the three projects the original featured-band tests used. */
export function featureThree(ids: readonly number[]) {
  return (rows: GalleryRow[]) => {
    for (const row of rows) if (ids.includes(row.id)) row.featured = true;
  };
}
