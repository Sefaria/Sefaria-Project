import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — About This Text (RP-030 → RP-034).
 *
 * AboutBox renders sections in this order (AboutBox.jsx:160-247):
 *   <section.aboutBox>
 *     <div.detailsSection>
 *       <h2.aboutHeader/> <a.aboutTitle/> <span.tocCategory/>
 *       <div.aboutAuthor> ... <a href="/topics/<slug>"> ... </a> ... </div>
 *       <div.aboutDesc/> <div.aboutComposed/>
 *     </div>
 *     <div.currVersionSection/>       (VersionBlock with .versionExtendedNotesLinks)
 *     <div.alternateVersionsSection/> (VersionsBlocksList)
 *
 * RP-033 uses `Rashi_on_Genesis.1.1` — `aboutAuthor` is stable here and
 * verified to render `<a href="/topics/rashi">Rashi</a>` (confirmed against
 * production HTML on 2026-05-12).
 *
 * RP-034 verifies the structural presence of `.versionExtendedNotesLinks`
 * inside the About panel. As of 2026-05-12 no version on production has
 * `extendedNotes` populated (verified via /api/texts API for Genesis,
 * Mishneh Torah, Pirkei Avot, Berakhot, Job, Mishnah Avot, Sefer HaChinukh,
 * Sefer Yetzirah). Production therefore always renders the slot with the
 * `n-a` class — testing the slot's *presence* validates the React rendering
 * without requiring a non-existent data shape.
 */
test.describe('Resource Panel — About This Text — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openAbout();
  });

  test('RP-030: About shows text metadata — title and description', { tag: '@sanity' }, async () => {
    await pm.onResourcePanel().expectAboutTitle();
    await pm.onResourcePanel().expectAboutDescription();
  });

  test('RP-031: About shows current version info', async () => {
    await pm.onResourcePanel().expectCurrentVersionSection();
  });

  test('RP-032: About shows alternate versions section', async () => {
    // Genesis has many alternate translations on production (verified: 57 versions).
    const hasAlt = await pm.onResourcePanel().hasAlternateVersionsSection();
    expect(hasAlt).toBeTruthy();
  });

  test('RP-034: About panel renders the Extended Notes slot for the current version', async () => {
    // The slot is always rendered; on production it is `.n-a` (hidden) for
    // every version we've inspected, which is the expected render path for
    // versions with no extendedNotes content.
    await pm.onResourcePanel().expectExtendedNotesSlotForCurrentVersion();
  });
});

test.describe('Resource Panel — About This Text — Author link', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    // `Rashi on Genesis` has a stable `aboutAuthor` block with a single
    // `<a href="/topics/rashi">Rashi</a>` link inside `.authorName`. Verified
    // against production on 2026-05-12.
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Rashi_on_Genesis.1.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickFirstSegmentToOpen();
    await pm.onResourcePanel().openAbout();
  });

  test('RP-033: Author link navigates to the author topic page', async () => {
    const authorLink = page.locator('.aboutBox .aboutAuthor a[href^="/topics/"]').first();
    await expect(authorLink).toBeVisible({ timeout: t(10000) });
    await expect(authorLink).toHaveAttribute('href', /\/topics\/rashi/i);

    // The author anchor uses a same-tab link (no target="_blank"), so we
    // assert the URL transitions to the topic page after clicking it.
    await authorLink.click();
    await page.waitForLoadState('domcontentloaded', { timeout: t(15000) });
    await expect(page).toHaveURL(/\/topics\/rashi/i, { timeout: t(10000) });
  });
});
