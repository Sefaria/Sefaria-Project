// Steps for features/assistant/give-anonymous-users-a-way-to-remove-the-la.feature (sc-48380):
// hiding and showing the Library Assistant's floating Ask button. Copy is looked up by
// translation key, so the English in the spec names the copy without having to match it.
import { Browser, BrowserContext, Page } from '@playwright/test';
import { Before, Given, When, Then, expect, Visitor, useChatbotVersion } from '../fixtures';
import { AskButtonSettingPage } from '../../../pages/askButtonSettingPage';
import { LoginPage } from '../../../pages/loginPage';
import { ChatServerMock } from '../../../support/chatServerMock';
import { registerThrowawayUser } from '../../../support/throwaway-user';
import { goToPageWithLang, hideAllModalsAndPopups, installEntitySearchMock } from '../../../utils';
import { assistantString } from '../../../support/assistantStrings';
import { LANGUAGES, t } from '../../../globals';

// ---- Copy named in the spec, and its translation key ------------------------------------

const MENU_ITEMS: Record<string, string> = {
  'Hide Ask button': 'assistant.menu.hide_floating_button',
  'Show Ask button': 'assistant.menu.show_floating_button',
  Help: 'assistant.menu.help',
  'Disable in settings': 'assistant.menu.optout',
};

const DIALOG_SENTENCES: Record<string, string> = {
  'You can continue to open the Library Assistant from the main menu.': 'assistant.floating_button_modal.description',
  'To remove the Library Assistant from the main menu, sign up or log in.': 'assistant.floating_button_modal.main_menu_logged_out',
  'You can remove the Library Assistant from the main menu in settings.': 'assistant.floating_button_modal.main_menu_logged_in',
};

const DIALOG_LINKS: Record<string, string> = {
  'sign up': 'assistant.floating_button_modal.sign_up',
  'log in': 'assistant.floating_button_modal.log_in',
  settings: 'assistant.floating_button_modal.account_settings',
};

/** The names analytics records clicks under (the controls' accessible names). */
const CLICK_NAMES: Record<string, string> = {
  'Hide or show Ask button': 'assistant.menu.floating_button_aria',
  'Hide Ask button': 'assistant.floating_button_modal.toggle_hide_aria',
  'Show Ask button': 'assistant.floating_button_modal.toggle_show_aria',
};

function keyFor(table: Record<string, string>, words: string, what: string): string {
  const key = table[words];
  if (!key) throw new Error(`Unknown ${what} "${words}". Known: ${Object.keys(table).map((w) => `"${w}"`).join(', ')}`);
  return key;
}

/** Checks the spec's words name the copy they claim to (the dialog's title, the switch's label). */
function expectKnownCopy(words: string, key: string): void {
  if (words !== assistantString(key, LANGUAGES.EN)) {
    throw new Error(`The spec says "${words}" but ${key} is "${assistantString(key, LANGUAGES.EN)}"`);
  }
}

// ---- Set-up ---------------------------------------------------------------------------------

const SEARCH_WITH_NO_RESULTS = 'qqzzxxvvkk';
const LATE_ANSWER = 'An answer that arrived after the assistant was closed.';

// The assistant's chat server is faked, so scenarios need no AI backend and can control
// when an answer arrives. It must be in place before the first page loads.
Before({ tags: '@sc-48380' }, async ({ visitor }) => {
  visitor.notes.mock = await ChatServerMock.install(visitor.context);
});

const mockOf = (visitor: Visitor) => visitor.notes.mock as ChatServerMock;

async function setting(visitor: Visitor): Promise<AskButtonSettingPage> {
  return (await visitor.pm()).onAskButtonSetting();
}

/** An assistant page object for a page that isn't the visitor's current one. */
const settingOn = (page: Page, visitor: Visitor) => new AskButtonSettingPage(page, visitor.lang);

type Account = { email: string; password: string };

/** Make a fresh test account, without logging any of the visitor's browsers in. */
async function newAccount(visitor: Visitor): Promise<Account> {
  const scratch = await browserOf(visitor).newContext();
  await useChatbotVersion(scratch, visitor.urlFor('Library'));
  try {
    const page = await scratch.newPage();
    return await registerThrowawayUser(page, visitor.request, visitor.baseURL, { purpose: 'la-hide-ask-button' });
  } finally {
    await scratch.close();
  }
}

function browserOf(visitor: Visitor): Browser {
  const browser = visitor.context.browser();
  if (!browser) throw new Error('No browser to open a second browser context in');
  return browser;
}

