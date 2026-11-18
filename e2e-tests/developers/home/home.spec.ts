import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { enterPortal, stubExternalSites } from '../developers-entry';

// The homepage (brief §4.1): hero, the CSS-only carousel with radio controls, six tool tiles and their
// targets, the newsletter band, the community band, and the two Discord placements (I-3).
const FORMSTACK_DISCORD = /^https:\/\/sefaria\.formstack\.com\/forms\/sefaria_developer_discord_community/;

test.describe('Developers Home, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, '/'));
  });

  test('DEV-HOME-001: The homepage loads with its hero title and six tiles', { tag: ['@sanity', '@pr'] }, async () => {
    const home = pm.onDevelopersHome();
    expect(await home.heroTitle()).toBe('Expand Digital Torah');
    expect(await home.toolTiles()).toHaveLength(6);
  });

  test('DEV-HOME-002: The document title is "Sefaria" and the Home tab is active', async () => {
    await expect(page).toHaveTitle('Sefaria');
    expect(await pm.onDevelopersShell().activeHeaderTab()).toBe('Home');
  });

  test('DEV-HOME-003: The hero subtitle copies live', async () => {
    expect(await pm.onDevelopersHome().heroSubtitle()).toBe(
      'Leverage the largest open-source database of Jewish texts in history to build apps and services for the People of the Book.'
    );
  });

  test('DEV-HOME-004: The hero code line ends on Ref("Shabbat 4b").all_segment_refs()', async () => {
    expect(await pm.onDevelopersHome().heroCodeText()).toBe('Ref("Shabbat 4b").all_segment_refs()');
  });

  test("DEV-HOME-005: The six tiles and their targets, in live's order", async () => {
    const tiles = await pm.onDevelopersHome().toolTiles();
    expect(tiles.map((tile) => tile.name)).toEqual([
      'Download Sefaria Data',
      'AI & ML Assets',
      'Tutorial: Build a Data Visualization',
      'API Reference',
      'AI at Sefaria',
      'Documentation',
    ]);
    expect(tiles.map((tile) => tile.href)).toEqual([
      'https://github.com/Sefaria/Sefaria-Export',
      'https://huggingface.co/Sefaria',
      '/reference/data-visualization',
      '/reference/getting-started',
      'https://www.sefaria.org.il/ai',
      '/docs/welcome',
    ]);
  });

  test('DEV-HOME-006: A same-site tile opens its page', async () => {
    await pm.onDevelopersHome().clickToolTile('Documentation');
    await expect(page).toHaveURL(/\/docs\/welcome$/, { timeout: t(15000) });
    expect(await pm.onDevelopersShell().pageTitle()).toBe("Welcome to Sefaria's Technical Documentation");
  });

  test('DEV-HOME-007: Each internal tile target exists', async () => {
    const copy = pm.onDevelopersCopyPage();
    for (const tile of (await pm.onDevelopersHome().toolTiles()).filter((tile) => tile.href.startsWith('/'))) {
      expect((await copy.httpGet(tile.href)).status, tile.href).toBe(200);
    }
  });

  test('DEV-HOME-008: The carousel has one radio control per featured project, the first checked', async () => {
    const home = pm.onDevelopersHome();
    const cards = await home.carouselCards();
    expect(cards.map((card) => card.name)).toEqual(['Yamim Noraim Machzor', 'Koveah.org', 'Hadran.com']);
    expect(await home.carouselControlCount()).toBe(cards.length);
    expect(await home.activeCarouselSlide()).toBe(0);
  });

  test('DEV-HOME-009: Selecting a radio control moves the carousel', async () => {
    const home = pm.onDevelopersHome();
    await home.selectCarouselSlide(2);
    expect(await home.activeCarouselSlide()).toBe(2);
    await home.selectCarouselSlide(1);
    expect(await home.activeCarouselSlide()).toBe(1);
  });

  test('DEV-HOME-010: Each card links to its project', async () => {
    const cards = await pm.onDevelopersHome().carouselCards();
    expect(cards.map((card) => card.href)).toEqual([
      'https://play.google.com/store/apps/details?id=com.machzoryamimnoraim&pli=1',
      'https://koveah.org/',
      'https://hadran.org.il/',
    ]);
  });

  test('DEV-HOME-011: The carousel button leads to the gallery', async () => {
    const button = await pm.onDevelopersHome().galleryButton();
    expect(button).toEqual({ name: 'All Sefaria-Powered Projects', href: '/powered-by', opensInNewTab: false });
  });

  test('DEV-HOME-012: The newsletter band links to ActiveCampaign form 46', async () => {
    const link = await pm.onDevelopersHome().newsletterLink();
    expect(link.name).toBe('Sign Up');
    expect(link.href).toBe('https://sefaria.activehosted.com/f/46');
  });

  test('DEV-HOME-013: The community band invites developers to Discord', async () => {
    expect(await pm.onDevelopersHome().communityBandText()).toBe(
      'Join our Discord to talk with other developers building on Sefaria.'
    );
  });

  test('DEV-HOME-014: The hero carries the white "Join our Discord" button', async ({ context }) => {
    const shell = pm.onDevelopersShell();
    const button = await shell.discordButton('home_hero');
    expect(button).toMatchObject({ name: 'Join our Discord', opensInNewTab: true });
    expect(button!.href).toMatch(FORMSTACK_DISCORD);
    await stubExternalSites(context, /formstack\.com/);
    const tab = await shell.clickDiscordButton('home_hero');
    await expect(tab).toHaveURL(FORMSTACK_DISCORD);
    await tab.close();
  });

  test('DEV-HOME-015: The community band carries the navy "Join our Discord" button', async ({ context }) => {
    const shell = pm.onDevelopersShell();
    const button = await shell.discordButton('home_community');
    expect(button).toMatchObject({ name: 'Join our Discord', opensInNewTab: true });
    expect(button!.href).toMatch(FORMSTACK_DISCORD);
    await stubExternalSites(context, /formstack\.com/);
    const tab = await shell.clickDiscordButton('home_community');
    await expect(tab).toHaveURL(FORMSTACK_DISCORD);
    await tab.close();
  });

  test('DEV-HOME-016: Both Discord clicks are reported with their placement', async ({ context }) => {
    const { pm: fresh } = await enterPortal(context, '/robots.txt');
    const shell = fresh.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await stubExternalSites(context, /formstack\.com/);
    await shell.openPath('/');
    for (const placement of ['home_hero', 'home_community'] as const) {
      const tab = await shell.clickDiscordButton(placement);
      await tab.close();
    }
    await expect
      .poll(() => ga.events.filter((e) => e.name === 'discord_cta_click').map((e) => e.params.placement), {
        timeout: t(10000),
      })
      .toEqual(['home_hero', 'home_community']);
  });

  test('DEV-HOME-017: The homepage has no sidebar and exactly one h1', async () => {
    expect(await pm.onDevelopersShell().sidebarBox()).toBeNull();
    expect(await pm.onDevelopersShell().h1Count()).toBe(1);
  });
});
