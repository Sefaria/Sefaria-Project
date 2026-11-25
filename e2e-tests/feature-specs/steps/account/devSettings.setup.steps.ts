// First-time setup, the confirmation email, signing in, Hebrew and phones
// (DS-SETUP-1..3, DS-EMAIL-3, DS-EMAIL-9, DS-NAV-1, DS-HE-1, DS-PHONE-1, DS-A11Y-3).
//
// Confirmation emails: the browser's POST /api/developer/confirmation is answered by a stand-in shaped
// like the server's answer (DeveloperSettingsSetupPage.mockConfirmation), so these stories send no email
// and don't use up the account's 5 a day. The one exception is DS-SETUP-3, which needs the account to
// really have a link out (the page reads that from the server): it sends one through the API unless a
// live link is already out.
import { Page, TestInfo } from '@playwright/test';
import { After, Given, When, Then, expect, Visitor } from '../fixtures';
import { addKey, addProject, asDeveloper, asNewDeveloper, notes, reloadHome } from './devSettings.common.steps';
import { DeveloperApi } from './developerApi';
import { MODULE_URLS } from '../../../constants';
import {
  DeveloperSettingsSetupPage,
  DAILY_LINK_LIMIT,
  ConfirmationMock,
} from '../../../pages/developerSettingsSetupPage';
import { LoginPage } from '../../../pages/loginPage';
import { t } from '../../../globals';

/** The setup page object for the current visitor (one per scenario, so it keeps its counters). */
async function setup(visitor: Visitor): Promise<DeveloperSettingsSetupPage> {
  const n = notes(visitor);
  if (!n.setupPage) n.setupPage = new DeveloperSettingsSetupPage(await visitor.page(), visitor.lang);
  return n.setupPage as DeveloperSettingsSetupPage;
}

const newDeveloperEmail = () => {
  const email = process.env.PLAYWRIGHT_DEV_NEW_USER_EMAIL;
  if (!email) throw new Error('PLAYWRIGHT_DEV_NEW_USER_EMAIL is not set');
  return email;
};

/**
 * Runs `fn` (taking a test account's lock, which waits while another scenario uses the account) without
 * the wait counting against this scenario's time.
 */
async function untimed<T>(testInfo: TestInfo, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    testInfo.setTimeout(testInfo.timeout + (Date.now() - start));
  }
}

/**
 * The "new developer" account with no link out, a stand-in for the confirmation endpoint, and
 * Developer Settings open on the welcome screen.
 */
async function freshNewDeveloper(
  visitor: Visitor,
  testInfo: TestInfo,
  mock: ConfirmationMock
): Promise<DeveloperSettingsSetupPage> {
  const d = await untimed(testInfo, () => asNewDeveloper(visitor));
  await d.api.cancelConfirmation();
  const ds = await setup(visitor);
  await ds.mockConfirmation(mock);
  await reloadHome(visitor);
  return ds;
}

// --- First-time setup ------------------------------------------------------------------------

Given('an email account with no developer profile', async ({ visitor, $testInfo }) => {
  await freshNewDeveloper(visitor, $testInfo, 'sent');
});

Then(
  /^it lists (\d+) steps, in order: (.+?)(?: \(([a-z0-9_.]+)\.\*\))?$/,
  async ({ visitor }, count: string, list: string, base?: string) => {
    const ds = await setup(visitor);
    const keys = list.split(',').map((s) => `${base ?? 'developer.welcome.steps'}.${s.trim()}`);
    expect(keys).toHaveLength(Number(count));
    await ds.expectWelcomeSteps(keys);
  }
);

Then(/^there is one "([^"]*)" button \[([^\]]+)\]$/, async ({ visitor }, _quoted: string, key: string) => {
  const ds = await setup(visitor);
  await ds.expectOneButton(await ds.str(key));
});

Then(/^it names the account's email address \[([^\]]+)\]$/, async ({ visitor }, key: string) => {
  const ds = await setup(visitor);
  await ds.expectText(await ds.str(key, { email: newDeveloperEmail() }));
});

