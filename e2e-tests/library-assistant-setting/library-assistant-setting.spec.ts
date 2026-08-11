import { test, expect, Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import {
  BASE_URL, PHASE, cohorts, account, expected, authFile,
  suppressOverlays, expectAssistant, goToReader, goToAccountSettings,
  toggleShowsOn, setToggle, saveSettingsAndCapturePayload, assistantElement,
} from './harness';
import { t } from '../globals';

/**
 * The Library Assistant's opt-out switch, end to end.
 *
 * ONE suite, THREE phases. Everything here is written against the product rule — "the
 * assistant is on unless this user turned it off" — never against the mechanism that
 * currently implements it. That is what lets the identical file run against Phase 1
 * (setting shipped, migration not yet run), Phase 2 (migration run) and Phase 3 (legacy
 * fallback removed). The only phase-dependent input is `LA_PHASE=pre|post`, and it changes
 * the expectation for exactly one cohort — the user who never made a choice, who is off
 * before the migration and on after it. Phase 3 runs with `post`, unchanged from Phase 2:
 * once every profile carries the key, deleting the fallback is unobservable, and proving
 * that is the point of running the same suite again.
 *
 * Test IDs: LAS-NNN.
 */

async function contextFor(browser: Browser, key: string): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: authFile(key) });
  await suppressOverlays(context);
  return context;
}

test.describe(`Library Assistant setting — ${PHASE}-migration`, () => {

  // The cohort matrix, numbered from LAS-001 in manifest order — one id per cohort, so a
  // single case can be selected with `-g 'LAS-003'`. This is the whole card in one table:
  // who has the assistant, for every way a user can have arrived at their current state.
  cohorts().forEach((a, i) => {
    const id = `LAS-${String(1 + i).padStart(3, '0')}`;
    test(`${id} [${a.key}]: assistant is ${expected(a) ? 'on' : 'off'} — ${a.why}`, async ({ browser }) => {
      const context = await contextFor(browser, a.key);
      const page = await context.newPage();
      await goToReader(page);

      await expectAssistant(page, expected(a), `${a.key} (${PHASE}-migration)`);

      await context.close();
    });
  });

  test('LAS-010: a logged-out visitor never gets the assistant', async ({ browser }) => {
    const context = await browser.newContext();
    await suppressOverlays(context);
    const page = await context.newPage();
    await goToReader(page);

    await expectAssistant(page, false, 'anonymous visitors have no profile to read');

    await context.close();
  });

  test('LAS-011: the assistant does not load on a mobile viewport', async ({ browser }) => {
    const on = cohorts().find(a => expected(a))!;
    const context = await contextFor(browser, on.key);
    await context.close();
    const mobile = await browser.newContext({
      storageState: authFile(on.key),
      viewport: { width: 390, height: 844 },
    });
    await suppressOverlays(mobile);
    const page = await mobile.newPage();
    await goToReader(page);

    // Server-side the user is enabled; the client withholds the widget below the
    // breakpoint. Asserting both halves separately keeps this from passing for the
    // wrong reason if the server gate ever regresses.
    expect(await page.evaluate(() => !!(window as any).Sefaria?.chatbot_enabled)).toBe(true);
    await expect(assistantElement(page)).toHaveCount(0);

    await mobile.close();
  });
});

