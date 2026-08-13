/**
 * Playwright Tests: which banner/modal gets surfaced (synthetic payload)
 *
 * context.js hands ONE banner and ONE modal to the UI. Since the sc-45891 fix, selection runs
 * EVERY viewer gate (date window, locale, country, audience, dismissal — see
 * static/js/sefaria/strapiSelection.js), so a document the viewer cannot see is skipped in favor
 * of one they can. Among several eligible documents the most specific wins, tier by tier:
 * country-targeted > untargeted, restricted audience > everyone, locale-exclusive > bilingual,
 * shorter window > longer, then payload order. Display (Misc.jsx shouldShow) re-checks
 * eligibility and adds the page-dependent path guard, which deliberately does NOT participate in
 * selection.
 *
 * Recorded scenarios contain at most one banner and one modal in window, so selection is never
 * asked to choose there. Recording multi-item states would mean a separate publishing session per
 * permutation — cheap here, since the factory controls array order directly.
 *
 * ORDER IS THE VARIABLE AND EVERYTHING ELSE IS HELD CONSTANT in the first describe: identical
 * documents tie through every ranking tier, so payload order decides, and the reversal test is
 * its own mutation proof — same content, opposite outcome, so the assertion cannot be passing by
 * accident.
 *
 * A NOTE ON ORDER AND LOCALE that explains why the locale describes matter: groupByDocumentId
 * flattens all `en` rows before all `he` rows, so a Hebrew-only document always sorts after every
 * document with an English row no matter how the payload was ordered. Order was therefore never a
 * workaround for locale starvation — only gating during selection fixes it, and the tests here
 * assert both payload orders to hold that line.
 *
 * The weekly describes (modal, then banner) cover the editorial shape that motivated the fix: a
 * week-long Hebrew-only document sharing its window with short-lived English-only documents, one
 * per day. Both pin the clock at two different moments to prove the outcome does not depend on
 * which English document happens to be date-active.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import {
  SYNTHETIC_NOW,
  banner,
  modal,
  strapiPayload,
  targetCountries,
  daysFromNow,
} from '../support/strapi-payload-factory.js';
import {
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
  advanceBy,
  waitForTimerArmed,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const PAGE_PATH = '/texts';

/** Shared by every surface here, so one clock advance reveals whatever is eligible. */
const DELAY_SECONDS = 5;

const FIRST_MODAL = 'Synthetic modal listed first';
const SECOND_MODAL = 'Synthetic modal listed second';
const ENGLISH_BANNER = 'Synthetic English-only banner';
const HEBREW_BANNER = 'באנר סינתטי בעברית בלבד';

const modalBox = (page) => page.locator('#interruptingMessageBox');
const bannerBox = (page) => page.locator('#bannerMessage');

const withText = (text) => modal({ shared: { showDelay: DELAY_SECONDS }, locales: { en: { modalText: text } } });

/** Wait for a surface's timer to exist, then move past it. */
async function elapseShowDelay(page) {
  await waitForTimerArmed(page, DELAY_SECONDS * 1000);
  await advanceBy(page, DELAY_SECONDS * 1000 + 1000);
}

async function open(page, context, payload, { language = LANGUAGES.EN, pinnedNow = SYNTHETIC_NOW } = {}) {
  const strapi = await routeWithStrapiPayload(context, payload);
  await prepareStrapiPage(page, { pinnedNow });
  await useInterfaceLanguage(page, language);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, language);
  return strapi;
}

test.describe('Strapi selection — identical documents tie, so payload order decides', () => {
  // Two documents that agree on every ranking tier (untargeted, unrestricted audience, same
  // locales, same window) fall through the whole chain to the stable-order fallback.
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('surfaces the modal listed first and discards the second', async ({ page, context }) => {
    strapi = await open(page, context, strapiPayload({ modals: [withText(FIRST_MODAL), withText(SECOND_MODAL)] }));

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(FIRST_MODAL);
    await expect(modalBox(page)).not.toContainText(SECOND_MODAL);

    // Not merely "the second is not shown" — no second modal is rendered at all, so nothing is
    // stacked out of sight behind the first.
    await expect(modalBox(page)).toHaveCount(1);
  });

  test('reversing the order surfaces the other one, proving order breaks the tie', async ({ page, context }) => {
    // Identical documents, opposite order. If the assertion above were passing for any reason
    // other than position — the text, the identifiers, the order they were constructed in — this
    // test would contradict it.
    strapi = await open(page, context, strapiPayload({ modals: [withText(SECOND_MODAL), withText(FIRST_MODAL)] }));

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(SECOND_MODAL);
    await expect(modalBox(page)).not.toContainText(FIRST_MODAL);
  });

});

