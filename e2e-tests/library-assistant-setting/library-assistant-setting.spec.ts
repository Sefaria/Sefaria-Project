import { test, expect, BrowserContext } from '@playwright/test';
import {
  BASE_URL, PHASE, Account, accounts, cohorts, account, expected, authFile,
  suppressOverlays, expectAssistant, goToReader, goToAccountSettings,
  toggleShowsOn, setToggle, saveSettingsAndCapturePayload, assistantElement,
  registerViaApi,
} from './harness';

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

async function contextFor(browser: any, key: string): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: authFile(key) });
  await suppressOverlays(context);
  return context;
}

test.describe(`Library Assistant setting — ${PHASE}-migration`, () => {

  // LAS-001..006 — the cohort matrix. This is the whole card in one table: who has the
  // assistant, for every way a user can have arrived at their current state.
  for (const a of cohorts()) {
    test(`LAS-001 [${a.key}]: assistant is ${expected(a) ? 'on' : 'off'} — ${a.why}`, async ({ browser }) => {
      const context = await contextFor(browser, a.key);
      const page = await context.newPage();
      await goToReader(page);

      await expectAssistant(page, expected(a), `${a.key} (${PHASE}-migration)`);

      await context.close();
    });
  }

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

  // LAS-020..025 — the toggle is the opt-out. Every logged-in user must have it, and it
  // must show them the truth about their own account.
  for (const a of cohorts()) {
    test(`LAS-020 [${a.key}]: toggle is present and shows the effective value`, async ({ browser }) => {
      const context = await contextFor(browser, a.key);
      const page = await context.newPage();
      await goToAccountSettings(page);

      expect(await toggleShowsOn(page), `toggle should show ${expected(a) ? 'On' : 'Off'} for ${a.key}`)
        .toBe(expected(a));

      await context.close();
    });
  }

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
  async function promoIsRunning(page: any): Promise<boolean> {
    return page.evaluate(() => !!(window as any).DJANGO_VARS?.props?.show_join_chatbot_banner);
  }

  const promoBanner = (page: any) => page.locator('.siteWideBannerContent');

  test('LAS-060: a user who turned the assistant off is not asked to try it', async ({ browser }) => {
    // Nagging someone with "Try the Library Assistant" immediately after they opted out is
    // the one thing an opt-out switch must never do. Phase-invariant on purpose: the
    // correct answer is the same before and after the migration.
    const context = await contextFor(browser, 'explicit_off');
    const page = await context.newPage();
    await goToReader(page);
    test.skip(!(await promoIsRunning(page)),
      'promo is off in this environment — enable remote config feature.client.show_join_chatbot_banner');

    await expectAssistant(page, false, 'explicit_off has the assistant off');
    await expect(promoBanner(page), 'the promo must not be shown to a user who opted out')
      .toHaveCount(0);

    await context.close();
  });

  test('LAS-061: a user who has the assistant is not asked to try it', async ({ browser }) => {
    const on = cohorts().find(a => expected(a))!;
    const context = await contextFor(browser, on.key);
    const page = await context.newPage();
    await goToReader(page);
    test.skip(!(await promoIsRunning(page)),
      'promo is off in this environment — enable remote config feature.client.show_join_chatbot_banner');

    await expect(promoBanner(page), 'the promo must not be shown to a user who already has it')
      .toHaveCount(0);

    await context.close();
  });
});

test.describe(`Library Assistant acquisition paths — ${PHASE}-migration`, () => {

  test('LAS-050: a brand-new account has the assistant from its first page view', async ({ browser }) => {
    // Registration writes the key explicitly rather than relying on the fallback or on the
    // migration having run — which is what makes new accounts behave identically in every
    // phase. Goes through /api/register/ because the HTML form carries a reCAPTCHA.
    test.slow();
    const context = await browser.newContext();
    await suppressOverlays(context);
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `la-e2e-new-${stamp}@example.com`;
    const password = 'Sefaria!e2e!2026';
    await registerViaApi(page, email, password);

    const fresh = await browser.newContext();
    await suppressOverlays(fresh);
    const freshPage = await fresh.newPage();
    await freshPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await freshPage.locator('input[name="email"]').first().fill(email);
    await freshPage.locator('input[name="password"]').first().fill(password);
    await freshPage.locator('input[name="password"]').first().press('Enter');
    await freshPage.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 });
    await goToReader(freshPage);

    await expectAssistant(freshPage, true, 'registration writes the setting explicitly');

    await fresh.close();
    await context.close();
  });

  test('LAS-051: /enable-library-assistant turns it on and returns the user where they were', async ({ browser }) => {
    // The promo banner's logged-out CTA routes login/register through here. It has to work
    // for a user who is currently off, in every phase.
    test.slow();
    const context = await contextFor(browser, 'explicit_off');
    const page = await context.newPage();

    try {
      await goToReader(page);
      await expectAssistant(page, false, 'explicit_off starts off');

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
