// ASSERTION LAYER helpers shared by the step files (no step definitions here).
import { expect } from '@playwright/test';
import { LANGUAGES, t } from '../../globals';
import { Assistant, normalizeLabel } from '../support/assistant';
import { copy } from '../support/copy';
import { KEYS } from './_expected';
import { Visitor } from '../support/fixtures';

/** A question the visitor types; the fake server answers it. */
export const QUESTION = 'Who wrote the Mishneh Torah?';

export const near = (actual: number, expected: number, tolerance = 1) =>
  expect(Math.abs(actual - expected), `${actual} should be ${expected} ± ${tolerance}`).toBeLessThanOrEqual(tolerance);

/** The plain text of the fake server's answer. */
export const stubAnswerText = (visitor: Visitor) => visitor.chat.answerHtml.replace(/<[^>]+>/g, '').trim();

/** The Ask button shows the copy for `key` (in the visitor's language unless given). */
export async function expectAskLabel(la: Assistant, key: string, lang?: string) {
  await expect(la.askButton, 'the Ask button is shown').toBeVisible({ timeout: t(10000) });
  const value = normalizeLabel(copy(key, lang ?? la.language));
  await expect.poll(() => la.askText(), { timeout: t(5000), message: `the Ask button reads "${value}"` }).toBe(value);
}

/** Corners at least half the height (or 50%): a pill or circle. */
export async function expectFullyRounded(la: Assistant, target: Parameters<Assistant['styles']>[0]) {
  const box = await la.box(target);
  const s = await la.styles(target, ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius']);
  for (const [corner, value] of Object.entries(s)) {
    const radius = value.endsWith('%') ? (parseFloat(value) / 100) * box.height : parseFloat(value);
    expect(radius, `${corner} (${value}) rounds a ${box.height}px-tall element fully`).toBeGreaterThanOrEqual(Math.min(box.height, box.width) / 2 - 0.5);
  }
}

/**
 * An answer lands while the assistant is closed: if no question is waiting, the
 * visitor asks one first; then closes the assistant; then the fake server answers.
 * Motion on the Ask button is recorded from just before the answer lands.
 */
export async function answerArrivesWhileClosed(visitor: Visitor) {
  const chat = visitor.chat;
  const la = await visitor.la();
  if (chat.pending === 0) {
    chat.holdAnswers = true;
    await la.ask(QUESTION, chat);
  }
  await la.ensureClosed();
  await expect(la.askButton, 'the Ask button is shown').toBeVisible({ timeout: t(10000) });
  await la.startMotionRecorder(la.askButton, 'answer-ready');
  await la.startTextRecorder(la.askButton, 'answer-ready');
  await la.startAnnouncementRecorder();
  const expected = chat.answered + chat.pending;
  chat.releaseAnswers();
  await expect.poll(() => chat.answered, { timeout: t(10000) }).toBe(expected);
}

/**
 * Everything announced so far in this scenario, kept across page reloads: what was
 * saved before earlier reloads plus what the current page has recorded.
 */
export async function announcementsSoFar(visitor: Visitor): Promise<string[]> {
  const la = await visitor.la();
  return [...(visitor.notes.announcements ?? []), ...(await la.announcements())];
}

/** The answer-ready dot is shown on the Ask button. */
export async function expectDot(la: Assistant) {
  await expect(la.answerReadyDot, 'the answer-ready dot is shown').toBeVisible({ timeout: t(5000) });
}

/**
 * Bring up the login prompt: a logged-out visitor asks a question the server refuses
 * because the free answers are used up. The refusal comes from the fake server's
 * "needs login" knob, which throws SeamMissing until the real response is documented.
 * Motion inside the assistant is recorded from just before the question.
 */
export async function reachLoginPrompt(visitor: Visitor) {
  visitor.chat.refuseAsNeedingLogin();
  const la = await visitor.la();
  // Keep what has been announced so far: the reload below starts a new page.
  visitor.notes.announcements = await announcementsSoFar(visitor);
  if (visitor.who !== 'logged out') {
    // The prompt is for logged-out visitors. Dropping this browser's session cookie logs
    // this tab out without touching the account's server session (other tests keep theirs).
    await visitor.context.clearCookies({ name: 'sessionid' });
    visitor.who = 'logged out';
    await la.page.reload({ waitUntil: 'domcontentloaded' });
  }
  await la.ensureOpen();
  await la.startMotionRecorder(la.host, 'login-prompt');
  await la.ask(QUESTION, visitor.chat);
  await expect(la.loginPromptText(copy(KEYS.limitReached, visitor.lang)), 'the login prompt').toBeVisible({ timeout: t(10000) });
}

export const isHebrew = (visitor: Visitor) => visitor.lang === LANGUAGES.HE;
