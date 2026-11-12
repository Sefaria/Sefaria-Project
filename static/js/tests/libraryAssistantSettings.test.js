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

// A jQuery-like request: the component chains .fail on what $.post returns.
const jqXHR = () => {
  const req = { fail: jest.fn((fn) => ((req.failFn = fn), req)), done: jest.fn(() => req) };
  return req;
};
const lastRequest = () => global.$.post.mock.results[global.$.post.mock.results.length - 1].value;

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
  global.$ = { post: jest.fn(() => jqXHR()) };
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

  it('renders Profile headings and paragraphs as text', async () => {
    global.fetch.mockImplementation(() =>
      reply(
        state({ profile: { ...state().profile, text: '# Background\nReads Rashi.\n\n# Focus\nBerakhot <b>1</b>' } })
      )
    );
    await render();
    const headings = [...container.querySelectorAll('.laProfileHeading')].map((h) => h.textContent);
    expect(headings).toEqual(['Background', 'Focus']);
    expect(container.querySelectorAll('.laProfileBody')).toHaveLength(2);
    expect(container.querySelector('.laProfileBody b')).toBeNull();
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

  const key = (el, k) => act(async () => Simulate.keyDown(el, { key: k }));
  const radios = (group) => [...group.querySelectorAll('[role="radio"]')];

  it('keeps one tab stop per radio group', async () => {
    global.fetch.mockImplementation(() => reply(state({ labEnabled: true })));
    await render();
    const groups = [...container.querySelectorAll('[role="radiogroup"]')];
    expect(groups.length).toBe(5);
    groups.forEach((g) => expect(radios(g).filter((r) => r.tabIndex === 0).length).toBe(1));
    const first = radios(groups[0]);
    expect(first[0].getAttribute('aria-checked')).toBe('true');
    expect(first[0].tabIndex).toBe(0);
    expect(first[1].tabIndex).toBe(-1);
  });

  it('arrow keys move and select inside the page switch', async () => {
    await render();
    const [on, off] = radios(q('#libraryAssistantSetting [role="radiogroup"]'));
    await key(on, 'ArrowRight');
    expect(off.getAttribute('aria-checked')).toBe('true');
    expect(off.tabIndex).toBe(0);
    expect(on.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(off);
    await key(off, 'ArrowUp');
    expect(on.getAttribute('aria-checked')).toBe('true');
    await key(on, 'ArrowDown');
    expect(off.getAttribute('aria-checked')).toBe('true');
    await key(off, 'ArrowLeft');
    expect(on.getAttribute('aria-checked')).toBe('true');
    await key(off, 'Enter'); // Enter on a focused, unselected option selects it
    expect(off.getAttribute('aria-checked')).toBe('true');
    expect(on.getAttribute('aria-checked')).toBe('false');
  });

  it('arrow keys wrap at the ends of a radio group', async () => {
    await render();
    const [on, off] = radios(q('#libraryAssistantSetting [role="radiogroup"]'));
    await key(on, 'ArrowLeft'); // before "On" wraps to "Off"
    expect(off.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(off);
    await key(off, 'ArrowRight'); // after "Off" wraps to "On"
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(on);
    await key(on, 'ArrowUp');
    expect(off.getAttribute('aria-checked')).toBe('true');
    await key(off, 'ArrowDown');
    expect(on.getAttribute('aria-checked')).toBe('true');
  });

  it('arrow keys on a Personalization group call the right handler; Space selects', async () => {
    await render();
    const [on, off] = radios(q('#instructions [role="radiogroup"]'));
    await key(on, 'ArrowRight');
    await flush();
    expect(sent(1)).toEqual({ userId: 'tok', action: 'toggle', target: 'instructions', enabled: false });
    await key(off, ' ');
    await flush();
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(sent(2)).toEqual({ userId: 'tok', action: 'toggle', target: 'instructions', enabled: false });
  });

  it('flips Left and Right in RTL', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    try {
      await render();
      const [on, off] = radios(q('#libraryAssistantSetting [role="radiogroup"]'));
      await key(on, 'ArrowRight'); // toward the start in RTL: wraps from "On" to "Off"
      expect(off.getAttribute('aria-checked')).toBe('true');
      await key(off, 'ArrowRight'); // back to "On"
      expect(on.getAttribute('aria-checked')).toBe('true');
      await key(on, 'ArrowLeft'); // toward the end in RTL: "Off"
      expect(off.getAttribute('aria-checked')).toBe('true');
      await key(off, 'ArrowLeft');
      expect(on.getAttribute('aria-checked')).toBe('true');
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });

  it('flips Left and Right when only the computed direction is rtl (body.interface-hebrew)', async () => {
    expect(document.documentElement.getAttribute('dir')).toBeNull();
    await render();
    const [on, off] = radios(q('#libraryAssistantSetting [role="radiogroup"]'));
    const computed = jest.spyOn(window, 'getComputedStyle').mockReturnValue({ direction: 'rtl' });
    try {
      await key(on, 'ArrowRight'); // RTL: toward the start, wraps to "Off"
      expect(off.getAttribute('aria-checked')).toBe('true');
      await key(off, 'ArrowLeft'); // RTL: toward the end, wraps to "On"
      expect(on.getAttribute('aria-checked')).toBe('true');
      await key(on, 'ArrowLeft'); // RTL: toward the end, "Off"
      expect(off.getAttribute('aria-checked')).toBe('true');
      expect(computed).toHaveBeenCalled();
    } finally {
      computed.mockRestore();
    }
  });

  it('the page switch is aria-disabled and ignores input while its Save is in flight', async () => {
    await render();
    const [on, off] = radios(q('#libraryAssistantSetting [role="radiogroup"]'));
    await act(async () => Simulate.click(off));
    await act(async () => Simulate.click(byText('button', 'Save assistant setting')));
    expect(on.getAttribute('aria-disabled')).toBe('true');
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(on.disabled).toBe(false);
    await act(async () => Simulate.click(on));
    await key(off, 'ArrowRight');
    expect(off.getAttribute('aria-checked')).toBe('true');
    // a failed save frees the group again
    await act(async () => lastRequest().failFn());
    expect(on.getAttribute('aria-disabled')).toBeNull();
    await act(async () => Simulate.click(on));
    expect(on.getAttribute('aria-checked')).toBe('true');
  });

  it('gives every radiogroup and textarea an accessible name', async () => {
    global.fetch.mockImplementation(() => reply(state({ labEnabled: true })));
    await render();
    const nameOf = (el) =>
      el
        .getAttribute('aria-labelledby')
        .split(' ')
        .map((id) => document.getElementById(id).textContent)
        .join(' ');
    const named = [...container.querySelectorAll('[role="radiogroup"], textarea')];
    expect(named.length).toBe(7);
    named.forEach((el) => expect(nameOf(el).trim()).not.toBe(''));
    expect(nameOf(q('textarea.laInstructions'))).toBe('Instructions');
    expect(nameOf(q('textarea.laEditRequest'))).toBe('Tell LA what to change');
  });

  it('an initial load that returns 200 {} shows the generic error and keeps the tab mounted', async () => {
    global.fetch.mockImplementation(() => reply({}));
    await render();
    expect(q('#personalization .laError').textContent).toBe('Could not reach the Library Assistant. Try again.');
    expect(q('#libraryAssistantSetting')).not.toBeNull();
    expect(q('textarea.laInstructions')).toBeNull();
    expect(q('.libraryAssistantSettings')).not.toBeNull();
  });

  it('a 200 for set_instructions without instructions shows the generic error and clears busy', async () => {
    await render();
    await act(async () => Simulate.change(q('textarea.laInstructions'), { target: { value: 'Be brief' } }));
    global.fetch.mockImplementationOnce(() => reply({}));
    await act(async () => Simulate.click(byText('button', 'Save instructions')));
    await flush();
    expect(q('.laError').textContent).toBe('Could not reach the Library Assistant. Try again.');
    expect(q('textarea.laInstructions').value).toBe('Be brief');
    expect(q('[aria-disabled="true"][role="radio"]')).toBeNull();
  });

  it('a 200 for edit_profile without profile shows the generic error, not Processing', async () => {
    await render();
    await act(async () => Simulate.change(q('textarea.laEditRequest'), { target: { value: 'Add a note' } }));
    global.fetch.mockImplementationOnce(() => reply({}));
    await act(async () => Simulate.click(byText('button', 'Send')));
    await flush();
    expect(q('.laError').textContent).toBe('Could not reach the Library Assistant. Try again.');
    expect(container.textContent).not.toContain('Processing…');
    expect(q('.laEditResult')).toBeNull();
  });

  it('a double click on the page Save posts once', async () => {
    await render();
    await act(async () => Simulate.click(q('[data-la-value="false"]')));
    const save = byText('button', 'Save assistant setting');
    await act(async () => {
      Simulate.click(save);
      Simulate.click(save);
    });
    expect(global.$.post).toHaveBeenCalledTimes(1);
    expect(save.getAttribute('aria-disabled')).toBe('true');
  });

  it('shows an error and allows a retry when the $.post request fails', async () => {
    await render();
    await act(async () => Simulate.click(q('[data-la-value="false"]')));
    await act(async () => Simulate.click(byText('button', 'Save assistant setting')));
    await act(async () => lastRequest().failFn());
    expect(q('#libraryAssistantSetting .laError').textContent).toBe('Could not save the setting. Try again.');
    expect(byText('button', 'Save assistant setting').getAttribute('aria-disabled')).toBeNull();
    await act(async () => Simulate.click(byText('button', 'Save assistant setting')));
    expect(global.$.post).toHaveBeenCalledTimes(2);
  });

  it('shows the server error from a 200 body with an error field', async () => {
    await render();
    await act(async () => Simulate.click(q('[data-la-value="false"]')));
    await act(async () => Simulate.click(byText('button', 'Save assistant setting')));
    await act(async () => global.$.post.mock.calls[0][2]({ error: 'Nope' }));
    expect(q('#libraryAssistantSetting .laError').textContent).toBe('Nope');
  });

  it('reloads the page after a successful save', async () => {
    const original = window.location;
    delete window.location;
    window.location = { reload: jest.fn() };
    try {
      await render();
      await act(async () => Simulate.click(q('[data-la-value="false"]')));
      await act(async () => Simulate.click(byText('button', 'Save assistant setting')));
      await act(async () => global.$.post.mock.calls[0][2]({ status: 'ok' }));
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    } finally {
      window.location = original;
    }
  });

  it('shows the too_long message on a 400', async () => {
    await render();
    await act(async () => Simulate.change(q('textarea.laInstructions'), { target: { value: 'Be brief' } }));
    global.fetch.mockImplementationOnce(() => reply({ error: 'too_long', max: 300 }, 400));
    await act(async () => Simulate.click(byText('button', 'Save instructions')));
    await flush();
    expect(q('.laError').textContent).toBe('Keep it to 300 characters.');
  });

  it('does not update state after unmount', async () => {
    global.fetch.mockImplementation(() => reply(state({ labEnabled: true })));
    await render();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolve;
    global.fetch.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    await act(async () => Simulate.click(byText('button', 'Check job health')));
    ReactDOM.unmountComponentAtNode(container);
    await act(async () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ jobs: [] }) }));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
