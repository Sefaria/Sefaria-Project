import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Hebrew UI (RP-210, RP-211, RP-212).
 *
 * The interface language is set via Sefaria's `interfaceLang` cookie (handled
 * by `goToPageWithLang(context, url, LANGUAGES.HE)`). When set, the React
 * tree adds `interface-hebrew` to the `<body>` and the CSS chooses RTL.
 *
 * Category and book titles in ConnectionsList come from
 * `Sefaria.hebrewTerm(category)` / `index.heTitle`; ContentText renders
 * `.he` / `.en` spans appropriately based on `Sefaria.interfaceLang`.
 */
test.describe('Resource Panel — Hebrew UI', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
  });

  test('RP-210: The Hebrew interface renders the app shell as RTL', async () => {
    // The body and `.readerApp` carry direction=rtl when interface=hebrew.
    // The `.connectionsPanel` itself inherits LTR when wrapped in a
    // `.readerPanel.english` (English-content panel inside a Hebrew app).
    // What's user-visible RTL is the app shell — the readerApp's layout,
    // chevrons, scrollbars, etc.
    const bodyClass = await pm.onResourcePanel().getBodyClass();
    expect(bodyClass).toContain('interface-hebrew');
    const appDirection = await page.locator('.readerApp').first().evaluate(
      (el) => window.getComputedStyle(el).direction,
    );
    expect(appDirection).toBe('rtl');
    const bodyDirection = await page.locator('body').first().evaluate(
      (el) => window.getComputedStyle(el).direction,
    );
    expect(bodyDirection).toBe('rtl');
  });

  test('RP-211: Connection categories render Hebrew labels in ConnectionsList', async () => {
    await pm.onResourcePanel().openCategoryConnections('Commentary');
    // The category label inside the open ConnectionsList header should be
    // rendered in Hebrew text — ContentText switches on interfaceLang and
    // emits "כל הקישורים לפרשנות" (or the heCategory) for Commentary.
    const label = await pm.onResourcePanel().getCategoryDisplayText('Commentary');
    // Hebrew text contains characters in the U+05D0–U+05EA Hebrew block.
    expect(label).toMatch(/[א-ת]/);
  });

  test('RP-212: About panel renders bilingual content respecting the Hebrew interface', async () => {
    await pm.onResourcePanel().openAbout();
    // The About title is shown via ContentText. In Hebrew interface, the
    // heTitle should be the visible text (the ContentText helper hides .en
    // via CSS in body.interface-hebrew). We assert that at least one Hebrew
    // character renders in the About panel — proof that the Hebrew rendering
    // path is active.
    const aboutText = await page.locator('.connectionsPanel .aboutBox').first().innerText();
    expect(aboutText).toMatch(/[א-ת]/);
  });
});