/** Log `page` in through Sefaria's login page, coming back to `next`. */
async function logIn(page: Page, visitor: Visitor, account: Account, next = '/texts'): Promise<void> {
  const login = new URL(visitor.urlFor('Library', '/login'));
  login.searchParams.set('next', next);
  await page.goto(login.toString(), { waitUntil: 'domcontentloaded' });
  await logInHere(page, account);
}

/** Fill in the login form already on `page`. */
async function logInHere(page: Page, account: Account): Promise<void> {
  await hideAllModalsAndPopups(page);
  await new LoginPage(page, LANGUAGES.EN).loginAs(account);
  await page.locator('.profile-pic, .accountBox, img.profile-pic-image').first().waitFor({ state: 'visible', timeout: t(30000) });
  await hideAllModalsAndPopups(page);
}

/** A second browser: its own cookies and storage, nothing shared with the visitor's. */
async function openOtherBrowser(visitor: Visitor, account?: Account): Promise<Page> {
  const context: BrowserContext = await browserOf(visitor).newContext();
  await useChatbotVersion(context, visitor.urlFor('Library'));
  const page = await goToPageWithLang(context, visitor.urlFor('Library', '/texts'), visitor.lang);
  if (account) await logIn(page, visitor, account);
  return page;
}

// ---- Who the visitor is ----------------------------------------------------------------

Given('I am logged in to a new account', async ({ visitor }) => {
  const account = await newAccount(visitor);
  visitor.notes.account = account;
  visitor.who = 'logged in';
  await useChatbotVersion(visitor.context, visitor.urlFor('Library'));
  const page = await goToPageWithLang(visitor.context, visitor.urlFor('Library', '/texts'), visitor.lang);
  visitor.use(page);
  await logIn(page, visitor, account);
});

// ---- The Ask button --------------------------------------------------------------------

Given('the Ask button is {word}', async ({ visitor }, state: string) => {
  if (state !== 'shown' && state !== 'hidden') throw new Error(`The Ask button is "shown" or "hidden", not "${state}"`);
  const la = await setting(visitor);
  if (state === 'hidden') await la.setAskButton(false);
  else {
    await la.closeAssistantIfOpen();
    await la.expectAskButton(true);
  }
});

Then('I see no Ask button', async ({ visitor }) => {
  await (await setting(visitor)).expectAskButton(false);
});

Then('I see the Ask button', async ({ visitor }) => {
  await (await setting(visitor)).expectAskButton(true);
});

Then('I see the Ask button in the bottom corner', async ({ visitor }) => {
  await (await setting(visitor)).expectAskButtonInBottomCorner();
});

Then('the Ask button is now {word}', async ({ visitor }, state: string) => {
  await (await setting(visitor)).expectAskButton(state === 'shown');
});

// ---- Opening and closing the assistant ------------------------------------------------

When('I click the Library Assistant item in the site header', async ({ visitor }) => {
  await (await setting(visitor)).openFromHeader();
});

When('I choose Library Assistant from the hamburger menu', async ({ visitor }) => {
  await (await setting(visitor)).openFromHamburgerMenu();
});

When('I close the assistant', async ({ visitor }) => {
  await (await setting(visitor)).closeAssistant();
});

Then('the assistant is open', async ({ visitor }) => {
  await (await setting(visitor)).expectAssistantOpen();
});

Given('I have asked the assistant {string}', async ({ visitor }, question: string) => {
  const la = await setting(visitor);
  await la.openAssistant();
  await la.la.askQuestion(question);
  await la.la.expectConversationContains(question);
});

Then('the assistant is open, still showing {string}', async ({ visitor }, question: string) => {
  const la = await setting(visitor);
  await la.expectAssistantOpen();
  await la.la.expectConversationContains(question);
});

// ---- The More options menu -----------------------------------------------------------

When("I open the assistant's More options menu", async ({ visitor }) => {
  await (await setting(visitor)).openMoreOptions();
});

When('I choose the {string} item', async ({ visitor }, words: string) => {
  await (await setting(visitor)).chooseMenuItem(keyFor(MENU_ITEMS, words, 'menu item'));
});

Then('the menu has a {string} item with an {word} icon', async ({ visitor }, words: string, icon: string) => {
  if (icon !== 'eye' && icon !== 'eye-off') throw new Error(`The icon is "eye" or "eye-off", not "${icon}"`);
  await (await setting(visitor)).expectMenuItemWithIcon(keyFor(MENU_ITEMS, words, 'menu item'), icon);
});

Then('the {string} item comes right after the {string} item', async ({ visitor }, item: string, previous: string) => {
  await (await setting(visitor)).expectComesRightAfter(keyFor(MENU_ITEMS, item, 'menu item'), keyFor(MENU_ITEMS, previous, 'menu item'));
});

