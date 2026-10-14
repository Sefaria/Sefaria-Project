// Steps for features/assistant/switching-chats.feature.
import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { t } from '../../globals';
import { TEST_IDS, rgb } from '../support/assistant';
import { Visitor } from '../support/fixtures';
import { near } from './_helpers';

type Chat = { id: string; title: string; first: string; last: string };

/** A saved chat of `turns` question/answer pairs with recognisable text. */
function savedChat(visitor: Visitor, name: string, turns: number, ageMinutes: number): Chat {
  const messages = [];
  for (let i = 1; i <= turns; i++) {
    messages.push({ role: 'user' as const, content: `${name} question ${i}` });
    messages.push({ role: 'assistant' as const, content: `<p class="response-generic">${name} answer ${i}. ${'This answer is long enough to take a few lines in the panel. '.repeat(3)}</p>` });
  }
  const title = `${name}: saved conversation`;
  const id = visitor.chat.addSavedChat(title, messages, ageMinutes);
  return { id, title, first: `${name} question 1`, last: `${name} answer ${turns}.` };
}

const chats = (visitor: Visitor): Record<'A' | 'B' | 'C', Chat> => visitor.notes.chats;

async function pick(visitor: Visitor, chat: Chat) {
  const la = await visitor.la();
  await la.ensureOpen();
  await la.openHistory();
  await la.press(la.historyRow(chat.title));
}

Given('the visitor is signed in and has 3 saved chats', async ({ visitor }) => {
  visitor.who = 'assistant on';
  visitor.notes.chats = {
    A: savedChat(visitor, 'Chat A', 2, 30),
    B: savedChat(visitor, 'Chat B', 8, 60),   // long: it has to scroll to its end
    C: savedChat(visitor, 'Chat C', 1, 90),
  };
});

Given('chat A is open', async ({ visitor }) => {
  const la = await visitor.la();
  await pick(visitor, chats(visitor).A);
  await expect(la.message(chats(visitor).A.last)).toBeVisible({ timeout: t(10000) });
});

Given('chat B has not been opened during this visit', async ({ visitor }) => {
  expect(visitor.chat.chatLoads).not.toContain(chats(visitor).B.id);
  visitor.chat.holdChat(chats(visitor).B.id); // B arrives when the story says so
});

Given('chat B was opened earlier during this visit', async ({ visitor }) => {
  const la = await visitor.la();
  const { A, B } = chats(visitor);
  await pick(visitor, B);
  await expect(la.message(B.last)).toBeVisible({ timeout: t(10000) });
  await pick(visitor, A);
  await expect(la.message(A.last)).toBeVisible({ timeout: t(10000) });
});

for (const sentence of ['the visitor picks chat B from chat history', 'the visitor picks chat B']) {
  When(sentence, async ({ visitor }) => {
    // Hold B on the fake server: anything shown before "chat B arrives" came from the browser.
    visitor.chat.holdChat(chats(visitor).B.id);
    const la = await visitor.la();
    await la.ensureOpen();
    await la.openHistory();
    // Watch every frame from the switch until B's last message shows: was a loader ever drawn?
    await la.startPresenceRecorder(`[data-testid="${TEST_IDS.messagesLoader}"], [aria-busy="true"]`, chats(visitor).B.last, 'switch');
    await la.press(la.historyRow(chats(visitor).B.title));
  });
}

Then("chat A's messages disappear at once", async ({ visitor }) => {
  const la = await visitor.la();
  const { A } = chats(visitor);
  await expect(la.message(A.last)).toBeHidden({ timeout: t(500) });
  await expect(la.message(A.first)).toBeHidden({ timeout: t(500) });
});

Then('a 24px spinning loader-circle icon, #6F6F6F, one turn per 0.8s, is centered in the chat area', async ({ visitor }) => {
  const la = await visitor.la();
  const loader = la.messagesLoader;
  await expect(loader, 'the loader is shown').toBeVisible({ timeout: t(2000) });
  const box = await loader.boundingBox();
  near(box!.width, 24);
  near(box!.height, 24);
  const colours = await loader.evaluate(el => [el, ...Array.from(el.querySelectorAll('*'))].flatMap(e => {
    const cs = getComputedStyle(e);
    return [cs.color, cs.stroke, cs.fill];
  }));
  expect(colours, 'drawn in #6F6F6F').toContain(rgb('#6F6F6F'));
  const spins = await loader.evaluate(el => el.getAnimations({ subtree: true }).map(a => {
    const eff = a.effect as KeyframeEffect;
    const timing = eff.getTiming();
    return { duration: Number(timing.duration), iterations: timing.iterations, frames: JSON.stringify(eff.getKeyframes()) };
  }));
  const spin = spins.find(s => /rotate/.test(s.frames));
  expect(spin, `a rotation among ${JSON.stringify(spins)}`).toBeTruthy();
  near(spin!.duration, 800, 10);
  expect(spin!.iterations).toBe(Infinity);
  const area = await la.messages.boundingBox();
  near(box!.x + box!.width / 2, area!.x + area!.width / 2, 2);
  near(box!.y + box!.height / 2, area!.y + area!.height / 2, 2);
});

When('chat B arrives', async ({ visitor }) => {
  visitor.chat.releaseChat(chats(visitor).B.id);
});

Then('chat B shows, scrolled to its last message', async ({ visitor }) => {
  const la = await visitor.la();
  const { B } = chats(visitor);
  await expect(la.message(B.last)).toBeVisible({ timeout: t(10000) });
  await expect(la.message(B.last)).toBeInViewport({ timeout: t(3000) });
  await expect(la.message(B.first), 'scrolled to the end, so the start is out of view').not.toBeInViewport();
});

Then('chat B shows at once, with no loader', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.message(chats(visitor).B.last)).toBeVisible({ timeout: t(500) });
  const watched = await la.presence('switch');
  expect(watched.done, 'the recorder watched until chat B showed').toBe(true);
  expect(watched.seen, 'a loader was drawn at some moment between the switch and chat B').toBe(false);
});
