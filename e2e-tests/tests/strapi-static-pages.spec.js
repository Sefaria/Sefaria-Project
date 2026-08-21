/**
 * Playwright Tests: promotions on headerOnly static pages (synthetic payload)
 *
 * Static pages like /testimonials and /team render ReaderApp in HEADER-ONLY mode — the server
 * emits `<div id="s2" class="headerOnly">` (templates/base.html:218) and React mounts only the
 * chrome around the Django-rendered content. StrapiDataProvider, Banner and InterruptingMessage
 * all live at the ReaderApp root, so promotions must work on these pages exactly as they do in
 * the full reader. Banner even has a branch that exists ONLY for this mode: when #s2 carries
 * headerOnly, revealing the banner also adds `hasBannerMessage` to <body> so the static layout
 * makes room (Misc.jsx, the banner's timer callback). That branch had no test until now.
 *
 * SEPARATE STRAPI CHANNELS, pinned by the last describe: /team (and /jobs) fetch their OWN
 * content straight from `STRAPI_INSTANCE + "/graphql"` (StaticPages.jsx fetchTeamMembersJSON) —
 * a completely different URL from the promotions' `/api/strapi/graphql-cache`. The two must
 * never cross: this suite's promotions route matches `**\/api/strapi/**`, which does NOT catch
 * the direct `/graphql` call, and the direct call must not be answered with a promotions
 * payload. The test serves each channel its own synthetic response and asserts both consumers
 * rendered from the right one — a tripwire against widening the route glob or migrating the
 * page fetches onto the cache endpoint without revisiting these tests.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, banner, modal, strapiPayload } from '../support/strapi-payload-factory.js';
import {
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
  advanceBy,
  waitForTimerArmed,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const DELAY_SECONDS = 5;

const modalBox = (page) => page.locator('#interruptingMessageBox');
const bannerBox = (page) => page.locator('#bannerMessage');

const BANNER_TEXT = 'Synthetic banner on a static page';
const MODAL_TEXT = 'Synthetic modal on a static page';

const promotionsPayload = () =>
  strapiPayload({
    banners: [
      banner({ shared: { showDelay: DELAY_SECONDS }, locales: { en: { bannerText: BANNER_TEXT } } }),
    ],
    modals: [
      modal({ shared: { showDelay: DELAY_SECONDS }, locales: { en: { modalText: MODAL_TEXT } } }),
    ],
  });

async function open(page, context, path) {
  const strapi = await routeWithStrapiPayload(context, promotionsPayload());
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  await page.goto(path);
  await expectInterfaceLanguage(page, LANGUAGES.EN);
  await waitForTimerArmed(page, DELAY_SECONDS * 1000);
  await advanceBy(page, DELAY_SECONDS * 1000 + 1000);
  return strapi;
}

test.describe('Strapi promotions — headerOnly static pages get banners and modals', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  ['/testimonials', '/team'].forEach((path) =>
    test(`banner and modal both render on ${path}, and the banner adjusts the static layout`, async ({
      page,
      context,
    }) => {
      strapi = await open(page, context, path);

      await expect(bannerBox(page)).toBeVisible();
      await expect(bannerBox(page)).toContainText(BANNER_TEXT);
      await expect(modalBox(page)).toBeVisible();
      await expect(modalBox(page)).toContainText(MODAL_TEXT);

      // The headerOnly-specific branch: revealing the banner marks <body> so the static layout
      // makes room. This class is the only thing distinguishing this mode's banner behavior.
      await expect(page.locator('body')).toHaveClass(/hasBannerMessage/);
    }),
  );

  test('control: on a full reader page the layout class is NOT added', async ({ page, context }) => {
    // Same payload, same banner, but /texts renders the full ReaderApp (no headerOnly on #s2),
    // so the branch must not fire. Pins the branch's specificity in both directions.
    strapi = await open(page, context, '/texts');

    await expect(bannerBox(page)).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/hasBannerMessage/);
  });
});

test.describe('Strapi promotions — the /team page\'s own Strapi channel stays separate', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('promotions and team members each render from their own channel', async ({ page, context }) => {
    // Serve each channel its own synthetic response. The direct call ends in /graphql, which the
    // promotions glob (**/api/strapi/**) does not match — and the promotions endpoint ends in
    // /graphql-cache, which this glob does not match either. localizations[0] must be present:
    // the page's mapping reads it unconditionally (StaticPages.jsx loadTeamMembers).
    const directGraphqlRequests = [];
    await context.route('**/graphql', async (route) => {
      directGraphqlRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            teamMembers: [
              {
                documentId: 'synthetic-team-member-1',
                teamName: 'Synthetic Team Member',
                teamTitle: 'Synthetic Title',
                isTeamBoardMember: false,
                teamMemberImage: { url: 'https://example.org/headshot.png' },
                localizations: [{ locale: 'he', teamName: 'חבר צוות סינתטי', teamTitle: 'תפקיד' }],
              },
            ],
          },
        }),
      });
    });

    strapi = await open(page, context, '/team');

    // Both promotions render from the cache-endpoint payload...
    await expect(bannerBox(page)).toContainText(BANNER_TEXT);
    await expect(modalBox(page)).toContainText(MODAL_TEXT);

    // ...and the page's own content renders from the direct channel, with no CMS error shown.
    await expect(page.locator('.teamMember').first()).toBeVisible();
    await expect(page.locator('.teamMember').first()).toContainText('Synthetic Team Member');
    await expect(page.getByText("Sefaria's CMS cannot be reached")).toHaveCount(0);

    // The cross-wiring guards: each channel answered only its own consumer.
    expect(directGraphqlRequests.length).toBeGreaterThanOrEqual(1);
    directGraphqlRequests.forEach((url) => expect(url).not.toContain('/api/strapi/'));
    strapi.served.forEach((url) => expect(url).toContain('/api/strapi/'));
  });
});