test.describe('Strapi selection — locale gating participates in selection', () => {
  // TWO SEPARATE DOCUMENTS, each published in a single locale — not one document with two locale
  // rows. The bilingual-document case works correctly and is covered by the recorded
  // `strapi-banner-bilingual.spec.js`; this is the other, equally ordinary editorial shape:
  // an English banner and a Hebrew banner authored independently, scheduled over the same window.
  //
  // Both carry the factory's default window (now-1d → now+1d), so both are date-active and the
  // date gate cannot account for anything below.

  const englishOnlyBanner = () =>
    banner({ shared: { showDelay: DELAY_SECONDS }, locales: { en: { bannerText: ENGLISH_BANNER } } });
  const hebrewOnlyBanner = () =>
    banner({ shared: { showDelay: DELAY_SECONDS }, locales: { he: { bannerText: HEBREW_BANNER } } });

  /**
   * Both payload orders, because ORDER WAS NEVER A WORKAROUND HERE: `groupByDocumentId` flattens
   * every `en` row before every `he` row, so an English-only document always sorts ahead of a
   * Hebrew-only one whatever order the payload arrives in. Before the fix that starved Hebrew
   * readers entirely — measured, all four combinations: the English reader was served in both
   * orders, the Hebrew reader in neither.
   *
   * Both orders are asserted so a regression to a partial fix cannot slip through — one that
   * merely respected payload order would keep the Hebrew-first case green while Hebrew readers
   * were still starved whenever the English document happened to be authored first.
   */
  const BANNER_ORDERS = [
    { label: 'the English banner listed first', banners: () => [englishOnlyBanner(), hebrewOnlyBanner()] },
    { label: 'the Hebrew banner listed first', banners: () => [hebrewOnlyBanner(), englishOnlyBanner()] },
  ];

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('an English reader is served the English banner when both are in window', async ({ page, context }) => {
    // The control that gives the Hebrew-reader tests their meaning: the payload is fine, both
    // documents are delivered and date-active, and rendering works.
    strapi = await open(page, context, strapiPayload({ banners: BANNER_ORDERS[0].banners() }));

    await elapseShowDelay(page);
    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(ENGLISH_BANNER);
  });

  test('the Hebrew-only banner renders for a Hebrew reader when no English banner shares the window', async ({
    page,
    context,
  }) => {
    // Second control: unchanged banner, unchanged reader, only the English document removed. So
    // a failure below cannot be blamed on the Hebrew banner being unrenderable.
    strapi = await open(page, context, strapiPayload({ banners: [hebrewOnlyBanner()] }), {
      language: LANGUAGES.HE,
    });

    await elapseShowDelay(page);
    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(HEBREW_BANNER);
  });

  /**
   * The sc-45891 fix, asserted: the locale gate runs during selection, so the English-only
   * banner is skipped for a Hebrew reader and the Hebrew banner written for exactly that reader
   * is chosen instead — in either payload order. Formerly a test.fail() known-gap marker.
   */
  BANNER_ORDERS.forEach(({ label, banners }) =>
    test(`serves a Hebrew reader their own banner, with ${label}`, async ({ page, context }) => {
      strapi = await open(page, context, strapiPayload({ banners: banners() }), { language: LANGUAGES.HE });

      await elapseShowDelay(page);

      await expect(bannerBox(page)).toBeVisible();
      await expect(bannerBox(page)).toContainText(HEBREW_BANNER);
    }),
  );
});