Then(
  /^"([^"]*)" \[([^\]]+)\] is disabled, counting down from 60 seconds$/,
  async ({ visitor }, _quoted: string, key: string) => {
    const ds = await setup(visitor);
    await expect(ds.resendButton()).toBeVisible({ timeout: t(15000) });
    // The button's resting name is the key; while it waits it reads "Resend in {wait}s".
    expect(await ds.str(key)).toBeTruthy();
    await ds.expectResendWaiting(60);
    await ds.tick(1000);
    await ds.expectResendWaiting(59);
  }
);

Then('there is no way back to the previous step', async ({ visitor }) => {
  const ds = await setup(visitor);
  await ds.expectNoWayBack();
});

Given(
  "an email account that asked for a confirmation link less than 3 days ago and hasn't opened it",
  async ({ visitor, $testInfo }) => {
    await untimed($testInfo, () => asNewDeveloper(visitor));
    const ds = await setup(visitor);
    // A real link: the page reads it from the server. Uses one of the account's 5 sends a day on staging.
    const sent = await ds.ensureLiveConfirmationLink((ms) => $testInfo.setTimeout($testInfo.timeout + ms));
    notes(visitor).realLinkSent = sent;
    if (sent) $testInfo.annotations.push({ type: 'email', description: 'Sent one real confirmation link' });
  }
);

When(/^the visitor opens Developer Settings and clicks "Get started"$/, async ({ visitor }) => {
  await reloadHome(visitor);
  const ds = await setup(visitor);
  await ds.clickGetStarted();
});

// --- The confirmation email ------------------------------------------------------------------

Given('the visitor just sent a confirmation link', async ({ visitor, $testInfo }) => {
  const ds = await freshNewDeveloper(visitor, $testInfo, 'sent');
  await ds.clickGetStarted();
  await ds.clickSend();
  await ds.expectStepTitle(await ds.str('developer.common.check_email.header'));
});

Then(
  /^"([^"]*)" stays disabled for 60 seconds, showing \[([^\]]+)\]$/,
  async ({ visitor }, _quoted: string, key: string) => {
    const ds = await setup(visitor);
    expect(key).toBe('developer.common.resend_wait.button');
    for (let wait = 60; wait >= 1; wait--) {
      await ds.expectResendWaiting(wait);
      await ds.tick(1000);
    }
  }
);

Then('after 60 seconds it can be clicked and sends a new link', async ({ visitor }) => {
  const ds = await setup(visitor);
  await ds.expectResendReady();
  const before = ds.confirmationPosts;
  await ds.resendButton().click();
  await expect.poll(() => ds.confirmationPosts, { timeout: t(10000) }).toBe(before + 1);
  // The new link starts a new minute.
  await ds.expectResendWaiting(60);
});

Given('the visitor has asked for the most links allowed today', async ({ visitor, $testInfo }) => {
  const ds = await freshNewDeveloper(visitor, $testInfo, 'daily-limit');
  await ds.clickGetStarted();
  await ds.expectStepTitle(await ds.str('developer.confirm_email.header'));
});

When('the visitor asks for another', async ({ visitor }) => {
  const ds = await setup(visitor);
  await ds.clickSend();
});

Then(/^\[([^\]]+)\] shows under the button, with the number filled in$/, async ({ visitor }, key: string) => {
  const ds = await setup(visitor);
  await ds.expectErrorUnder(ds.sendButton(), await ds.str(key, { count: DAILY_LINK_LIMIT }));
});

// --- Screen readers --------------------------------------------------------------------------

When('the visitor sends a confirmation link', async ({ visitor, $testInfo }) => {
  const ds = await freshNewDeveloper(visitor, $testInfo, 'sent');
  await ds.clickGetStarted();
  await ds.clickSend();
  await ds.expectStepTitle(await ds.str('developer.common.check_email.header'));
});

Then('screen readers hear one announcement that the link was sent', async ({ visitor }) => {
  const ds = await setup(visitor);
  const sent = await ds.str('developer.confirm_email.sent.body', { email: newDeveloperEmail() });
  await ds.tick(500); // the status line fills in 100ms after the send
  const announced = (await ds.liveRegionTexts()).filter((s) => s.includes(newDeveloperEmail()));
  expect(announced, 'live regions that mention the sent link').toEqual([sent]);
  // Said once: the live regions don't change while the countdown runs.
  const before = await ds.liveRegionTexts();
  await ds.tick(3000);
  expect(await ds.liveRegionTexts()).toEqual(before);
});

