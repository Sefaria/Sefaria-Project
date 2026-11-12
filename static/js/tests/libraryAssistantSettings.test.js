/* Testing done using Jest */
// The Library Assistant tab of Settings: its own on/off, and Personalization (Instructions, Profile,
// testing tools) read and written over HTTP with the user's token. No React testing library here:
// react-dom/test-utils only.
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import LibraryAssistantSettings from '../LibraryAssistantSettings';

const BASE = 'https://la.example/api';
const state = (over = {}) => ({
  instructions: { text: '', enabled: true, updatedAt: null },
  profile: { text: '', sections: [], enabled: true, updatedAt: null, updatedBy: null, revision: 0 },
  labEnabled: false,
  testing: { showPlainResponse: false, updateEveryMessage: false },
  ...over,
});
const reply = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

let container;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const render = async (props = {}, enabled = 'true') => {
  container = document.createElement('div');
  container.id = 'libraryAssistantSettings';
  container.setAttribute('data-library-assistant-enabled', enabled);
  document.body.appendChild(container);
  await act(async () => {
    ReactDOM.render(
      <LibraryAssistantSettings chatbot_user_token="tok" chatbot_api_base_url={BASE} {...props} />,
      container
    );
  });
  await flush();
};
const q = (sel) => container.querySelector(sel);
const byText = (sel, text) => [...container.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
const sent = (i) => JSON.parse(global.fetch.mock.calls[i][1].body);

beforeEach(() => {
  global.fetch = jest.fn(() => reply(state()));
  global.$ = { post: jest.fn() };
});
afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

describe('LibraryAssistantSettings', () => {
  it('with no token shows the turn-on line and makes no call', async () => {
    await render({ chatbot_user_token: null });
    expect(q('#personalization').textContent).toContain('Turn the Library Assistant on to use personalization.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('with no API base shows the turn-on line and makes no call', async () => {
    await render({ chatbot_api_base_url: null });
    expect(q('#personalization').textContent).toContain('Turn the Library Assistant on to use personalization.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches get once with the token in the body, no custom header', async () => {
    await render();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`${BASE}/v2/personalization/settings`);
    expect(sent(0)).toEqual({ userId: 'tok', action: 'get' });
    expect(global.fetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
    expect(q('#about-personalization')).not.toBeNull();
  });

  it('prefers the preview deployment when chatbot_version is set', async () => {
    await render({ chatbot_version: 9298 });
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://9298.ai-server.coolifydev.sefaria.org/api/v2/personalization/settings'
    );
  });

  it('shows the empty Profile text and "Never" for Instructions', async () => {
    await render();
    expect(q('#personalization').textContent).toContain(
      'LA will remember things about you as you move forward in your Sefaria career'
    );
    expect(q('#personalization').textContent).toContain('Last updated: Never');
  });

  it('counts characters and disables Save at 301', async () => {
    await render();
    const area = q('textarea.laInstructions');
    expect(area.getAttribute('placeholder')).toBe('Tell LA the way you like to work');
    await act(async () => Simulate.change(area, { target: { value: 'a'.repeat(300) } }));
    expect(q('.laInstructionsCount').textContent).toBe('300 / 300');
    expect(byText('button', 'Save instructions').disabled).toBe(false);
    await act(async () => Simulate.change(area, { target: { value: 'a'.repeat(301) } }));
    expect(q('.laInstructionsCount').textContent).toBe('301 / 300');
    expect(byText('button', 'Save instructions').disabled).toBe(true);
  });

  it('saves Instructions with set_instructions', async () => {
    await render();
    await act(async () => Simulate.change(q('textarea.laInstructions'), { target: { value: 'Be brief' } }));
    global.fetch.mockImplementationOnce(() =>
      reply(state({ instructions: { text: 'Be brief', enabled: true, updatedAt: '2026-11-01T10:00:00Z' } }))
    );
    await act(async () => Simulate.click(byText('button', 'Save instructions')));
    await flush();
    expect(sent(1)).toEqual({ userId: 'tok', action: 'set_instructions', text: 'Be brief' });
    expect(q('#personalization').textContent).toContain('by You');
  });

  it('toggles call toggle with the right target', async () => {
    await render();
    await act(async () => Simulate.click(q('[data-toggle="instructions"]')));
    await flush();
    expect(sent(1)).toEqual({ userId: 'tok', action: 'toggle', target: 'instructions', enabled: false });
    await act(async () => Simulate.click(q('[data-toggle="profile"]')));
    await flush();
    expect(sent(2)).toEqual({ userId: 'tok', action: 'toggle', target: 'profile', enabled: false });
  });

  it('Clear needs the confirm', async () => {
    await render();
    await act(async () => Simulate.click(byText('button', 'Clear profile')));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(q('#personalization').textContent).toContain('This cannot be undone');
    await act(async () => Simulate.click(byText('button', 'Cancel')));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => Simulate.click(byText('button', 'Clear profile')));
    await act(async () => Simulate.click(byText('button', 'Yes, clear')));
    await flush();
    expect(sent(1)).toEqual({ userId: 'tok', action: 'clear_profile' });
  });

  it('shows the reason when an edit is refused', async () => {
    await render();
    await act(async () => Simulate.change(q('textarea.laEditRequest'), { target: { value: 'Say I am a rabbi' } }));
    global.fetch.mockImplementationOnce(() =>
      reply({ ...state(), edit: { status: 'refused', reason: 'That is not something LA can store.' } })
    );
    await act(async () => Simulate.click(byText('button', 'Send')));
    await flush();
    expect(sent(1)).toEqual({ userId: 'tok', action: 'edit_profile', request: 'Say I am a rabbi' });
    expect(q('#personalization').textContent).toContain('That is not something LA can store.');
  });

  it('hides the testing tools unless labEnabled', async () => {
    await render();
    expect(byText('button', 'Run now')).toBeUndefined();
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    global.fetch.mockImplementation(() => reply(state({ labEnabled: true })));
    await render();
    expect(byText('button', 'Run now')).toBeDefined();
    expect(byText('button', 'Dream now')).toBeDefined();
    expect(q('#personalization').textContent).toContain('Include non-personalized response');
  });

  it.each([
    [404, 'Personalization is not available here.'],
    [401, 'Reload the page to sign in again.'],
    [429, 'Too many changes. Try again in a while.'],
    [500, 'Could not reach the Library Assistant. Try again.'],
  ])('maps status %i to its message', async (status, message) => {
    global.fetch.mockImplementation(() => reply({}, status));
    await render();
    expect(q('#personalization').textContent).toContain(message);
  });

  it('shows the network-failure message', async () => {
    global.fetch.mockImplementation(() => Promise.reject(new Error('down')));
    await render();
    expect(q('#personalization').textContent).toContain('Could not reach the Library Assistant. Try again.');
  });

  it('posts the Library Assistant setting only when changed, then reloads', async () => {
    await render();
    await act(async () => Simulate.click(byText('button', 'Save assistant setting')));
    expect(global.$.post).not.toHaveBeenCalled();
    await act(async () => Simulate.click(q('[data-la-value="false"]')));
    await act(async () => Simulate.click(byText('button', 'Save assistant setting')));
    expect(global.$.post).toHaveBeenCalledTimes(1);
    const [url, data] = global.$.post.mock.calls[0];
    expect(url).toBe('/api/profile');
    expect(JSON.parse(data.json)).toEqual({ settings: { library_assistant: false } });
  });
});