test.describe('Strapi selection — country targeting participates in selection', () => {
  // Viewer country comes from the `cf-ipcountry` header, not the timezone; see
  // strapi-modal-country-targeting.spec.js for why. Candidates are a UNION of IP, timezone and
  // navigator.language, and the config's America/New_York contributes 'us' to every set — so the
  // discriminating pair is include[IL] (which a GB viewer fails) and include[GB] (which it passes).
  // An include[US] target would match this viewer too and prove nothing.
  test.use({ extraHTTPHeaders: { 'cf-ipcountry': 'GB' } });

  const targetedAt = (code, text) =>
    modal({
      shared: { showDelay: DELAY_SECONDS, countriesToTarget: targetCountries('include', [code]) },
      locales: { en: { modalText: text } },
    });

  const ISRAEL_MODAL = 'Synthetic modal targeted at Israel';
  const BRITAIN_MODAL = 'Synthetic modal targeted at Britain';

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('the Britain-targeted modal renders when it is listed first', async ({ page, context }) => {
    // The control that gives the reversed-order test below its meaning: this exact modal, this
    // exact viewer, and the country logic all work. Only its POSITION changes between the two.
    strapi = await open(
      page,
      context,
      strapiPayload({ modals: [targetedAt('GB', BRITAIN_MODAL), targetedAt('IL', ISRAEL_MODAL)] }),
    );

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(BRITAIN_MODAL);
  });

  /**
   * The sc-45891 fix, asserted: two modals scheduled at the same time with disjoint country
   * targeting can now both be served, each to its own audience. The Israel-targeted modal fails
   * the country gate DURING SELECTION for this British viewer, so the modal written for them —
   * sitting second in the array — wins. Formerly a test.fail() known-gap marker.
   */
  test('serves the modal targeted at the viewer rather than the first one by array order', async ({
    page,
    context,
  }) => {
    strapi = await open(
      page,
      context,
      strapiPayload({ modals: [targetedAt('IL', ISRAEL_MODAL), targetedAt('GB', BRITAIN_MODAL)] }),
    );

    await elapseShowDelay(page);

    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(BRITAIN_MODAL);
  });
});

test.describe('Strapi selection — a week-long Hebrew modal is served alongside rotating daily English modals', () => {
  // The editorial shape that motivated the sc-45891 fix: one Hebrew-only modal published for a
  // week, sharing that window with several English-only modals, each published separately for one
  // day. The English modals do not have Hebrew localizations, and the Hebrew modal has no English
  // localization — independently-authored documents, not one bilingual one (see the banner
  // locale-gating describe above for that shape).
  //
  // groupByDocumentId flattens every `en` row before every `he` row regardless of payload order
  // (see the note on `strapiPayload` in strapi-payload-factory.js), so whichever English-only
  // modal is date-active on a given day always sorts ahead of the week-long Hebrew modal. The
  // locale gate running during selection is the only thing standing between a Hebrew reader and
  // an empty surface — exactly what this describe holds in place.
  //
  // Two pinned moments, not one: this isn't a fixed pair of documents, it's a different English
  // document rotating into the date-active slot each day. Asserting two days proves the Hebrew
  // reader's outcome does not depend on which English competitor is live.

  const HEBREW_MODAL = 'מודעה שבועית בעברית בלבד';
  const EN_MODAL_TODAY = 'Synthetic English modal for today';
  const EN_MODAL_TOMORROW = 'Synthetic English modal for tomorrow';

  // Live for the whole week (day -1 through day 6), Hebrew-only.
  const hebrewWeeklyModal = () =>
    modal({
      window: { start: daysFromNow(-1), end: daysFromNow(6) },
      shared: { showDelay: DELAY_SECONDS },
      locales: { he: { modalText: HEBREW_MODAL } },
    });

  // Live for one day each, English-only, centered on "today" (day 0) and "tomorrow" (day 1) —
  // non-overlapping, so exactly one is date-active at either pinned moment below.
  const englishDailyModal = (text, dayOffset) =>
    modal({
      window: { start: daysFromNow(dayOffset - 0.5), end: daysFromNow(dayOffset + 0.5) },
      shared: { showDelay: DELAY_SECONDS },
      locales: { en: { modalText: text } },
    });

  const weekPayload = () =>
    strapiPayload({
      modals: [
        englishDailyModal(EN_MODAL_TODAY, 0),
        englishDailyModal(EN_MODAL_TOMORROW, 1),
        hebrewWeeklyModal(),
      ],
    });

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('an English reader sees today\'s modal', async ({ page, context }) => {
    // The control for the known gap below: today's English modal, this same payload, renders
    // normally for the reader it was written for.
    strapi = await open(page, context, weekPayload(), { language: LANGUAGES.EN, pinnedNow: SYNTHETIC_NOW });

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(EN_MODAL_TODAY);
  });

  test('an English reader sees tomorrow\'s modal a day later', async ({ page, context }) => {
    // Second control, a day on: a DIFFERENT English document is now the date-active one, and it
    // renders too — proving the payload isn't special-cased to only one day's document.
    strapi = await open(page, context, weekPayload(), {
      language: LANGUAGES.EN,
      pinnedNow: daysFromNow(1),
    });

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(EN_MODAL_TOMORROW);
  });

  /**
   * The sc-45891 fix, asserted: the Hebrew modal is date-active the whole week, and although
   * today's English-only modal sorts ahead of it (en rows before he rows), the locale gate now
   * runs during selection and skips it for a Hebrew reader. Formerly a test.fail() known-gap
   * marker documenting that this reader was served nothing.
   */
  test('a Hebrew reader is served their weekly modal on day 0, past today\'s English competitor', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), { language: LANGUAGES.HE, pinnedNow: SYNTHETIC_NOW });

    await elapseShowDelay(page);

    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(HEBREW_MODAL);
  });

  /**
   * Same assertion one day later, when a DIFFERENT English document is the date-active
   * competitor — proving the Hebrew reader's outcome doesn't depend on which one it is.
   */
  test('a Hebrew reader is served their weekly modal on day 1, past a different English competitor', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), {
      language: LANGUAGES.HE,
      pinnedNow: daysFromNow(1),
    });

    await elapseShowDelay(page);

    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(HEBREW_MODAL);
  });
});