Then("the countdown is not in a live region, so it isn't read every second", async ({ visitor }) => {
  const ds = await setup(visitor);
  const countdown = ds.resendButton();
  await expect(countdown).toBeDisabled();
  expect(await ds.inLiveRegion(countdown), 'the resend countdown is inside a live region').toBe(false);
  const before = await ds.liveRegionTexts();
  const shown = await countdown.textContent();
  await ds.tick(2000);
  expect(await countdown.textContent(), 'the countdown moved').not.toBe(shown);
  expect(await ds.liveRegionTexts(), 'a live region changed while the countdown ran').toEqual(before);
});

// --- Signing in ------------------------------------------------------------------------------

Given('a logged-out visitor', async ({ visitor }) => {
  visitor.who = 'logged out';
});

When(/^the visitor opens (\/\S*)$/, async ({ visitor }, path: string) => {
  await visitor.goto(visitor.urlFor('Library', path));
});

Then(/^the login page shows "([^"]*)" \[([^\]]+)\]$/, async ({ visitor }, _quoted: string, key: string) => {
  const ds = await setup(visitor);
  await ds.expectLoginNotice(await ds.str(key));
});

When('the visitor logs in with email', async ({ visitor }) => {
  const page = await visitor.page();
  const email = process.env.PLAYWRIGHT_DEV_USER_EMAIL;
  const password = process.env.PLAYWRIGHT_DEV_USER_PASSWORD;
  if (!email || !password) throw new Error('PLAYWRIGHT_DEV_USER_EMAIL / _PASSWORD are not set');
  await new LoginPage(page, visitor.lang).loginAs({ email, password });
});

// Signing up needs a reCAPTCHA, which tests must not get past, so the new account is never created:
// this checks that the login page's sign-up path keeps Developer Settings as where a new account lands.
When('the visitor creates a new account with email', async ({ visitor, $testInfo }) => {
  const ds = await setup(visitor);
  await ds.openEmailSignupFromLogin();
  notes(visitor).signupDestination = ds.signupDestination();
  $testInfo.annotations.push({
    type: 'partial',
    description:
      'Sign-up is not submitted (reCAPTCHA); checks only that sign-up keeps /settings/developer as the destination',
  });
});

Then('the visitor lands in Developer Settings', async ({ visitor }) => {
  const ds = await setup(visitor);
  const n = notes(visitor);
  if ('signupDestination' in n) {
    expect(n.signupDestination, 'where the sign-up form sends the new account').toBe('/settings/developer');
    return;
  }
  await ds.expectInDeveloperSettings();
});

// --- Hebrew ----------------------------------------------------------------------------------
//
// DS-HE-1 names no account: the developer test account, in Hebrew, with a project that has two keys.
// Its Hebrew session is the same login with the interfaceLang=hebrew cookie (BROWSER_SETTINGS.heDevUser).
// Locally there is no Hebrew host (SANDBOX_URL_IL is unset, so MODULE_URLS.HE is unusable): the same
// host is used, the cookie making the interface Hebrew.

const HE_PROJECT = 'Verse a Day';
const HE_KEYS = ['Daily email', 'Weekly digest'];

async function hebrewDeveloper(visitor: Visitor, testInfo: TestInfo): Promise<DeveloperSettingsSetupPage> {
  const n = notes(visitor);
  if (!n.hebrewReady) {
    visitor.who = 'developer';
    let url = visitor.urlFor('Library', DeveloperSettingsSetupPage.PATH);
    if (new URL(url).hostname === 'undefined')
      url = new URL(DeveloperSettingsSetupPage.PATH, MODULE_URLS.EN.LIBRARY).toString();
    const page = await visitor.goto(url);
    await untimed(testInfo, () => asDeveloper(visitor));
    if (!(await page.locator('body.interface-hebrew').count())) {
      // A host not pinned to Hebrew (locally localhost; a PR sandbox) follows the account's saved interface
      // language over the cookie: choose Hebrew the way the site's language menu does. English is chosen
      // again after the scenario, while this scenario still holds the account.
      n.switchedToHebrew = true;
      await chooseInterfaceLanguage(page, 'hebrew');
    }
    await addProject(visitor, HE_PROJECT, { websiteUrl: 'example.com' });
    for (const key of HE_KEYS) await addKey(visitor, HE_PROJECT, key);
    n.hebrewReady = true;
  }
  await reloadHome(visitor);
  const ds = await setup(visitor);
  await ds.expectHome();
  return ds;
}

