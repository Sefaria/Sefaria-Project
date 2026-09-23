import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Opening & General Panel Behavior (RP-001 → RP-006).
 *
 * Reference text: Genesis 1 (English Library). Most-stable Sefaria URL —
 * always available, has commentary connections, and has both Hebrew and
 * English text. Tests that need a specific segment use Genesis 1:1.
 */
test.describe('Resource Panel — Opening & General — English', { tag: '@sanity' }, () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
  });

  test('RP-001: Panel opens on segment click and defaults to Resources mode', async () => {
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().expectMode('Resources');
  });

  test('RP-002: Click-drag across multiple segments selects the range', async () => {
    // Drag the mouse from Genesis 1:1 to Genesis 1:3. React's TextColumn
    // handler reads the resulting browser selection and updates
    // `highlightedRefs` to the touched segments. We verify the selection
    // intersected the expected three refs.
    const touched = await pm.onResourcePanel().dragSelectAcrossSegments('Genesis 1:1', 'Genesis 1:3');
    expect(touched).toEqual(expect.arrayContaining(['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:3']));
  });

  test('RP-003: Panel closes via the close button', async () => {
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().closeViaCloseButton();
  });

  test('RP-004: Clicking a different segment reloads connections in the panel', async () => {
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().expectMode('Resources');

    // Click a different segment. ConnectionsPanel.componentDidUpdate compares
    // `srefs` and calls `loadData()` when they change.
    await pm.onResourcePanel().clickSegment('Genesis 1:2');
    await pm.onResourcePanel().expectMode('Resources');
    await expect(page).toHaveURL(/Genesis\.1\.2/, { timeout: t(15000) });
  });

  test('RP-005: Panel and main reader have independent scroll containers', async () => {
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().expectMode('Resources');

    const beforeMain = await pm.onResourcePanel().scrollMainReaderBy(0);
    const afterPanel = await pm.onResourcePanel().scrollPanelBy(200);
    const afterMain = await pm.onResourcePanel().scrollMainReaderBy(0);

    expect(afterPanel).toBeGreaterThanOrEqual(0);
    expect(afterMain).toBe(beforeMain);
  });

  test('RP-006: Back button returns from a sub-mode to the previous mode', async () => {
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openAbout();
    await pm.onResourcePanel().expectBackButtonVisible();
    await pm.onResourcePanel().clickBack();
    await pm.onResourcePanel().expectMode('Resources');
  });
});
