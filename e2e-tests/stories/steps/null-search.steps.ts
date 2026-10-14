// Steps for features/assistant/null-search.feature (search with no results; general scope).
import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { LANGUAGES, t } from '../../globals';
import { SEARCHES, SearchTab, copySeen, normalizeLabel, openSearchTab, recordEmptyResultsCopy, searchFor } from '../support/assistant';
import { copy } from '../support/copy';
import { KEYS, nullSearchQuestion } from './_expected';
import { ChatStub } from '../support/chatStub';
import { Visitor } from '../support/fixtures';
import { expectAskLabel, stubAnswerText } from './_helpers';

const ASK_LABEL = KEYS.askLabel;
const SEARCH_LABEL = KEYS.searchLabel;
const wrapper = (query: string, lang: string = LANGUAGES.EN) => nullSearchQuestion(query, lang);
const asked = (visitor: Visitor, query: string, lang: string = LANGUAGES.EN) => visitor.chat.questions.filter(q => q.text === wrapper(query, lang));
const PACING = 1500; // ms to let a click that shouldn't send anything have its chance to

/** Search with no results, recording the Ask button's label and width before it. */
async function searchWithNoResults(visitor: Visitor, query: string, tab?: SearchTab) {
  const la = await visitor.la();
  if (await la.askButton.isVisible()) {
    visitor.notes.labelBefore = await la.askText();
    visitor.notes.widthBefore = (await la.box(la.askButton)).width;
    await la.startMotionRecorder(la.askButton, 'relabel');
  }
  // The recorder and baseline live in the page, so the search must not reload it
  // (phones search from the hamburger menu); a reload is noted for the width step.
  visitor.notes.searchHow = await searchFor(visitor, query, tab);
  await expect(la.noResults.first(), 'the empty-results message').toBeVisible({ timeout: t(15000) });
  visitor.notes.query = query;
  visitor.notes.tab = tab ?? 'sources';
}

When(/^the visitor searches for "([^"]*)" and opens the (sources|books|authors|topics) tab$/, async ({ visitor }, query: string, tab: SearchTab) => {
  await searchWithNoResults(visitor, query, tab);
});

When(/^the visitor searches for "([^"]*)" with no results$/, async ({ visitor }, query: string) => {
  await searchWithNoResults(visitor, query);
});

Then('no button is shown on the page itself', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.noResults.first()).toBeVisible();
  expect(await la.noResultsButtons(), 'buttons in the empty-results message').toEqual([]);
});

Then(/^the text is the key (search\.null\.[\w.]+)$/, async ({ visitor }, key: string) => {
  const la = await visitor.la();
  await expect(la.noResults.first().getByText(copy(key, visitor.lang), { exact: true })).toBeVisible();
});

Then('"Library Assistant" never breaks across two lines', async ({ visitor }) => {
  const la = await visitor.la();
  const phrase = copy(KEYS.headerPill, visitor.lang);
  expect(await la.linesOf(la.noResults.first(), phrase), `lines "${phrase}" is drawn on`).toBe(1);
});

Then(/^one button is shown, linking to (\/\w+)$/, async ({ visitor }, href: string) => {
  const la = await visitor.la();
  const buttons = await la.noResultsButtons();
  expect(buttons.length, `buttons: ${JSON.stringify(buttons)}`).toBe(1);
  expect(new URL(buttons[0].href ?? '', la.page.url()).pathname).toBe(href);
});

When('an empty search tab first appears', async ({ visitor }) => {
  // The wrong version for this visitor (assistant on) is today's assistant-off copy.
  visitor.notes.wrongCopy = [copy(KEYS.nullBody('sources'), visitor.lang), copy(KEYS.nullButton('sources'), visitor.lang)];
  await recordEmptyResultsCopy(visitor, visitor.notes.wrongCopy);
  await visitor.goto(visitor.libraryUrl(`/search?q=${encodeURIComponent(SEARCHES.noResults)}`));
  await expect((await visitor.la()).noResults.first()).toBeVisible({ timeout: t(15000) });
});