/**
 * Saves the account's interface language as the site's language menu does (/interface/<language>). Its
 * redirect is not followed: it may lead to the other language's host, which locally is a LAN address.
 */
async function chooseInterfaceLanguage(page: Page, language: 'hebrew' | 'english'): Promise<void> {
  const r = await page.request.get(new URL(`/interface/${language}?next=/`, page.url()).toString(), {
    maxRedirects: 0,
  });
  expect(r.status(), `choosing ${language}`).toBe(302);
}

// Registered after the shared steps' After (which releases the account), so it runs before it.
After(async ({ visitor }) => {
  if (!notes(visitor).switchedToHebrew) return;
  await chooseInterfaceLanguage(await visitor.page(), 'english');
});

async function openEditProject(ds: DeveloperSettingsSetupPage, projectName: string): Promise<void> {
  const project = ds.project(projectName);
  const direct = project.locator('[data-agent-action="edit-project"]:visible');
  if (await direct.count()) {
    await direct.first().click();
  } else {
    // Phones: in the project's ⋮ menu.
    const menu = await ds.str('developer.home.project_menu.open.aria', { project_name: projectName });
    await project.getByRole('button', { name: menu, exact: true }).click();
    const label = await ds.str('developer.home.project.edit_details.button');
    await project.getByText(label, { exact: true }).locator('visible=true').first().click();
  }
  await expect(ds.stepTitle()).toBeVisible({ timeout: t(15000) });
}

async function openDeleteProject(ds: DeveloperSettingsSetupPage, projectName: string): Promise<void> {
  await openEditProject(ds, projectName);
  await ds.button(await ds.str('developer.edit_project.delete.button')).click();
  await expect(ds.page.getByRole('alertdialog')).toBeVisible({ timeout: t(15000) });
}

