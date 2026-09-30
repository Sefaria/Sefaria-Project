import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Translations (RP-040 → RP-047).
 *
 * The Translations panel groups versions by language via `VersionsBlocksList`
 * (rendered with `sortPrioritizeLanugage="en"` so English is always first —
 * see TranslationsBox.jsx:97). Each version is a `VersionBlockWithPreview`
 * inside a `.language-block` keyed by language; each block opens to a
 * `<details>` summary with `VersionTitleAndSelector` rendering a
 * `.selectButton` anchor (text: `Currently Selected` for the active version,
 * `Select` for others — confirmed via production DOM on 2026-05-12).
 *
 * Reference text: Genesis.1 — 17 language blocks, 46 versions. The richest
 * stable surface for Translations testing.
 */
test.describe('Resource Panel — Translations — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openTranslations();
  });

  test('RP-040: Translations list is grouped and shows available versions', async () => {
    await expect(page.locator('.connectionsPanel .language-block').first())
      .toBeVisible({ timeout: t(15000) });
    const versionBlocks = page.locator('.connectionsPanel .versionBlock');
    await expect(versionBlocks.first()).toBeVisible({ timeout: t(15000) });
    expect(await versionBlocks.count()).toBeGreaterThan(1);
  });

  test('RP-041: Selecting a translation opens Translation Open mode', async () => {
    // VersionBlockWithPreview renders the title via VersionBlockHeader with
    // renderMode='contentText' → <a class="versionPreview"> wrapping the
    // version's text excerpt. Clicking that anchor triggers
    // `openVersionInSidebar` → mode "Translation Open" (TranslationsBox.jsx:53).
    const firstTitleLink = page.locator('.connectionsPanel .versionBlock .versionPreview').first();
    await expect(firstTitleLink).toBeVisible({ timeout: t(15000) });
    await firstTitleLink.click();
    await pm.onResourcePanel().expectBackButtonVisible();
  });

  test('RP-042: Open button on a non-current version navigates the reader', async () => {
    const beforeUrl = page.url();
    await pm.onResourcePanel().clickFirstNonCurrentSelectButton();
    await page.waitForLoadState('domcontentloaded', { timeout: t(15000) });
    // The URL acquires a version parameter (e.g. `?ven=...&lang=...`).
    expect(page.url()).not.toBe(beforeUrl);
  });

  test('RP-043: Currently-selected version is labeled "Currently Selected"', async () => {
    await pm.onResourcePanel().expectCurrentlySelectedButton();
  });

  test('RP-044: English language group is rendered first (priority sort)', async () => {
    // `VersionsBlocksList.sortVersions` (VersionBlock.jsx:366) puts the
    // prioritized language first, then sorts the rest alphabetically by ISO
    // code. We pass `"en"` as the priority — so the first `.language-block`
    // header must start with "English".
    const headers = await pm.onResourcePanel().getLanguageBlockHeaders();
    expect(headers.length).toBeGreaterThanOrEqual(2);
    expect(headers[0].toLowerCase()).toMatch(/^english/);
  });

  test('RP-046: Translation list renders without crashing', async () => {
    // We have no production text without translations (every text on Sefaria
    // currently has at least the Sefaria Community Translation). The CSV's
    // "no English translation" scenario therefore can't be reproduced as
    // written; we assert the *resilience* contract — the panel mounts and
    // renders either a populated `.versionsBox`/`.language-block` OR a
    // `LoadingMessage` empty state.
    const mounted = page.locator(
      '.connectionsPanel .versionsBox, .connectionsPanel .language-block, .connectionsPanel .loadingMessage'
    ).first();
    await expect(mounted).toBeVisible({ timeout: t(15000) });
  });

  test('RP-047: Extended Notes slot is structurally present for the current version', async () => {
    // RP-047 is the per-version analog of RP-034: the
    // `.versionExtendedNotesLinks` slot is rendered by `VersionBlock` for
    // the current version in the About panel. We assert it from the About
    // mode because the Translations preview component
    // (`VersionBlockWithPreview`) deliberately does not include this slot —
    // it's surfaced only via the About panel.
    await pm.onResourcePanel().clickBack();
    await pm.onResourcePanel().openAbout();
    await pm.onResourcePanel().expectExtendedNotesSlotForAlternateVersions();
  });
});