Then('the Browse button and the text never show in the wrong version, even for a moment', async ({ visitor }) => {
  // Assistant on (this visitor): today's assistant-off copy must never flash.
  const la = await visitor.la();
  expect(await copySeen(la.page), 'assistant-off copy seen at any moment (assistant on)').toEqual([]);
  await expect(la.noResults.first().getByText(copy(KEYS.nullBodyAssistant('sources'), visitor.lang), { exact: true })).toBeVisible();
  expect(await la.noResultsButtons()).toEqual([]);

  // The reverse: an assistant-off visitor must never see the assistant copy, in a browser of their own.
  const context = await visitor.context.browser()!.newContext({ viewport: la.page.viewportSize() ?? undefined });
  try {
    const off = new Visitor(context, new ChatStub(), visitor.hasTouch);
    off.who = 'assistant off';
    await recordEmptyResultsCopy(off, [copy(KEYS.nullBodyAssistant('sources'), off.lang)]);
    await off.goto(off.libraryUrl(`/search?q=${encodeURIComponent(SEARCHES.noResults)}`));
    const offLa = await off.la();
    await expect(offLa.noResults.first()).toBeVisible({ timeout: t(15000) });
    expect(await copySeen(offLa.page), 'assistant copy seen at any moment (assistant off)').toEqual([]);
    await expect(offLa.noResults.first().getByText(copy(KEYS.nullBody('sources'), off.lang), { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

Then(/^the Ask button reads "([^"]*)" \[([\w.]+)\], keeping its star$/, async ({ visitor }, _words: string, key: string) => {
  const la = await visitor.la();
  await expectAskLabel(la, key);
  expect(await la.star(la.askButton), 'the star').not.toBeNull();
});

Then(/^its width grows smoothly over 200ms \(no animation with reduced motion\)$/, async ({ visitor }) => {
  const la = await visitor.la();
  expect(visitor.notes.widthBefore, 'the Ask button was measured before the search').toBeGreaterThan(0);
  expect(visitor.notes.searchHow, 'the search happened in the page, so the growth could be watched').toBe('in-page');
  expect((await la.box(la.askButton)).width, 'the button grew').toBeGreaterThan(visitor.notes.widthBefore);
  const widthMotion = (await la.motion('relabel')).filter(a => a.inButton && a.duration > 10 && (a.name === 'width' || a.keyframes.some(k => k.width)));
  if (visitor.reducedMotion) {
    expect(widthMotion, 'width animations with reduced motion').toEqual([]);
  } else {
    expect(widthMotion.length, 'the width animated').toBeGreaterThan(0);
    for (const m of widthMotion) expect(Math.abs(m.duration - 200), `width animation lasts ${m.duration}ms`).toBeLessThanOrEqual(20);
  }
});

Given(/^the button reads "Search with Library Assistant" for "([^"]*)"$/, async ({ visitor }, query: string) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await searchWithNoResults(visitor, query);
  await expectAskLabel(la, SEARCH_LABEL);
  visitor.it = la.askButton;
  visitor.chat.holdAnswers = true; // so "starts working on it" can be seen
});

Then(/^it sends the question wrapper with "([^"]*)" filled in \(/, async ({ visitor }, query: string) => {
  await expect.poll(() => asked(visitor, query).length, { timeout: t(10000), message: `asked "${wrapper(query)}"` }).toBe(1);
});

Then("the open assistant starts working on it almost at once, showing that it's thinking", async ({ visitor }) => {
  const la = await visitor.la();
  const q = asked(visitor, visitor.notes.query)[0];
  expect(q, 'the question was sent').toBeTruthy();
  expect(q.receivedAt - visitor.notes.clickedAt, 'ms from click to question').toBeLessThanOrEqual(2000);
  await expect(la.panel).toBeVisible();
  await expect(la.thinking).toBeVisible({ timeout: t(3000) });
});

Given('a signed-in visitor with an earlier conversation open', async ({ visitor }) => {
  visitor.who = 'assistant on';
  const la = await visitor.la();
  const question = 'Earlier question: when are Shabbat candles lit?';
  await la.ask(question, visitor.chat);
  await expect(la.message(stubAnswerText(visitor)).last()).toBeVisible({ timeout: t(10000) });
  const sessionId = visitor.chat.questions[visitor.chat.questions.length - 1].sessionId!;
  // The server's title differs from the question, so a history row showing it must
  // have come from the server's history list, not from the browser's own memory.
  const title = 'Saved on the server: Shabbat candles';
  visitor.chat.renameChat(sessionId, title);
  visitor.notes.earlier = { title, sessionId };
});

When('the visitor clicks "Search with Library Assistant"', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  if (!visitor.notes.query) await searchWithNoResults(visitor, SEARCHES.noResults);
  visitor.notes.questionsBefore = visitor.chat.questions.length;
  visitor.notes.clickedAt = Date.now();
  await la.press(la.askButton);
});

Then('the question is asked in a new chat', async ({ visitor }) => {
  await expect.poll(() => asked(visitor, visitor.notes.query).length, { timeout: t(10000), message: 'the search question was sent' }).toBeGreaterThan(0);
  const q = asked(visitor, visitor.notes.query)[0];
  expect(q.sessionId, 'a new chat (session)').not.toBe(visitor.notes.earlier.sessionId);
});

Then('the earlier conversation is still in chat history', async ({ visitor }) => {
  const la = await visitor.la();
  const loadsBefore = visitor.chat.historyListLoads;
  await la.ensureOpen();
  await la.openHistory();
  await expect(la.historyRow(visitor.notes.earlier.title), 'the earlier chat, titled as the server lists it').toBeVisible({ timeout: t(10000) });
  expect(visitor.chat.historyListLoads, 'the history list was fetched from the server').toBeGreaterThan(loadsBefore);
});