Then('the {string} item is the last item', async ({ visitor }, item: string) => {
  await (await setting(visitor)).expectLastItem(keyFor(MENU_ITEMS, item, 'menu item'));
});

Then('the menu closes', async ({ visitor }) => {
  await (await setting(visitor)).expectMenuClosed();
});

// ---- The "Hide or show Ask button" dialog ----------------------------------------------

Given('the {string} dialog is open', async ({ visitor }, title: string) => {
  expectKnownCopy(title, 'assistant.floating_button_modal.title');
  await (await setting(visitor)).openSettingDialog();
});

Then('the {string} dialog opens over the assistant', async ({ visitor }, title: string) => {
  expectKnownCopy(title, 'assistant.floating_button_modal.title');
  await (await setting(visitor)).expectSettingDialogOpen();
});

Then('the {string} dialog is still open', async ({ visitor }, title: string) => {
  expectKnownCopy(title, 'assistant.floating_button_modal.title');
  await (await setting(visitor)).expectSettingDialogOpen();
});

Then('the dialog closes', async ({ visitor }) => {
  await (await setting(visitor)).expectSettingDialogClosed();
});

Then('the dialog has a switch labelled {string} that is {word}', async ({ visitor }, label: string, state: string) => {
  expectKnownCopy(label, 'assistant.floating_button_modal.toggle');
  await (await setting(visitor)).expectSwitch(state === 'on');
});

Then('the dialog has a {string} button', async ({ visitor }, words: string) => {
  expectKnownCopy(words, 'assistant.floating_button_modal.done');
  await (await setting(visitor)).expectDoneButton();
});

When('I turn the switch {word}', async ({ visitor }, state: string) => {
  await (await setting(visitor)).setSwitch(state === 'on');
});

When('I press the switch', async ({ visitor }) => {
  await (await setting(visitor)).pressSwitch();
});

Then('the switch is {word}', async ({ visitor }, state: string) => {
  if (state !== 'on' && state !== 'off') throw new Error(`The switch is "on" or "off", not "${state}"`);
  await (await setting(visitor)).expectSwitch(state === 'on');
});

When('I press {string}', async ({ visitor }, words: string) => {
  expectKnownCopy(words, 'assistant.floating_button_modal.done');
  await (await setting(visitor)).pressDone();
});

Then('the control is a switch that says it is on', async ({ visitor }) => {
  await (await setting(visitor)).expectSwitch(true);
});

When('I move focus to the switch and press Space', async ({ visitor }) => {
  await (await setting(visitor)).toggleSwitchWithKeyboard();
});

Then('the switch is visible, filled in Sefaria blue, with its knob on the "on" side', async ({ visitor }) => {
  await (await setting(visitor)).expectSwitchLook(true);
});

Then('the switch is visible, gray, with its knob on the "off" side', async ({ visitor }) => {
  await (await setting(visitor)).expectSwitchLook(false);
});

Then('the dialog says {string}', async ({ visitor }, sentence: string) => {
  await (await setting(visitor)).expectDialogSays(keyFor(DIALOG_SENTENCES, sentence, 'dialog sentence'));
});

Then("the dialog's links are {string} then {string}", async ({ visitor }, first: string, second: string) => {
  await (await setting(visitor)).expectDialogLinks([keyFor(DIALOG_LINKS, first, 'link'), keyFor(DIALOG_LINKS, second, 'link')]);
});

Then("the dialog's only link is {string}", async ({ visitor }, link: string) => {
  await (await setting(visitor)).expectDialogLinks([keyFor(DIALOG_LINKS, link, 'link')]);
});

When('I click the {string} link in the dialog', async ({ visitor }, link: string) => {
  await (await setting(visitor)).clickDialogLink(keyFor(DIALOG_LINKS, link, 'link'));
});

// ---- Where the dialog's links go -------------------------------------------------------

async function expectAccountPage(visitor: Visitor, path: '/register' | '/login', back: string) {
  const page = await visitor.page();
  await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, '') === path, { timeout: t(15000) });
  const next = new URL(page.url()).searchParams.get('next') ?? '';
  expect(next, 'the page should be set to bring the visitor back').toContain(back);
}

Then("Sefaria's sign-up page opens, set to bring me back to {string}", async ({ visitor }, back: string) => {
  await expectAccountPage(visitor, '/register', back);
});

Then("Sefaria's login page opens, set to bring me back to {string}", async ({ visitor }, back: string) => {
  await expectAccountPage(visitor, '/login', back);
});

