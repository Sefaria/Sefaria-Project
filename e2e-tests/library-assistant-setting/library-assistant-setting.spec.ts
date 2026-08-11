import { test, expect, Browser, BrowserContext } from '@playwright/test';
import {
  BASE_URL, cohorts, authFile,
  suppressOverlays, expectAssistant, goToReader, goToAccountSettings,
  toggleShowsOn, setToggle, saveSettingsAndCapturePayload, assistantElement,
} from './harness';

/**
 * The Library Assistant's opt-out switch, end to end.
 *
 * Everything here is written against the product rule — "the assistant is on unless this
 * user turned it off" — never against the mechanism that currently implements it. The
 * assistant is a per-user setting: a profile carries `settings.library_assistant`, and
 * that value is the whole answer.
 *
 * Test IDs: LAS-NNN.
 */

async function contextFor(browser: Browser, key: string): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: authFile(key) });
  await suppressOverlays(context);
  return context;
}

test.describe('Library Assistant setting', () => {

  // The cohort matrix, numbered from LAS-001 in manifest order — one id per cohort, so a
  // single case can be selected with `-g 'LAS-002'`. This is the whole card in one table:
  // who has the assistant, for every state a user's setting can be in.
  cohorts().forEach((a, i) => {
    const id = `LAS-${String(1 + i).padStart(3, '0')}`;
    test(`${id} [${a.key}]: assistant is ${a.expected ? 'on' : 'off'} — ${a.why}`, async ({ browser }) => {
      const context = await contextFor(browser, a.key);
      const page = await context.newPage();
      await goToReader(page);

      await expectAssistant(page, a.expected, a.key);

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
    const on = cohorts().find(a => a.expected)!;
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

test.describe('Library Assistant settings page', () => {

  // The toggle is the opt-out. Every logged-in user must have it, and it must show them the
  // truth about their own account. Numbered from LAS-020 in manifest order, one id per
  // cohort, so a single case can be selected with `-g 'LAS-021'`.
  cohorts().forEach((a, i) => {
    const id = `LAS-${String(20 + i).padStart(3, '0')}`;
    test(`${id} [${a.key}]: toggle is present and shows the effective value`, async ({ browser }) => {
      const context = await contextFor(browser, a.key);
      const page = await context.newPage();
      await goToAccountSettings(page);

      expect(await toggleShowsOn(page), `toggle should show ${a.expected ? 'On' : 'Off'} for ${a.key}`)
        .toBe(a.expected);

      await context.close();
    });
  });

  // LAS-030 and LAS-031 assert on the *posted request body*, which is the only place the
  // page's decision about what to send can be observed: it lives in jQuery in
  // `templates/account_settings.html` and no Python test can see it. Both fulfil the POST
  // rather than letting it through, so neither writes to the account it drives.
  test('LAS-030: saving unrelated settings does not write the assistant key', async ({ browser }) => {
    // A page that posted the toggle unconditionally would stamp the assistant setting onto
    // every user who ever changed an unrelated preference — overwriting, with whatever the
    // page happened to render, a value that may have been changed elsewhere since.
    const context = await contextFor(browser, 'toggler');
    const page = await context.newPage();
    await goToAccountSettings(page);

    const payload = await saveSettingsAndCapturePayload(page, { persist: false });

    expect(payload.settings).not.toHaveProperty('library_assistant');

    await context.close();
  });

  test('LAS-031: changing the toggle does post the assistant key', async ({ browser }) => {
    const context = await contextFor(browser, 'toggler');
    const page = await context.newPage();
    await goToAccountSettings(page);
    await setToggle(page, !(await toggleShowsOn(page)));

    const payload = await saveSettingsAndCapturePayload(page, { persist: false });

    expect(payload.settings).toHaveProperty('library_assistant');

    await context.close();
  });

  // LAS-040 — the round trip that is the entire point of the card: a user can turn the
  // assistant off, and it stays off. Uses the `toggler` account, which no read-only
  // assertion depends on, and restores it at the end (see e2e-tests/CLAUDE.md §2.21).
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
      // poison the next run's starting state.
      await goToAccountSettings(page);
      if (!(await toggleShowsOn(page))) {
        await setToggle(page, true);
        await saveSettingsAndCapturePayload(page);
      }
      await context.close();
    }
  });
});

// Registration is not driven from here. It writes `settings.library_assistant = True`
// outright, so the account it produces is the `explicit_on` cohort — already asserted by
// the matrix above — while creating a CRM contact and an account no cleanup can reap on
// whatever environment the suite is pointed at.
test.describe('Library Assistant acquisition paths', () => {

  test('LAS-051: /enable-library-assistant turns it on and returns the user where they were', async ({ browser }) => {
    // This is where the logged-out call to action routes login and registration, so it has
    // to work for a user who is currently off.
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