Given(/^the visitor clicked "Search with Library Assistant" for "([^"]*)"$/, async ({ visitor }, query: string) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await searchWithNoResults(visitor, query);
  await la.press(la.askButton);
  await expect.poll(() => asked(visitor, query).length, { timeout: t(10000), message: `asked "${wrapper(query)}"` }).toBe(1);
});

When('the visitor closes the assistant and clicks the button again', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.panel).toBeVisible();
  await la.close();
  visitor.notes.questionsBefore = visitor.chat.questions.length;
  await la.press(la.askButton);
});

Then('the assistant reopens on the same chat and no second question is sent', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.panel).toBeVisible({ timeout: t(5000) });
  await la.page.waitForTimeout(t(PACING));
  expect(visitor.chat.questions.length, 'questions sent').toBe(visitor.notes.questionsBefore);
  await expect(la.message(wrapper(visitor.notes.query)).first(), 'the same chat').toBeVisible();
});

When('the visitor switches to another empty tab of the same search', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  const next: SearchTab = visitor.notes.tab === 'books' ? 'authors' : 'books';
  await la.startTextRecorder(la.askButton, 'tab-switch');
  await openSearchTab(visitor, next);
  await expect(la.noResults.first()).toBeVisible({ timeout: t(10000) });
  visitor.notes.tab = next;
});

Then('the button keeps its label without flickering back to "Ask"', async ({ visitor }) => {
  const la = await visitor.la();
  const searchLabel = normalizeLabel(copy(SEARCH_LABEL, visitor.lang));
  const askLabel = normalizeLabel(copy(ASK_LABEL, visitor.lang));
  const seen = await la.texts('tab-switch');
  expect(seen, 'labels shown while switching tabs').not.toContain(askLabel);
  expect(seen, 'labels shown while switching tabs').toEqual([searchLabel]);
});

Then('clicking it sends nothing new', async ({ visitor }) => {
  const la = await visitor.la();
  const before = visitor.chat.questions.length;
  await la.press(la.askButton);
  await expect(la.panel).toBeVisible({ timeout: t(5000) });
  await la.page.waitForTimeout(t(PACING));
  expect(visitor.chat.questions.length, 'questions sent').toBe(before);
});

When('the visitor searches for something else with no results and clicks it', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await searchWithNoResults(visitor, SEARCHES.otherNoResults);
  await la.press(la.askButton);
});

Then('the new search is asked once', async ({ visitor }) => {
  const la = await visitor.la();
  await expect.poll(() => asked(visitor, SEARCHES.otherNoResults).length, { timeout: t(10000), message: 'the new search was asked' }).toBeGreaterThan(0);
  await la.page.waitForTimeout(t(PACING));
  expect(asked(visitor, SEARCHES.otherNoResults).length).toBe(1);
});

When('the visitor moves to a tab with results, or leaves the search page', async ({ visitor }) => {
  const la = await visitor.la();
  const search = visitor.notes.search ?? SEARCHES.someTabsEmpty;
  await la.ensureClosed();
  const settle = async (before: string) => {
    await expect.poll(() => la.askText(), { timeout: t(3000) }).not.toBe(before).catch(() => { /* recorded as-is; the Then judges */ });
    return la.askText();
  };
  let before = await la.askText();
  await openSearchTab(visitor, search.resultsTab);
  await expect(la.noResults).toHaveCount(0, { timeout: t(10000) });
  visitor.notes.labelOnResultsTab = await settle(before);
  // Back to an empty tab, then off the search page altogether.
  await openSearchTab(visitor, search.emptyTab);
  await expect(la.noResults.first()).toBeVisible({ timeout: t(10000) });
  before = await la.askText();
  await visitor.goto(visitor.libraryUrl('/texts'));
  await la.ensureClosed();
  await expect(la.askButton).toBeVisible({ timeout: t(15000) });
  visitor.notes.labelAfterLeaving = await settle(before);
});

Then('the button reads "Ask" again', async ({ visitor }) => {
  const la = await visitor.la();
  const ask = normalizeLabel(copy(ASK_LABEL, visitor.lang));
  expect(visitor.notes.labelOnResultsTab, 'on a tab with results').toBe(ask);
  expect(visitor.notes.labelAfterLeaving, 'after leaving the search page').toBe(ask);
  await expectAskLabel(la, ASK_LABEL);
});

Then('the button shows the Hebrew value of [assistant.floating_button.search_label]', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed(); // the button only shows while the assistant is closed
  await expectAskLabel(la, SEARCH_LABEL, LANGUAGES.HE);
});

Then(/^clicking it sends the Hebrew question wrapper with "([^"]*)" filled in$/, async ({ visitor }, query: string) => {
  const expected = wrapper(query, LANGUAGES.HE); // CopyKeyMissing until the wrapper has a key
  const la = await visitor.la();
  await la.ensureClosed();
  await la.press(la.askButton);
  await expect.poll(() => visitor.chat.questions.filter(q => q.text === expected).length,
    { timeout: t(10000), message: `asked "${expected}"` }).toBe(1);
});