test.describe(`Library Assistant settings page — ${PHASE}-migration`, () => {

  // The toggle is the opt-out. Every logged-in user must have it, and it must show them the
  // truth about their own account. Numbered from LAS-020 in manifest order, one id per
  // cohort, so a single case can be selected with `-g 'LAS-022'`.
  cohorts().forEach((a, i) => {
    const id = `LAS-${String(20 + i).padStart(3, '0')}`;
    test(`${id} [${a.key}]: toggle is present and shows the effective value`, async ({ browser }) => {
      const context = await contextFor(browser, a.key);
      const page = await context.newPage();
      await goToAccountSettings(page);

      expect(await toggleShowsOn(page), `toggle should show ${expected(a) ? 'On' : 'Off'} for ${a.key}`)
        .toBe(expected(a));

      await context.close();
    });
  });

  test('LAS-030: saving unrelated settings does not write the assistant key', async ({ browser }) => {
    // The migration skips any profile that already carries the key. If the settings page
    // posted the toggle unconditionally, a user who merely changed their email preference
    // before launch day would be stamped with their *pre-migration* value and silently
    // excluded from the flip. The decision lives in jQuery in the template, so the posted
    // body is the only place it can be observed.
    const context = await contextFor(browser, 'never_chose');
    const page = await context.newPage();
    await goToAccountSettings(page);

    const payload = await saveSettingsAndCapturePayload(page, { persist: false });

    expect(payload.settings).not.toHaveProperty('library_assistant');

    await context.close();
  });

  test('LAS-031: changing the toggle does post the assistant key', async ({ browser }) => {
    const context = await contextFor(browser, 'never_chose');
    const page = await context.newPage();
    await goToAccountSettings(page);
    await setToggle(page, !(await toggleShowsOn(page)));

    const payload = await saveSettingsAndCapturePayload(page, { persist: false });

    expect(payload.settings).toHaveProperty('library_assistant');

    await context.close();
  });

  // LAS-040 — the round trip that is the entire point of the card: a user can turn the
  // assistant off, and it stays off. Uses the `toggler` account, which no other test
  // reads, and restores it at the end (see e2e-tests/CLAUDE.md §2.21).
  test('LAS-040: turning the assistant off removes it, and turning it back on restores it', async ({ browser }) => {
    test.slow();
    const context = await contextFor(browser, 'toggler');
    const page = await context.newPage();

    try {
      // Establish the starting state rather than assuming it. A previous failed run may
      // have left this account off, and that is this test's problem to absorb, not a
      // reason to report a false failure about the product.
      await goToAccountSettings(page);
      if (!(await toggleShowsOn(page))) {
        await setToggle(page, true);
        await saveSettingsAndCapturePayload(page);
      }
      await goToReader(page);
      await expectAssistant(page, true, 'toggler starts on');

      await goToAccountSettings(page);
      await setToggle(page, false);
      await saveSettingsAndCapturePayload(page);
      await goToReader(page);

      await expectAssistant(page, false, 'the user turned it off in account settings');
      await goToAccountSettings(page);
      expect(await toggleShowsOn(page), 'settings page must remember the opt-out').toBe(false);

      await setToggle(page, true);
      await saveSettingsAndCapturePayload(page);
      await goToReader(page);

      await expectAssistant(page, true, 'the user turned it back on');
    } finally {
      // Leave the account on however the test ended, so a failure mid-way doesn't
      // poison the next run's LAS-001 expectation for this cohort.
      await goToAccountSettings(page);
      if (!(await toggleShowsOn(page))) {
        await setToggle(page, true);
        await saveSettingsAndCapturePayload(page);
      }
      await context.close();
    }
  });
});

