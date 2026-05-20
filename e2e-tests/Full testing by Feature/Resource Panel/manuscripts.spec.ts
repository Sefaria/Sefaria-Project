import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Manuscripts (RP-110, RP-111).
 *
 * Mode anchor: `.manuscriptList`. Reached from Resources by clicking
 * `data-name="Manuscripts"`. Each card renders (ConnectionsPanel.jsx:1566):
 *   <div class="manuscript">
 *     <a href={image_url} target="_blank">
 *       <img class="manuscriptImage" src={thumbnail_url} />
 *     </a>
 *     <p class="manuscriptCaption">{title}</p>
 *     <div class="meta">
 *       Location: <span>{page_id}</span>
 *       Courtesy of: <span>{description}</span>
 *       License: <a class="manuscriptLicenseLink" href={license_url} target="_blank">…</a>
 *       Source: <a class="versionDetailsLink" href={source_url} target="_blank">…</a>
 *     </div>
 *   </div>
 *
 * Reference text: `Ezra.2.29` — confirmed 1 manuscript ("Leningrad Codex
 * (1008 CE)") via the /api/related API.
 */
test.describe('Resource Panel — Manuscripts — English', () => {
  // The manuscripts API fetch can queue behind other concurrent requests
  // under high test parallelism on production sefaria.org. `test.slow()`
  // triples the test timeout (50s → 150s) so the suite stays green at full
  // parallelism without slowing every other test.
  test.slow();

  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Ezra.2.29`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickFirstSegmentToOpen();
    await pm.onResourcePanel().toolsButton('Manuscripts').click();
    await pm.onResourcePanel().expectMode('manuscripts');
  });

  test('RP-110: Manuscript thumbnails render with title, location, and source', async () => {
    // Verified production state for Ezra.2.29: 1 manuscript (Leningrad Codex
    // 1008 CE) with caption / location / source link / image anchor — but
    // **no** `license` field. The license slot in ManuscriptImage
    // (ConnectionsPanel.jsx:1589) is conditional on `manuscript['license']`.
    // We assert the four fields that always render; license is an optional
    // bonus we record but don't require.
    await pm.onResourcePanel().expectManuscriptsRendered();
    const m = await pm.onResourcePanel().firstManuscript();
    expect(m.hasImage).toBeTruthy();
    expect(m.hasCaption).toBeTruthy();
    expect(m.hasLocation).toBeTruthy();
    expect(m.hasSource).toBeTruthy();
    expect(m.imageHref ?? '').toMatch(/^https?:\/\//);
  });

  test('RP-111: Clicking a manuscript thumbnail opens its full resolution in a new tab', async () => {
    const newPage = await pm.onResourcePanel().clickFirstManuscriptAndCaptureNewPage();
    // The full-resolution URL is some external image (e.g. national library
    // CDN). We just confirm a new tab opened with a non-blank URL.
    expect(newPage.url()).toMatch(/^https?:\/\//);
    expect(newPage.url()).not.toContain('about:blank');
    await newPage.close();
  });
});
