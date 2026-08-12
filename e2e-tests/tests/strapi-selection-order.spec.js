/**
 * Playwright Tests: which banner/modal gets surfaced (synthetic payload)
 *
 * context.js picks ONE banner and ONE modal to hand to the UI:
 *
 *     let matchedModal = groupedModals.find(
 *       (modal) => currentDate >= new Date(modal.modalStartDate) && currentDate <= new Date(modal.modalEndDate),
 *     );                                                                        // context.js:229
 *
 * `.find()` — so the FIRST date-active document wins and every later one is discarded, whatever it
 * says. Only after that does Misc.jsx apply the locale, country, showTo and path gates, to the one
 * document already chosen, with NO fallback to the runner-up.
 *
 * Nothing covered this: every recorded scenario contains at most one banner and one modal in
 * window, so the selection was never asked to choose. Recording the multi-item states would mean a
 * separate publishing session per permutation — cheap here, since the factory controls array order
 * directly, which is what these tests turn on.
 *
 * ORDER IS THE VARIABLE AND EVERYTHING ELSE IS HELD CONSTANT. Each pair below differs only in the
 * order it is passed and in the text used to tell the two apart. That makes the reversal test its
 * own mutation proof: same content, opposite outcome, so the assertion cannot be passing by
 * accident.
 *
 * FIVE DESCRIBES, ONE DEFECT SHAPE. The first covers plain selection, where order genuinely
 * decides. The second and third mark KNOWN GAPS — locale and country gates run after a single
 * winner has already been chosen, so a reader the runner-up was written for gets nothing at all.
 * All are `test.fail`, and a fix is planned in a separate PR.
 *
 * The locale case is the sharper of the two, because ORDER IS NOT A WORKAROUND there:
 * groupByDocumentId flattens all `en` rows before all `he` rows, so a Hebrew-only document always
 * sorts after every document with an English row no matter how the payload was ordered.
 *
 * The fourth and fifth describes (modal, then banner) compound the locale case from a single
 * static competitor to the shape editors actually publish: a week-long Hebrew-only document
 * sharing its window with several short-lived English-only documents, each covering one day. Both
 * pin the clock at two different moments within that week to prove the failure isn't tied to one
 * English document — a different one rotates into the date-active slot each day, and the Hebrew
 * reader loses to whichever one it is, every time.
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

/** Move past the delay WITHOUT requiring a timer — for cases where nothing is expected to arm one. */
async function elapseWithoutRequiringTimer(page) {
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

test.describe('Strapi selection — only the first date-active document is surfaced', () => {
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

  test('reversing the order surfaces the other one, proving order alone decides', async ({ page, context }) => {
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

test.describe('Strapi selection — locale gating is applied after selection, not during it', () => {
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
   * Both payload orders, because ORDER IS NOT A WORKAROUND HERE — and that is what makes this
   * sharper than the country case below.
   *
   * `groupByDocumentId` flattens every `en` row before every `he` row, so an English-only document
   * always sorts ahead of a Hebrew-only one whatever order the payload arrives in. Measured, all
   * four combinations: the English reader is served in both orders, the Hebrew reader is served in
   * neither. A Hebrew-only banner therefore cannot reach Hebrew readers at all while any English
   * banner shares its window.
   *
   * Both orders are marked so the gap cannot close on a partial fix — one that merely respected
   * payload order would make the Hebrew-first case pass while Hebrew readers were still starved
   * whenever the English document happened to be authored first.
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
    // The control that gives the markers below their meaning: the payload is fine, both documents
    // are delivered and date-active, and rendering works. Only the Hebrew reader goes without.
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
    // the failures below cannot be blamed on the Hebrew banner being unrenderable.
    strapi = await open(page, context, strapiPayload({ banners: [hebrewOnlyBanner()] }), {
      language: LANGUAGES.HE,
    });

    await elapseShowDelay(page);
    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(HEBREW_BANNER);
  });

  /**
   * KNOWN GAP — same defect as the country case below, fix planned in a separate PR.
   *
   * `.find()` (context.js:245) chooses on the DATE WINDOW ALONE, so the English-only banner is
   * handed to every reader; `Banner.shouldShow()` then rejects it for a Hebrew reader on
   * `locales.includes('he')`, and the Hebrew banner written for exactly that reader is never
   * reconsidered. They see nothing.
   *
   * Asserted as the DESIRED behaviour and marked test.fail(), so Playwright fails the run the
   * moment it starts passing and these markers close themselves.
   */
  BANNER_ORDERS.forEach(({ label, banners }) =>
    test.fail(`serves a Hebrew reader their own banner, with ${label}`, async ({ page, context }) => {
      strapi = await open(page, context, strapiPayload({ banners: banners() }), { language: LANGUAGES.HE });

      // No timer is armed — shouldShow() rejects the selected banner before the useEffect schedules
      // one — so this must not wait for one, and the assertion carries a short timeout to keep the
      // expected failure fast.
      await elapseWithoutRequiringTimer(page);

      await expect(bannerBox(page)).toBeVisible({ timeout: 3000 });
      await expect(bannerBox(page)).toContainText(HEBREW_BANNER);
    }),
  );
});

test.describe('Strapi selection — country targeting is applied after selection, not during it', () => {
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
    // The control that gives the known-gap test below its meaning: this exact modal, this exact
    // viewer, and the country logic all work. Only its POSITION changes between the two tests.
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
   * KNOWN GAP — a fix is planned in a separate PR; this test is the executable bug report.
   *
   * Two modals scheduled at the same time with disjoint country targeting cannot both be served.
   * `.find()` (context.js:229) chooses on the DATE WINDOW ALONE, so the Israel-targeted modal wins
   * merely by being first; Misc.jsx then rejects it for this British viewer, and the modal written
   * for them — sitting second in the array — is never reconsidered. The reader sees nothing.
   *
   * Asserted as the DESIRED behaviour and marked test.fail(). Playwright reports it as an expected
   * failure today, and FAILS THE RUN the moment it starts passing, so the marker closes itself when
   * selection is taught to skip documents the viewer is not targeted by.
   *
   * The failure is "no modal at all", not "the wrong modal": expectStrapiServed proves the payload
   * was delivered, and the test above proves this modal renders for this viewer when listed first.
   */
  test.fail('serves the modal targeted at the viewer rather than the first one by array order', async ({
    page,
    context,
  }) => {
    strapi = await open(
      page,
      context,
      strapiPayload({ modals: [targetedAt('IL', ISRAEL_MODAL), targetedAt('GB', BRITAIN_MODAL)] }),
    );

    // No timer will be armed — shouldShow() rejects the selected modal before the useEffect
    // schedules one — so this must not wait for one, and the assertion below carries a short
    // timeout to keep the expected failure fast.
    await elapseWithoutRequiringTimer(page);

    await expect(modalBox(page)).toBeVisible({ timeout: 3000 });
    await expect(modalBox(page)).toContainText(BRITAIN_MODAL);
  });
});

test.describe('Strapi selection — a week-long Hebrew modal loses to a rotating daily English modal', () => {
  // The editorial shape that motivated this suite: one Hebrew-only modal published for a week,
  // sharing that window with several English-only modals, each published separately for one day.
  // The English modals do not have Hebrew localizations, and the Hebrew modal has no English
  // localization — two independently-authored documents, not one bilingual one (see the banner
  // locale-gating describe above for that shape).
  //
  // groupByDocumentId flattens every `en` row before every `he` row regardless of payload order
  // (see the note on `strapiPayload` in strapi-payload-factory.js), so whichever English-only
  // modal is date-active on a given day always sorts ahead of the week-long Hebrew modal. Stage
  // 1's `.find()` (context.js:229) picks it on the date gate alone; Stage 2 then rejects it for a
  // Hebrew reader, and the Hebrew modal — date-active the entire week — is never reconsidered.
  //
  // Two pinned moments, not one: the point is that this isn't a fixed pair of documents colliding
  // once, it's a different English document winning the collapse each day as it rotates into the
  // date-active slot. A fix that merely reordered these two specific documents would still leave
  // every other day of the week broken.

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
   * KNOWN GAP — same defect as the single-competitor locale case above, fix planned in the same PR.
   *
   * The Hebrew modal is date-active for the entire week, including today. But `.find()` never
   * reaches it: today's English-only modal sorts first (en rows before he rows) and is
   * date-active too, so it is the one selection commits to. Misc.jsx then rejects it for a Hebrew
   * reader on `locales.includes('he')`, and the Hebrew modal is never reconsidered. The reader
   * sees nothing, despite a modal written for them being live the whole time.
   */
  test.fail('a Hebrew reader is served nothing on day 0, though their modal is live all week', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), { language: LANGUAGES.HE, pinnedNow: SYNTHETIC_NOW });

    // No timer is armed — shouldShow() rejects the selected (English) modal before the useEffect
    // schedules one — so this must not wait for one, and the assertion carries a short timeout.
    await elapseWithoutRequiringTimer(page);

    await expect(modalBox(page)).toBeVisible({ timeout: 3000 });
    await expect(modalBox(page)).toContainText(HEBREW_MODAL);
  });

  /**
   * Same known gap, one day later, with a DIFFERENT English document winning the collapse.
   *
   * This is the point of pinning a second moment: the failure is not "these two specific
   * documents collide," it recurs fresh each day as a new English modal rotates into the
   * date-active slot, while the Hebrew reader's modal — unchanged, still live — never gets a turn.
   */
  test.fail('a Hebrew reader is served nothing on day 1 either, to a different English competitor', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), {
      language: LANGUAGES.HE,
      pinnedNow: daysFromNow(1),
    });

    await elapseWithoutRequiringTimer(page);

    await expect(modalBox(page)).toBeVisible({ timeout: 3000 });
    await expect(modalBox(page)).toContainText(HEBREW_MODAL);
  });
});

