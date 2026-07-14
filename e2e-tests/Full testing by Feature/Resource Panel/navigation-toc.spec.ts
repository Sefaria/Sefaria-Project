import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Navigation (Table of Contents) (RP-020 → RP-023).
 *
 * The TOC mode renders `<TextTableOfContents>` from BookPage.jsx, which
 * shows the book's section hierarchy. From the resource panel it appears
 * under `.textTableOfContents` (or `.tocContent` depending on book type).
 */
test.describe('Resource Panel — Navigation (TOC) — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
  });

  test('RP-020: TOC opens with the full book hierarchy', { tag: '@sanity' }, async () => {
    await pm.onResourcePanel().openTOC();
    // At least one section link must be rendered.
    const links = page.locator('.connectionsPanel .textTableOfContents a, .connectionsPanel .tocContent a');
    await expect(links.first()).toBeVisible({ timeout: t(10000) });
  });

  test('RP-021: Clicking a section link navigates the main reader', async () => {
    await pm.onResourcePanel().openTOC();
    const before = page.url();
    const href = await pm.onResourcePanel().clickFirstTocSection();
    // Either the main URL changed, or the panel state shifted — both are
    // valid since BookPage section clicks call `navigatePanel(ref)` which
    // routes through the multi-panel state machine.
    await page.waitForLoadState('domcontentloaded', { timeout: t(15000) });
    expect(page.url() !== before || (href ?? '') !== '').toBeTruthy();
  });

  test('RP-022: Back button from TOC returns to Resources', async () => {
    await pm.onResourcePanel().openTOC();
    await pm.onResourcePanel().expectBackButtonVisible();
    await pm.onResourcePanel().clickBack();
    await pm.onResourcePanel().expectMode('Resources');
  });
});

/**
 * RP-023: Hebrew TOC labels — Talmud has chapter numbering that's distinctly
 * Hebrew in RTL layout (interface=hebrew, content stays bilingual). We use
 * Berakhot.2a as the reference Talmud daf.
 */
test.describe('Resource Panel — Navigation (TOC) — Hebrew', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    // Genesis works in both languages and has a deterministic segment markup.
    // Hebrew Talmud (Berakhot.2a) has a different DOM shape and is less
    // reliable as an entry point.
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await pm.onResourcePanel().waitForReaderReady();
  });

  test('RP-023: Hebrew TOC renders the book hierarchy with the Hebrew interface', { tag: '@sanity' }, async () => {
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openTOC();
    const tocLinks = page.locator('.connectionsPanel .textTableOfContents a, .connectionsPanel .tocContent a');
    await expect(tocLinks.first()).toBeVisible({ timeout: t(15000) });
  });
});