test.describe('Strapi selection — a week-long Hebrew banner is served alongside rotating daily English banners', () => {
  // Banner counterpart to the modal describe above — same editorial shape (one Hebrew-only
  // document live for a week, several English-only documents live for one day each inside that
  // window), same fix asserted (the locale gate runs during selection, so the English-only
  // banner that sorts first is skipped for a Hebrew reader).
  //
  // Kept as its own describe rather than folded into the modal one: `bannerBox`/`modalBox` are
  // different DOM anchors and selection runs per-surface, so a banner-only regression would not
  // be caught by asserting on modals alone.

  const HEBREW_BANNER_TEXT = 'באנר שבועי בעברית בלבד';
  const EN_BANNER_TODAY = 'Synthetic English banner for today';
  const EN_BANNER_TOMORROW = 'Synthetic English banner for tomorrow';

  // Live for the whole week (day -1 through day 6), Hebrew-only.
  const hebrewWeeklyBanner = () =>
    banner({
      window: { start: daysFromNow(-1), end: daysFromNow(6) },
      shared: { showDelay: DELAY_SECONDS },
      locales: { he: { bannerText: HEBREW_BANNER_TEXT } },
    });

  // Live for one day each, English-only, centered on "today" (day 0) and "tomorrow" (day 1) —
  // non-overlapping, so exactly one is date-active at either pinned moment below.
  const englishDailyBanner = (text, dayOffset) =>
    banner({
      window: { start: daysFromNow(dayOffset - 0.5), end: daysFromNow(dayOffset + 0.5) },
      shared: { showDelay: DELAY_SECONDS },
      locales: { en: { bannerText: text } },
    });

  const weekPayload = () =>
    strapiPayload({
      banners: [
        englishDailyBanner(EN_BANNER_TODAY, 0),
        englishDailyBanner(EN_BANNER_TOMORROW, 1),
        hebrewWeeklyBanner(),
      ],
    });

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('an English reader sees today\'s banner', async ({ page, context }) => {
    // The control for the known gap below: today's English banner, this same payload, renders
    // normally for the reader it was written for.
    strapi = await open(page, context, weekPayload(), { language: LANGUAGES.EN, pinnedNow: SYNTHETIC_NOW });

    await elapseShowDelay(page);
    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(EN_BANNER_TODAY);
  });

  test('an English reader sees tomorrow\'s banner a day later', async ({ page, context }) => {
    // Second control, a day on: a DIFFERENT English document is now the date-active one, and it
    // renders too — proving the payload isn't special-cased to only one day's document.
    strapi = await open(page, context, weekPayload(), {
      language: LANGUAGES.EN,
      pinnedNow: daysFromNow(1),
    });

    await elapseShowDelay(page);
    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(EN_BANNER_TOMORROW);
  });

  /**
   * The sc-45891 fix, asserted on the banner surface: locale gating during selection skips
   * today's English-only banner for a Hebrew reader, so their weekly banner shows. Formerly a
   * test.fail() known-gap marker documenting that this reader was served nothing.
   */
  test('a Hebrew reader is served their weekly banner on day 0, past today\'s English competitor', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), { language: LANGUAGES.HE, pinnedNow: SYNTHETIC_NOW });

    await elapseShowDelay(page);

    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(HEBREW_BANNER_TEXT);
  });

  /**
   * Same assertion one day later, when a DIFFERENT English document is the date-active
   * competitor — proving the Hebrew reader's outcome doesn't depend on which one it is.
   */
  test('a Hebrew reader is served their weekly banner on day 1, past a different English competitor', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), {
      language: LANGUAGES.HE,
      pinnedNow: daysFromNow(1),
    });

    await elapseShowDelay(page);

    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(HEBREW_BANNER_TEXT);
  });
});