When('I log in there with a new account', async ({ visitor }) => {
  const account = await newAccount(visitor);
  visitor.notes.account = account;
  await logInHere(await visitor.page(), account);
});

Then('I am back on {string}', async ({ visitor }, path: string) => {
  const page = await visitor.page();
  await expect(page).toHaveURL((url) => url.pathname === path, { timeout: t(15000) });
});

Then('the account settings page opens with the Library Assistant setting in view', async ({ visitor }) => {
  const page = await visitor.page();
  await expect(page).toHaveURL(/\/settings\/account/, { timeout: t(15000) });
  await expect(page.locator('#libraryAssistantSetting')).toBeInViewport({ timeout: t(15000) });
});

// ---- Saved choice ------------------------------------------------------------------------

When('I reload the page', async ({ visitor }) => {
  const page = await visitor.page();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await hideAllModalsAndPopups(page);
});

When('I open Sefaria in a new tab', async ({ visitor }) => {
  visitor.use(await visitor.context.newPage());
  await visitor.goto(visitor.urlFor('Library', '/texts'));
});

When('I close Sefaria and come back later in the same browser', async ({ visitor }) => {
  const state = await visitor.context.storageState();
  for (const page of visitor.context.pages()) await page.close();
  const later = await browserOf(visitor).newContext({ storageState: state });
  visitor.use(await goToPageWithLang(later, visitor.urlFor('Library', '/texts'), visitor.lang));
});

When('I open Sefaria logged out in a different browser', async ({ visitor }) => {
  visitor.use(await openOtherBrowser(visitor));
});

When('I log in to a new account', async ({ visitor }) => {
  const account = await newAccount(visitor);
  visitor.notes.account = account;
  await logIn(await visitor.page(), visitor, account);
});

When('I log in to a new account and then log out', async ({ visitor }) => {
  const page = await visitor.page();
  await logIn(page, visitor, await newAccount(visitor));
  await logOut(page, visitor);
});

async function logOut(page: Page, visitor: Visitor): Promise<void> {
  await page.goto(visitor.urlFor('Library', '/logout'), { waitUntil: 'domcontentloaded' });
  await page.goto(visitor.urlFor('Library', '/texts'), { waitUntil: 'domcontentloaded' });
  await hideAllModalsAndPopups(page);
}

When('I log out', async ({ visitor }) => {
  await logOut(await visitor.page(), visitor);
});

When('I log back in', async ({ visitor }) => {
  await logIn(await visitor.page(), visitor, visitor.notes.account as Account);
});

When('I log in to the same account in a different browser', async ({ visitor }) => {
  visitor.use(await openOtherBrowser(visitor, visitor.notes.account as Account));
});

Given('I am logged in to the same account in a different browser', async ({ visitor }) => {
  visitor.notes.firstBrowser = await visitor.page();
  const other = await openOtherBrowser(visitor, visitor.notes.account as Account);
  visitor.notes.otherBrowser = other;
  await settingOn(other, visitor).expectAskButton(false);
});

When('I go back to the first browser and turn the Ask button back on', async ({ visitor }) => {
  const first = visitor.notes.firstBrowser as Page;
  visitor.use(first);
  await settingOn(first, visitor).setAskButton(true);
});

When('I go to the other browser and reload the page', async ({ visitor }) => {
  const other = visitor.notes.otherBrowser as Page;
  visitor.use(other);
  await other.reload({ waitUntil: 'domcontentloaded' });
  await hideAllModalsAndPopups(other);
});

Given('my account has the Ask button {word}', async ({ visitor }, state: string) => {
  const la = await setting(visitor);
  // Set from the assistant itself, which saves the choice to the account.
  await la.setAskButton(false);
  if (state === 'shown') await la.setAskButton(true);
});

Given('this browser last had the Ask button {word}', async ({ visitor }, state: string) => {
  // Only the browser's own copy changes: written straight into storage, as the assistant does.
  const page = await visitor.page();
  await page.evaluate((hidden) => localStorage.setItem('lc_chatbot:hide_launcher', JSON.stringify(hidden)), state === 'hidden');
});

// ---- Everything else stays as it was --------------------------------------------------

Then('the site header shows its usual Library Assistant item', async ({ visitor }) => {
  const la = await setting(visitor);
  await la.expectHeaderItem();
  await la.la.expectHeaderPillLook();
});

Then('the hamburger menu shows its usual Library Assistant item', async ({ visitor }) => {
  await (await setting(visitor)).expectHamburgerItem();
});

Then('the site header has no Library Assistant item', async ({ visitor }) => {
  await (await setting(visitor)).expectNoHeaderItem();
});

