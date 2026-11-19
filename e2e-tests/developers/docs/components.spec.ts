import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, enterPortal } from '../developers-entry';

// Each Markdown component of PLAN §2.6 on a real page (pages found by rendering every seeded page;
// see DOC_PAGES): code blocks and their tabs and copy button, images with captions and the lightbox,
// callouts, tables, embeds, sandboxed HTML blocks, the right-to-left Hebrew page, article links.
test.describe('Developers Docs, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test('DEV-DOC-030: Callouts show their emoji and theme', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.callouts);
    const callouts = await pm.onDevelopersDocs().callouts();
    expect(callouts).toContainEqual({
      emoji: '🚧',
      theme: 'warn',
      title: 'Recommended: Use API Instead of Local Install',
    });
    expect(callouts.some((c) => c.theme === 'error' && c.emoji === '❗️')).toBe(true);
  });

  // The imported content has titled blocks ("```text JSON") and plain ones, but no group of several
  // consecutive blocks (checked over all 152 source files), so tab switching is covered by Vitest
  // (devportal-ui/src/docs/codetabs.test.ts); here the titled label and its selected tab.
  test('DEV-DOC-031: Titled code blocks show their tab label; plain blocks have none', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.codeTabs);
    const docs = pm.onDevelopersDocs();
    const count = await docs.codeBlockCount();
    expect(count).toBeGreaterThan(1);
    const tabs: string[][] = [];
    for (let i = 0; i < count; i += 1) tabs.push(await docs.codeBlockTabs(i));
    const titled = tabs.findIndex((labels) => labels.length > 0);
    expect(tabs[titled]).toEqual(['JSON']);
    expect(
      tabs.some((labels) => labels.length === 0),
      'a plain block'
    ).toBe(true);
    await docs.selectCodeBlockTab(titled, 'JSON');
    expect(await docs.codeBlockText(titled)).toContain('"lastPath"');
  });

  test('DEV-DOC-032: The copy button of a code block copies it and says "Copied!"', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.codeTabs);
    const docs = pm.onDevelopersDocs();
    const text = await docs.codeBlockText(0);
    expect(await docs.copyCodeBlock(0)).toBe('Copied!');
    expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(text.trim());
  });

  test('DEV-DOC-033: Captioned images render with their caption', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.captionedImages);
    const docs = pm.onDevelopersDocs();
    const count = await docs.imageCount();
    expect(count).toBe(4);
    const infos = [];
    for (let i = 0; i < count; i += 1) infos.push(await docs.imageInfo(i));
    expect(infos.filter((i) => i.caption !== null)).toHaveLength(3);
  });

  test('DEV-DOC-034: An image opens a lightbox that closes with its Close button and with Escape', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.captionedImages);
    const docs = pm.onDevelopersDocs();
    await docs.openImageLightbox(0);
    expect(await docs.isLightboxOpen()).toBe(true);
    await docs.closeLightbox();
    expect(await docs.isLightboxOpen()).toBe(false);
    await docs.openImageLightbox(1);
    await page.keyboard.press('Escape');
    await expect.poll(() => docs.isLightboxOpen(), { timeout: t(5000) }).toBe(false);
  });

  test('DEV-DOC-035: Tables render as tables', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.table);
    expect(await pm.onDevelopersDocs().tableCount()).toBe(1);
  });

  test('DEV-DOC-036: YouTube embeds use the no-cookie player and carry a title', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.embeds);
    const embeds = await pm.onDevelopersDocs().embeds();
    expect(embeds).toHaveLength(1);
    for (const embed of embeds) {
      expect(embed.src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\//);
      expect(embed.title).not.toBe('');
    }
  });

  test('DEV-DOC-037: HTML blocks are sandboxed frames without scripts', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.htmlBlocks);
    const frames = await pm.onDevelopersDocs().htmlBlockFrames();
    expect(frames).toHaveLength(1);
    for (const frame of frames) {
      expect(new URL(frame.src).pathname).toMatch(/^\/_portal\/htmlblock\/\d+\/\d+$/);
      expect(frame.sandbox).toBe('allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    }
  });

  test('DEV-DOC-038: The Hebrew page reads right to left', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.hebrew);
    expect(await pm.onDevelopersDocs().articleDirection()).toBe('rtl');
  });

  test('DEV-DOC-039: English pages read left to right', async () => {
    expect(await pm.onDevelopersDocs().articleDirection()).toBe('ltr');
  });

  test('DEV-DOC-040: Article links are in-portal paths or deliberate external targets, never files.readme.io', async () => {
    const links = await pm.onDevelopersDocs().articleLinks();
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) {
      expect(link.href, link.name).not.toMatch(/readme\.io|developers\.sefaria\.org\/(docs|reference)/);
      expect(link.href, link.name).toMatch(/^(\/|#|https?:\/\/|mailto:)/);
    }
  });

  test('DEV-DOC-041: An in-article link opens its page', async () => {
    const internal = (await pm.onDevelopersDocs().articleLinks()).find((l) => l.href.startsWith('/docs/'));
    expect(internal).toBeDefined();
    const response = await pm.onDevelopersCopyPage().httpGet(internal!.href.split('#')[0], { followRedirects: true });
    expect(response.status).toBe(200);
  });

  test('DEV-DOC-042: A guide page in the reference section renders like a docs page', async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath('/reference/getting-started');
    expect(await shell.pageTitle()).toMatch(/Getting Started/);
    expect(await shell.activeHeaderTab()).toBe('API Reference');
    expect((await shell.sidebarItems()).find((i) => i.active)?.href).toBe('/reference/getting-started');
  });
});