test.describe('Strapi selection — among eligible documents, the shorter window outranks the longer', () => {
  // Both modals are eligible for this reader (English, untargeted, unrestricted), so this is
  // purely about the ranking: a one-day special is more deliberately scheduled than a week-long
  // campaign and should take over for its day. Both payload orders are asserted so the outcome
  // provably comes from the windows, not from position.

  const SHORT_MODAL = 'Synthetic one-day modal';
  const LONG_MODAL = 'Synthetic week-long modal';

  const shortWindowModal = () =>
    modal({
      window: { start: daysFromNow(-0.5), end: daysFromNow(0.5) },
      shared: { showDelay: DELAY_SECONDS },
      locales: { en: { modalText: SHORT_MODAL } },
    });
  const longWindowModal = () =>
    modal({
      window: { start: daysFromNow(-1), end: daysFromNow(6) },
      shared: { showDelay: DELAY_SECONDS },
      locales: { en: { modalText: LONG_MODAL } },
    });

  const MODAL_ORDERS = [
    { label: 'the week-long modal listed first', modals: () => [longWindowModal(), shortWindowModal()] },
    { label: 'the one-day modal listed first', modals: () => [shortWindowModal(), longWindowModal()] },
  ];

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  MODAL_ORDERS.forEach(({ label, modals }) =>
    test(`serves the one-day modal, with ${label}`, async ({ page, context }) => {
      strapi = await open(page, context, strapiPayload({ modals: modals() }));

      await elapseShowDelay(page);
      await expect(modalBox(page)).toBeVisible();
      await expect(modalBox(page)).toContainText(SHORT_MODAL);
      await expect(modalBox(page)).not.toContainText(LONG_MODAL);
    }),
  );
});

test.describe('Strapi selection — a dismissed document falls through to the runner-up', () => {
  // Dismissal is a selection gate: a document the viewer already closed is skipped, so the next
  // eligible one gets its turn on the next page load — instead of the dismissed winner shadowing
  // the surface into emptiness for as long as it stays live.
  //
  // Explicit internalModalNames (rather than the factory's index-derived ones) because the
  // localStorage keys seeded below must match them byte for byte.

  const DISMISSED_MODAL_NAME = 'synthetic-dismissed-first-choice';
  const RUNNER_UP_NAME = 'synthetic-runner-up';
  const DISMISSED_MODAL = 'Synthetic modal the reader already closed';
  const RUNNER_UP_MODAL = 'Synthetic runner-up modal';

  const twoModals = () =>
    strapiPayload({
      modals: [
        modal({
          shared: { showDelay: DELAY_SECONDS, internalModalName: DISMISSED_MODAL_NAME },
          locales: { en: { modalText: DISMISSED_MODAL } },
        }),
        modal({
          shared: { showDelay: DELAY_SECONDS, internalModalName: RUNNER_UP_NAME },
          locales: { en: { modalText: RUNNER_UP_MODAL } },
        }),
      ],
    });

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('shows the runner-up when the first choice was dismissed on an earlier visit', async ({ page, context }) => {
    // Seed the dismissal BEFORE the page loads — this is "an earlier visit" in localStorage form.
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'true'),
      `modal_${DISMISSED_MODAL_NAME}`,
    );
    strapi = await open(page, context, twoModals());

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(RUNNER_UP_MODAL);
    await expect(modalBox(page)).not.toContainText(DISMISSED_MODAL);
  });

  test('keeps dismissal keys of live documents and drops keys of vanished ones', async ({ page, context }) => {
    // The runner-up's dismissal must survive while it is live — otherwise it would re-nag the
    // reader on every load — while a key from a campaign no longer in the payload is stale and
    // should be cleaned up. The old cleanup kept only the winner's key, wiping the runner-up's.
    await page.addInitScript((keys) => keys.forEach((key) => localStorage.setItem(key, 'true')), [
      `modal_${RUNNER_UP_NAME}`,
      'modal_synthetic-vanished-campaign',
    ]);
    strapi = await open(page, context, twoModals());

    // The first choice is undismissed here, so it shows; the assertions are about localStorage.
    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(DISMISSED_MODAL);

    const keptKeys = await page.evaluate(() => [
      localStorage.getItem('modal_synthetic-runner-up'),
      localStorage.getItem('modal_synthetic-vanished-campaign'),
    ]);
    expect(keptKeys).toEqual(['true', null]);
  });
});