test.describe('Strapi selection — a week-long Hebrew banner loses to a rotating daily English banner', () => {
  // Banner counterpart to the modal describe above — same editorial shape (one Hebrew-only
  // document live for a week, several English-only documents live for one day each inside that
  // window), same defect (groupByDocumentId sorts every `en` row before every `he` row, so
  // whichever English-only banner is date-active on a given day always wins Stage 1's `.find()`
  // over the week-long Hebrew banner, which Stage 2 then never gets a chance to reconsider).
  //
  // Kept as its own describe rather than folded into the modal one: `bannerBox`/`modalBox` are
  // different DOM anchors and `.find()` (context.js) runs per-surface, so a banner-only bug (or a
  // banner-only fix) would not be caught by asserting on modals alone.

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
   * KNOWN GAP — same defect as the modal case above, fix planned in the same PR.
   *
   * The Hebrew banner is date-active for the entire week, including today. But `.find()` never
   * reaches it: today's English-only banner sorts first (en rows before he rows) and is
   * date-active too, so it is the one selection commits to. Misc.jsx then rejects it for a
   * Hebrew reader on `locales.includes('he')`, and the Hebrew banner is never reconsidered. The
   * reader sees nothing, despite a banner written for them being live the whole time.
   */
  test.fail('a Hebrew reader is served nothing on day 0, though their banner is live all week', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), { language: LANGUAGES.HE, pinnedNow: SYNTHETIC_NOW });

    // No timer is armed — shouldShow() rejects the selected (English) banner before the useEffect
    // schedules one — so this must not wait for one, and the assertion carries a short timeout.
    await elapseWithoutRequiringTimer(page);

    await expect(bannerBox(page)).toBeVisible({ timeout: 3000 });
    await expect(bannerBox(page)).toContainText(HEBREW_BANNER_TEXT);
  });

  /**
   * Same known gap, one day later, with a DIFFERENT English document winning the collapse.
   *
   * As with the modal case: the failure is not "these two specific documents collide," it recurs
   * fresh each day as a new English banner rotates into the date-active slot, while the Hebrew
   * reader's banner — unchanged, still live — never gets a turn.
   */
  test.fail('a Hebrew reader is served nothing on day 1 either, to a different English competitor', async ({
    page,
    context,
  }) => {
    strapi = await open(page, context, weekPayload(), {
      language: LANGUAGES.HE,
      pinnedNow: daysFromNow(1),
    });

    await elapseWithoutRequiringTimer(page);

    await expect(bannerBox(page)).toBeVisible({ timeout: 3000 });
    await expect(bannerBox(page)).toContainText(HEBREW_BANNER_TEXT);
  });
});