/** Closes the open confirm window with its Cancel button (never its action). */
async function closeWindow(ds: DeveloperSettingsSetupPage): Promise<void> {
  const dialog = ds.page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: await ds.str('developer.common.cancel.button'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function openEditProfile(ds: DeveloperSettingsSetupPage): Promise<void> {
  await ds.root().locator('[data-agent-action="edit-profile"]').click();
  await expect(ds.stepTitle()).toBeVisible({ timeout: t(15000) });
}

Then(
  'every Developer Settings string shows its Hebrew value, with no raw key names on the page',
  async ({ visitor, $testInfo }) => {
    $testInfo.setTimeout($testInfo.timeout * 2);
    const ds = await hebrewDeveloper(visitor, $testInfo);
    await ds.expectHebrewStrings('the home page');
    await openDeleteProject(ds, HE_PROJECT);
    await ds.expectHebrewStrings('the delete-project window');
    await closeWindow(ds);
    await ds.expectHebrewStrings('Edit project details');
    await reloadHome(visitor);
    await openEditProfile(ds);
    await ds.expectHebrewStrings('Edit profile');
  }
);

Then('all text, including English project and key names, is right-aligned', async ({ visitor, $testInfo }) => {
  const ds = await hebrewDeveloper(visitor, $testInfo);
  await ds.expectRightAligned('the home page');
  await ds.expectTextAtRight(ds.project(HE_PROJECT).getByRole('heading', { name: HE_PROJECT }));
  for (const key of HE_KEYS) await ds.expectTextAtRight(ds.keyRow(HE_PROJECT, key).getByText(key, { exact: true }));
  await openDeleteProject(ds, HE_PROJECT);
  await ds.expectRightAligned('the delete-project window');
  await closeWindow(ds);
});

Then('back arrows point right', async ({ visitor, $testInfo }) => {
  const ds = await hebrewDeveloper(visitor, $testInfo);
  await openEditProject(ds, HE_PROJECT);
  await ds.expectBackArrowsPointRight();
});

Then('in lists of key names, the bullets sit on the right', async ({ visitor, $testInfo }) => {
  const ds = await hebrewDeveloper(visitor, $testInfo);
  await openDeleteProject(ds, HE_PROJECT);
  await ds.expectListBulletsRight();
  await closeWindow(ds);
});

Then(
  /^in the "Signed in as" box, the email reads left to right with one parenthesis on each side of it$/,
  async ({ visitor, $testInfo }) => {
    const ds = await hebrewDeveloper(visitor, $testInfo);
    await openEditProfile(ds);
    const email = process.env.PLAYWRIGHT_DEV_USER_EMAIL;
    if (!email) throw new Error('PLAYWRIGHT_DEV_USER_EMAIL is not set');
    await ds.expectSignedInEmail(email);
  }
);

// --- Phones ----------------------------------------------------------------------------------
//
// DS-PHONE-1 names no account: the developer test account with one project at its key limit, so
// "Add key" is unavailable and has a reason to show.

const PHONE_PROJECT = 'Verse a Day';

Given('a 375px-wide screen', async ({ visitor, $testInfo }) => {
  const d = await untimed($testInfo, () => asDeveloper(visitor));
  await d.page.setViewportSize({ width: 375, height: 812 });
  await addProject(visitor, PHONE_PROJECT, { websiteUrl: 'example.com' });
  const { maxKeysPerProject } = await d.api.state();
  const labels = Array.from({ length: maxKeysPerProject }, (_, i) => `Key ${i + 1}`);
  for (const label of labels) await addKey(visitor, PHONE_PROJECT, label);
  notes(visitor).phoneKeys = labels;
  await reloadHome(visitor);
  await (await setup(visitor)).expectHome();
});

Then('every tap target is at least 44 by 44 pixels, except links inside a sentence', async ({ visitor }) => {
  const ds = await setup(visitor);
  expect(await ds.smallTapTargets(), 'tap targets under 44x44 on the home page').toEqual([]);
  const first = (notes(visitor).phoneKeys as string[])[0];
  await ds.keyRow(PHONE_PROJECT, first).locator('[data-agent-action="delete-key"]').click();
  await expect(ds.page.getByRole('alertdialog')).toBeVisible({ timeout: t(15000) });
  expect(await ds.smallTapTargets('[role="alertdialog"]'), 'tap targets under 44x44 in the delete-key window').toEqual(
    []
  );
  await closeWindow(ds);
});

Then('each key is its own box, with Created above the Limit row', async ({ visitor }) => {
  const ds = await setup(visitor);
  await ds.expectKeyCards(PHONE_PROJECT, notes(visitor).phoneKeys as string[]);
});

Then(/^the header links move to a "Resources" list at the bottom \[([^\]]+)\]$/, async ({ visitor }, key: string) => {
  const ds = await setup(visitor);
  await ds.expectResourcesAtBottom(await ds.str(key));
});

Then("no tooltips open; a disabled button's reason shows as text under it", async ({ visitor }) => {
  const ds = await setup(visitor);
  const { maxKeysPerProject } = await new DeveloperApi(ds.page).state();
  const addKeyButton = ds.project(PHONE_PROJECT).locator('[data-agent-action="new-key"]');
  await ds.expectReasonUnder(
    addKeyButton,
    await ds.str('developer.home.key_limit_reached.tooltip', { max_keys: maxKeysPerProject })
  );
});

Then('confirm windows sit 16px from each edge, with full-width buttons stacked', async ({ visitor }) => {
  const ds = await setup(visitor);
  const first = (notes(visitor).phoneKeys as string[])[0];
  await ds.keyRow(PHONE_PROJECT, first).locator('[data-agent-action="delete-key"]').click();
  await ds.expectPhoneConfirmWindow();
  await closeWindow(ds);
  await openDeleteProject(ds, PHONE_PROJECT);
  await ds.expectPhoneConfirmWindow();
  await closeWindow(ds);
});