async function setLibraryAssistant(visitor: Visitor, on: boolean): Promise<void> {
  await visitor.goto(visitor.urlFor('Library', '/settings/account'));
  const settings = (await visitor.pm()).onAccountSettingsPage();
  await settings.selectLibraryAssistant(on);
  await settings.saveSettings();
}

Given('I have turned the Library Assistant off in my account settings', async ({ visitor }) => {
  await setLibraryAssistant(visitor, false);
});

When('I turn the Library Assistant back on in my account settings', async ({ visitor }) => {
  await setLibraryAssistant(visitor, true);
});

When('I search for something with no results', async ({ visitor }) => {
  await installEntitySearchMock(visitor.context, { topic: [], author: [], book: [] });
  const search = (await visitor.pm()).onSearchPage();
  await search.submitHeaderSearch(SEARCH_WITH_NO_RESULTS);
  await search.waitForNullState();
});

Then('I see no {string} button', async ({ visitor }, words: string) => {
  expectKnownCopy(words, 'assistant.floating_button.search_label');
  const page = await visitor.page();
  const label = assistantString('assistant.floating_button.search_label', visitor.lang);
  await expect(page.getByRole('button').filter({ hasText: label })).toHaveCount(0);
});

When('I click {string} in the no-results text', async ({ visitor }, _words: string) => {
  await (await visitor.pm()).onSearchPage().clickNullStateAssistantLink();
});

Then('the assistant asks about that search', async ({ visitor }) => {
  const la = await setting(visitor);
  await la.expectAssistantOpen();
  await mockOf(visitor).waitForQuestion();
  await la.la.expectConversationContains(SEARCH_WITH_NO_RESULTS);
});

Given('I asked a question and closed the assistant before the answer came', async ({ visitor }) => {
  const mock = mockOf(visitor);
  mock.answerNextWith(LATE_ANSWER);
  mock.holdAnswers();
  const la = await setting(visitor);
  await la.openAssistant();
  await la.la.askQuestion('Where does the Talmud discuss Hanukkah lights?');
  await mock.waitForQuestion();
  await la.closeAssistant();
});

When('the answer arrives', async ({ visitor }) => {
  mockOf(visitor).releaseAnswers();
});

Then('no badge is shown in the bottom corner', async ({ visitor }) => {
  const la = await setting(visitor);
  await la.expectAskButton(false);
  await la.la.expectNoAnswerReadyDot();
});

Then('the assistant shows the answer', async ({ visitor }) => {
  await (await setting(visitor)).la.expectConversationContains(LATE_ANSWER);
});

// ---- Hebrew ----------------------------------------------------------------------------

Then('the menu item reads in Hebrew', async ({ visitor }) => {
  await (await setting(visitor)).expectReadsInHebrew('menu item');
});

Then('every label in the dialog reads in Hebrew', async ({ visitor }) => {
  await (await setting(visitor)).expectReadsInHebrew('dialog');
});

Then("the dialog's text is right-aligned and reads right to left", async ({ visitor }) => {
  await (await setting(visitor)).expectDialogRightToLeft();
});

Then('the switch\'s knob is on the left, its "on" side in Hebrew', async ({ visitor }) => {
  await (await setting(visitor)).expectSwitchLook(true);
});

Then('the "sign up" link comes before the "log in" link, reading right to left', async ({ visitor }) => {
  await (await setting(visitor)).expectSignUpReadFirst();
});

// ---- Analytics ---------------------------------------------------------------------------

Then('the {string} item is named {string} for analytics', async ({ visitor }, item: string, name: string) => {
  await (await setting(visitor)).expectMenuItemNamed(keyFor(MENU_ITEMS, item, 'menu item'), keyFor(CLICK_NAMES, name, 'click name'));
});

Then('the switch is named {string} for analytics', async ({ visitor }, name: string) => {
  await (await setting(visitor)).expectSwitchNamed(keyFor(CLICK_NAMES, name, 'click name'));
});

Then('analytics records a click named {string}', async ({ visitor }, name: string) => {
  await (await setting(visitor)).expectClickRecorded(keyFor(CLICK_NAMES, name, 'click name'));
});

// ---- Phones ------------------------------------------------------------------------------

Then('the whole dialog is visible without scrolling sideways', async ({ visitor }) => {
  await (await setting(visitor)).expectDialogFitsPhone();
});

Then('the switch and the {string} button are each at least {int}px tall', async ({ visitor }, words: string, px: number) => {
  expectKnownCopy(words, 'assistant.floating_button_modal.done');
  await (await setting(visitor)).expectTapTargets(px);
});
