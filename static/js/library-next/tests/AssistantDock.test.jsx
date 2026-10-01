import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../strings';
import AssistantDock, { AssistantHeaderButton, closeAssistant, isAssistantOpen } from '../AssistantDock';
import { ASSISTANT_EVENT, requestAssistant, _resetAssistantEvents } from '../assistant/events';
import { sendPrompt, widgetScriptUrl, widgetSupportsPanel } from '../assistant/widget';
import { setLang } from '../i18n';
import { setPersona } from '../persona';
import { _resetStore } from '../store';

let container;
const savedRegistry = window.customElements;
beforeEach(() => {
  _resetStore(); _resetAssistantEvents(); localStorage.clear(); closeAssistant(); setLang('en'); setPersona('newcomer');
  window.history.replaceState({}, '', '/Genesis.1');
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  ReactDOM.unmountComponentAtNode(container); container.remove();
  if (savedRegistry === undefined) { delete window.customElements; } else { window.customElements = savedRegistry; }
  delete HTMLElement.prototype['initial-prompt'];
});

// Shell renders the header action next to the persona chip; mount both the way Shell does.
const render = (user = {}) => act(() => { ReactDOM.render(<><AssistantHeaderButton /><AssistantDock user={user} /></>, container); });
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const flush = () => act(() => Promise.resolve());

/** Pretend ai-chatbot `mf3` is loaded: a registry that knows `lc-chatbot` and understands `initial-prompt`. */
function stubWidget() {
  class Widget {}
  Object.defineProperty(Widget.prototype, 'initial-prompt', { get() { return ''; }, set() {}, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'initial-prompt', { get() { return ''; }, set() {}, configurable: true });
  window.customElements = { get: tag => (tag === 'lc-chatbot' ? Widget : undefined), whenDefined: () => Promise.resolve() };
}

test('opens and closes; shows greeting, starter prompts and the sign-in fallback without a token', () => {
  render({ chatbot_user_token: null });
  const button = container.querySelector('.ln-dock-button');
  const panel = container.querySelector('#ln-assistant-panel');
  expect(panel.classList.contains('is-open')).toBe(false);
  expect(panel.getAttribute('aria-hidden')).toBe('true');
  click(button);
  expect(isAssistantOpen()).toBe(true);
  expect(panel.classList.contains('is-open')).toBe(true);
  expect(container.querySelector('.ln-assistant-greeting').textContent).toContain('No Hebrew needed');
  const starters = container.querySelectorAll('.ln-assistant-starter');
  expect(starters).toHaveLength(3);
  expect(starters[0].getAttribute('data-feature-name')).toBe('starter_prompt');
  expect(starters[0].textContent).toBe('What is the Talmud, and how is it different from the Torah?');
  expect(container.querySelector('.ln-assistant-notice strong').textContent).toBe('Sign in to chat');
  expect(container.querySelector('.ln-assistant-notice a').getAttribute('href')).toBe('/login?next=%2FGenesis.1');
  expect(container.querySelector('lc-chatbot')).toBeNull();
  click(starters[1]);
  expect(container.querySelector('.ln-assistant-pending').textContent).toContain("Where should I start reading");
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(panel.classList.contains('is-open')).toBe(false);
});

test('renders the header action and toggles from it', () => {
  render({});
  const header = container.querySelector('.ln-dock-header-button');
  expect(header.textContent).toBe('Assistant');
  expect(header.getAttribute('aria-expanded')).toBe('false');
  click(header);
  expect(header.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('.ln-dock-button').getAttribute('aria-expanded')).toBe('true');
});

test('renders in Hebrew for the scholar persona', () => {
  setLang('he'); setPersona('scholar');
  render({});
  click(container.querySelector('.ln-dock-button'));
  expect(container.querySelector('.ln-assistant-greeting').textContent).toContain('נוסחים');
  expect(container.querySelector('.ln-assistant-starter').textContent).toBe('אילו כתבי יד ונוסחים קיימים לטקסט הזה, ובמה הם נבדלים?');
  expect(container.querySelector('.ln-dock-header-button').textContent).toBe('עוזר');
  expect(container.querySelector('.ln-assistant-notice strong').textContent).toBe('כניסה לחשבון כדי לשוחח');
});

test('library-next:assistant opens the dock and keeps the prompt for after sign-in', () => {
  render({});
  act(() => { window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: { prompt: 'Quiz me on Genesis 1' } })); });
  expect(isAssistantOpen()).toBe(true);
  expect(container.querySelector('.ln-assistant-pending').textContent).toBe('After signing in, ask: “Quiz me on Genesis 1”');
  closeAssistant();
  act(() => { requestAssistant(); });     // no prompt: just opens
  expect(isAssistantOpen()).toBe(true);
});

test('mounts <lc-chatbot> with the host attributes, follows persona changes and sends prompts', async () => {
  stubWidget();
  render({ chatbot_user_token: 'tok_123', chatbot_api_base_url: 'https://chat-dev.sefaria.org/api', chatbot_origin: 'library-next', is_moderator: true });
  click(container.querySelector('.ln-dock-button'));
  await flush();
  const widget = container.querySelector('lc-chatbot');
  expect(widget).not.toBeNull();
  expect(widget.getAttribute('user-id')).toBe('tok_123');
  expect(widget.getAttribute('api-base-url')).toBe('https://chat-dev.sefaria.org/api');
  expect(widget.getAttribute('origin')).toBe('library-next');
  expect(widget.getAttribute('mode')).toBe('panel');
  expect(widget.getAttribute('persona')).toBe('newcomer');
  expect(widget.getAttribute('interface-lang')).toBe('en');
  expect(widget.getAttribute('is-moderator')).toBe('true');
  expect(container.querySelector('.ln-assistant-widget').classList.contains('is-inline')).toBe(true);
  expect(container.querySelector('.ln-assistant-notice')).toBeNull();

  act(() => { setPersona('educator'); });
  expect(widget.getAttribute('persona')).toBe('educator');
  expect(container.querySelector('.ln-assistant-greeting').textContent).toContain('Planning a class');

  // sendPrompt sets `initial-prompt` and clears it on a 0 ms timer so the same text can be sent again.
  const sent = jest.spyOn(widget, 'setAttribute');
  click(container.querySelectorAll('.ln-assistant-starter')[0]);
  expect(sent).toHaveBeenCalledWith('initial-prompt', 'Give me three discussion questions for teaching this text.');

  act(() => { window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: { prompt: 'Build a lesson on Exodus 20' } })); });
  expect(sent).toHaveBeenLastCalledWith('initial-prompt', 'Build a lesson on Exodus 20');
  await flush();
  expect(widget.hasAttribute('initial-prompt')).toBe(false);
});

test('widget bridge helpers', () => {
  expect(widgetScriptUrl('https://chat-dev.sefaria.org/api')).toBe('https://chat-dev.sefaria.org/static/js/lc-chatbot.umd.cjs');
  expect(widgetScriptUrl('https://12.ai-server.coolifydev.sefaria.org/api/')).toBe('https://12.ai-server.coolifydev.sefaria.org/static/js/lc-chatbot.umd.cjs');
  expect(widgetSupportsPanel(undefined)).toBe(false);
  class Old {}
  expect(widgetSupportsPanel(Old)).toBe(false);
  expect(sendPrompt(null, 'x')).toBeNull();
  expect(sendPrompt(document.createElement('lc-chatbot'), '  ')).toBeNull();
  expect(sendPrompt(document.createElement('lc-chatbot'), 'hi')).toBeNull();   // old widget without a shadow root: nothing to drive
});
