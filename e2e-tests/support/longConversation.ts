import { LibraryAssistantQ4Page } from '../pages/libraryAssistantQ4Page';
import { ChatServerMock } from './chatServerMock';

/**
 * A conversation long enough to scroll, for the Library Assistant stories about
 * where the chat is scrolled (LA-QA-6, LA-QA-7, LA-QA-8).
 *
 * Answers are HTML with the same classes real answers use (see the comment on
 * ANSWER_WITH_HEADING in e2e-tests/mobile web/library-assistant-phone.spec.ts).
 */

const FILLER =
  'The sages discuss this at length, comparing several readings of the verse and the ' +
  'rulings that follow from each one, before settling on the practice most communities keep today.';

/**
 * A long answer: `paragraphs` paragraphs, each starting "<label>, paragraph N:".
 * Ten of them are taller than the open assistant on a phone or a desktop window,
 * so the start of the answer and the end of the chat are in different places.
 */
export function longAnswer(label: string, paragraphs = 10): string {
  return Array.from({ length: paragraphs }, (_, i) =>
    `<p class="response-generic">${label}, paragraph ${i + 1}: ${FILLER}</p>`).join('');
}

/** The text a long answer's first line starts with — for "the chat shows the start of that answer". */
export function longAnswerStart(label: string): string {
  return `${label}, paragraph 1:`;
}

/**
 * Open the assistant and ask `turns` questions, waiting for each long answer.
 * Leaves the assistant open, scrolled wherever the widget put it.
 * Returns text from the last line of the latest message.
 */
export async function haveLongConversation(la: LibraryAssistantQ4Page, mock: ChatServerMock, turns = 3): Promise<string> {
  await la.openWithAskButton();
  let latest = '';
  for (let i = 1; i <= turns; i++) {
    const label = `Earlier answer ${i}`;
    mock.answerNextWith(longAnswer(label));
    await la.askQuestion(`Earlier question ${i}: where does the Talmud discuss Hanukkah lights?`);
    latest = `${label}, paragraph 10:`;
    await la.expectConversationContains(latest);
  }
  return latest;
}