test.describe(`Library Assistant promo banner — ${PHASE}-migration`, () => {

  // The promo invites people to try the assistant. Whether it is running at all is a
  // server-side remote-config decision (`feature.client.show_join_chatbot_banner`) that a
  // browser test cannot set, so each test reads the flag out of the props the server sent
  // and says plainly when the environment has the promo switched off.
  // Read it from DJANGO_VARS rather than the `Sefaria` global: the flag is a React prop on
  // ReaderApp and `unpackBaseProps` never copies it onto `Sefaria`.
  async function promoIsRunning(page: Page): Promise<boolean> {
    return page.evaluate(() => !!(window as any).DJANGO_VARS?.props?.show_join_chatbot_banner);
  }

  const promoBanner = (page: Page) => page.locator('.siteWideBannerContent');

  // Presence is asserted on the assistant promo specifically — its icon distinguishes it
  // from any other site-wide banner that happens to be running. Absence is asserted on the
  // generic container instead, so a promo whose artwork changed still counts as shown.
  const assistantPromoBanner = (page: Page) =>
    page.locator('.siteWideBannerContent:has(img[src*="ai-double-star"])');

  const PROMO_OFF_MESSAGE =
    'The promo is switched off in this environment, so this test cannot observe anything. ' +
    'Turn on the remote config key `feature.client.show_join_chatbot_banner` and confirm it ' +
    'with GET /api/remote-config. The remote-config cache is process-local with no TTL, so ' +
    'every web pod must be restarted after the key changes before the promo appears. ' +
    'Set LA_REQUIRE_PROMO=1 to make this a failure instead of a skip.';

  /**
   * Skip loudly when the promo is not running, or fail outright under LA_REQUIRE_PROMO.
   *
   * The flag is a server-side remote-config value that a browser test cannot set, so an
   * environment with the promo off makes these two tests unobservable rather than failing.
   * The skip carries its reason in an annotation as well as the skip message, because the
   * default `list` reporter prints neither by itself — a run that quietly reports
   * "17 passed, 2 skipped" would hide the two tests standing between a user who opted out
   * and a banner asking them to opt back in. Set LA_REQUIRE_PROMO=1 when the promo
   * behaviour is the thing being verified and a skip would be a false pass.
   */
  async function requirePromoRunning(page: Page, testInfo: TestInfo) {
    if (await promoIsRunning(page)) return;
    if (process.env.LA_REQUIRE_PROMO === '1') {
      throw new Error(PROMO_OFF_MESSAGE);
    }
    console.warn(`\n[${testInfo.title}] SKIPPED: ${PROMO_OFF_MESSAGE}\n`);
    testInfo.annotations.push({ type: 'promo-skipped', description: PROMO_OFF_MESSAGE });
    test.skip(true, PROMO_OFF_MESSAGE);
  }

  test('LAS-060: a user who turned the assistant off is not asked to try it', async ({ browser }, testInfo) => {
    // Nagging someone with "Try the Library Assistant" immediately after they opted out is
    // the one thing an opt-out switch must never do. Phase-invariant on purpose: the
    // correct answer is the same before and after the migration.
    const context = await contextFor(browser, 'explicit_off');
    const page = await context.newPage();
    await goToReader(page);
    await requirePromoRunning(page, testInfo);

    await expectAssistant(page, false, 'explicit_off has the assistant off');
    await expect(promoBanner(page), 'the promo must not be shown to a user who opted out')
      .toHaveCount(0);

    await context.close();
  });

  test('LAS-061: the promo follows the never-chose user across the migration', async ({ browser }, testInfo) => {
    // Pinned to `never_chose` because that is the only cohort where the two suppression
    // rules can disagree: it has no whitelist row, so before the migration nothing marks it
    // as having chosen and the promo is exactly who it is for, while after the migration
    // the setting key alone must both switch the assistant on and retire the invitation.
    // Any cohort with a whitelist row is suppressed by both rules in both phases, which
    // would make this assertion true no matter what the product did.
    const context = await contextFor(browser, 'never_chose');
    const page = await context.newPage();
    await goToReader(page);
    await requirePromoRunning(page, testInfo);

    const hasAssistant = expected(account('never_chose'));
    await expectAssistant(page, hasAssistant, `never_chose (${PHASE}-migration)`);

    if (hasAssistant) {
      await expect(promoBanner(page), 'the promo must not be shown to a user who already has the assistant')
        .toHaveCount(0);
    } else {
      await expect(
        assistantPromoBanner(page),
        'a user who has never chosen and does not have the assistant is precisely who the promo is for',
      ).toBeVisible({ timeout: t(20000) });
    }

    await context.close();
  });
});

// Registration is not driven from here. It writes `settings.library_assistant = True`
// outright, so the account it produces is the `explicit_on` cohort — already asserted by
// the matrix above — while creating a CRM contact and an account no cleanup can reap on
// whatever environment the suite is pointed at.
test.describe(`Library Assistant acquisition paths — ${PHASE}-migration`, () => {

  test('LAS-051: /enable-library-assistant turns it on and returns the user where they were', async ({ browser }) => {
    // The promo banner's logged-out CTA routes login/register through here. It has to work
    // for a user who is currently off, in every phase.
    //
    // Uses the `enable_landing` scratch account rather than a matrix cohort: this test
    // switches the assistant on, and the read-only cohorts are asserted concurrently by
    // other tests under `fullyParallel`, so mutating one would make them flake.
    test.slow();
    const context = await contextFor(browser, 'enable_landing');
    const page = await context.newPage();

    try {
      await goToReader(page);
      await expectAssistant(page, false, 'enable_landing starts off');

      await page.goto(`${BASE_URL}/enable-library-assistant?next=%2FGenesis.1`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/Genesis\.1/);
      await goToReader(page);

      await expectAssistant(page, true, 'the enable landing turned it on');
    } finally {
      await goToAccountSettings(page);
      if (await toggleShowsOn(page)) {
        await setToggle(page, false);
        await saveSettingsAndCapturePayload(page);
      }
      await context.close();
    }
  });
});
