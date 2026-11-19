/* Testing done using Jest */
// The Library Assistant tab of Settings: its own on/off, and Personalized answers (Profile, Instructions,
// testing tools) read and written over HTTP with the user's token. Every change saves on its own.
// No React testing library here: react-dom/test-utils only.
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import LibraryAssistantSettings, {
  describeRun,
  INSTRUCTIONS_SAVE_MS,
  isPreviewBase,
  LOAD_TIMEOUT_MS,
  parseSections,
} from '../LibraryAssistantSettings';

jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: { interfaceLang: 'english', _: (k) => k } }));
jest.mock('../Misc', () => ({
  __esModule: true,
  InterfaceText: ({ text, children }) => (text ? text.en : (children ?? null)),
}));
jest.mock('../SettingsPage.jsx', () => ({ __esModule: true, useDialogKeys: () => {} }));

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
  const req = { fail: jest.fn((fn) => ((req.failFn = fn), req)) };
  return req;
};

let container;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const mount = async (props = {}) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    ReactDOM.render(
      <LibraryAssistantSettings
        chatbot_user_token="tok"
        chatbot_api_base_url={BASE}
        libraryAssistantEnabled={true}
        {...props}
      />,
      container
    );
  });
};
const render = async (props) => {
  await mount(props);
  await flush();
};
const unmount = () => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
};
const q = (sel) => container.querySelector(sel);
const byText = (sel, text) => [...container.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
const sent = (i) => JSON.parse(global.fetch.mock.calls[i][1].body);
const actions = () => global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).action);
const type = (el, value) =>
  act(async () => {
    Simulate.change(el, { target: { value } });
  });
const check = (el, checked) =>
  act(async () => {
    Simulate.change(el, { target: { checked } });
  });

beforeEach(() => {
  global.fetch = jest.fn(() => reply(state()));
  global.$ = { post: jest.fn(() => jqXHR()) };
});
afterEach(() => {
  jest.useRealTimers();
  if (container && container.isConnected) unmount();
});

describe('helpers', () => {
  it('describes a run in plain words, then the codes', () => {
    expect(describeRun({ status: 'no_change', reason: 'no_new_prompts' })).toBe(
      'No change to the Profile. No new questions since the last update. Instructions never change the Profile. (no_change: no_new_prompts)'
    );
    expect(describeRun({ status: 'odd' })).toBe('odd');
  });

  it('knows a preview deployment by its host', () => {
    expect(isPreviewBase('https://9298.ai-server.coolifydev.sefaria.org/api')).toBe(true);
    expect(isPreviewBase('https://chat.sefaria.org/api')).toBe(false);
    expect(isPreviewBase('not a url')).toBe(false);
  });

  it('parses Profile headings and paragraphs', () => {
    expect(parseSections('# How you learn\nShort answers.\n\n# Studying\nGenesis')).toEqual([
      { heading: 'How you learn', body: 'Short answers.' },
      { heading: 'Studying', body: 'Genesis' },
    ]);
  });
});

describe('LibraryAssistantSettings', () => {
  it('shows the page title and nothing in the save status before a change', async () => {
    await render();
    expect(q('h1').textContent).toBe('Library Assistant Settings');
    expect(q('.laSaveStatus').textContent).toBe('');
  });

  it('with no token or no API base explains it and makes no call', async () => {
    await render({ chatbot_user_token: null });
    expect(q('#personalization').textContent).toContain('Personalization is not available here.');
    unmount();
    await render({ chatbot_api_base_url: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches get once with the token in the body, no custom header', async () => {
    await render();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`${BASE}/v2/personalization/settings`);
    expect(sent(0)).toEqual({ userId: 'tok', action: 'get' });
    expect(global.fetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('prefers the preview deployment when chatbot_version is set', async () => {
    await render({ chatbot_version: 9298 });
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://9298.ai-server.coolifydev.sefaria.org/api/v2/personalization/settings'
    );
  });

  it('shows the empty Profile text and "Never updated" for Instructions', async () => {
    await render();
    expect(q('#profile').textContent).toContain(
      'As you use the Library Assistant, it will start to remember things about you and record them here.'
    );
    expect(q('#instructions').textContent).toContain('Never updated');
  });

  it('renders the Profile as text, never as HTML', async () => {
    global.fetch.mockImplementation(() =>
      reply(state({ profile: { ...state().profile, text: '# How you learn\n<b>Short</b> answers.' } }))
    );
    await render();
    expect(q('.laProfileHeading').textContent).toBe('How you learn');
    expect(q('.laProfileBody').textContent).toBe('<b>Short</b> answers.');
    expect(q('.laProfileBody b')).toBeNull();
  });

  it('puts the Profile card before the Instructions card', async () => {
    await render();
    const cards = [...container.querySelectorAll('section.laCard')].map((s) => s.id).filter(Boolean);
    expect(cards.indexOf('profile')).toBeLessThan(cards.indexOf('instructions'));
  });

  it('saves Instructions on its own once typing stops, and says so in the header', async () => {
    let finish;
    await render();
    global.fetch.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ ok: true, status: 200, json: () => state() })))
    );
    jest.useFakeTimers();
    await type(q('#laInstructionsText'), 'Answer in English.');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(INSTRUCTIONS_SAVE_MS);
    });
    expect(sent(1)).toEqual({ userId: 'tok', action: 'set_instructions', text: 'Answer in English.' });
    expect(q('.laSaveStatus').textContent).toBe('Saving changes…');
    jest.useRealTimers();
    await act(async () => {
      finish();
    });
    await flush();
    expect(q('.laSaveStatus').textContent).toBe('Changes saved');
  });

  it('says Changes not saved when a save fails', async () => {
    await render();
    global.fetch.mockImplementation(() => reply({}, 500));
    await check(q('#laProfile'), false);
    await flush();
    expect(q('.laSaveStatus').textContent).toBe('Changes not saved');
    expect(q('.laSaveStatus').className).toContain('laSaveStatusFail');
  });

  it('saves Instructions on leaving the field, and not twice', async () => {
    await render();
    await type(q('#laInstructionsText'), 'Short answers.');
    await act(async () => Simulate.blur(q('#laInstructionsText')));
    await act(() => new Promise((r) => setTimeout(r, INSTRUCTIONS_SAVE_MS + 50)));
    await flush();
    expect(actions().filter((a) => a === 'set_instructions')).toHaveLength(1);
  });

  it('counts characters and does not save over 300', async () => {
    await render();
    await type(q('#laInstructionsText'), 'x'.repeat(301));
    expect(q('.laCount').textContent).toBe('301 / 300');
    expect(q('#instructions').textContent).toContain('Keep it to 300 characters.');
    await act(async () => Simulate.blur(q('#laInstructionsText')));
    await flush();
    expect(actions()).not.toContain('set_instructions');
  });

  it('switches call toggle with the right target', async () => {
    await render();
    await check(q('#laProfile'), false);
    await flush();
    await check(q('#laInstructions'), false);
    await flush();
    expect(sent(1)).toMatchObject({ action: 'toggle', target: 'profile', enabled: false });
    expect(sent(2)).toMatchObject({ action: 'toggle', target: 'instructions', enabled: false });
  });

  it('grays what is under a switch that is off', async () => {
    global.fetch.mockImplementation(() =>
      reply(state({ instructions: { text: '', enabled: false, updatedAt: null } }))
    );
    await render();
    expect(q('#instructions .laBody').className).toContain('laBodyOff');
    expect(q('#profile .laBody').className).not.toContain('laBodyOff');
  });

  it('Clear profile needs the confirm', async () => {
    global.fetch.mockImplementation(() => reply(state({ profile: { ...state().profile, text: '# A\nB' } })));
    await render();
    await act(async () => Simulate.click(byText('#profile button', 'Clear profile')));
    expect(actions()).not.toContain('clear_profile');
    expect(q('[role="alertdialog"]').textContent).toContain('Clear your profile?');
    await act(async () => Simulate.click(byText('[role="alertdialog"] button', 'Cancel')));
    expect(q('[role="alertdialog"]')).toBeNull();
    await act(async () => Simulate.click(byText('#profile button', 'Clear profile')));
    await act(async () => Simulate.click(byText('[role="alertdialog"] button', 'Clear profile')));
    await flush();
    expect(actions()).toContain('clear_profile');
  });

  it('shows the reason when an edit is refused', async () => {
    await render();
    global.fetch.mockImplementation(() =>
      reply({ edit: { status: 'refused', reason: 'That belongs in your instructions.' } })
    );
    await type(q('#laEdit'), 'Only Ramban');
    await act(async () => Simulate.click(byText('button', 'Update profile')));
    await flush();
    expect(q('#profile').textContent).toContain('That belongs in your instructions.');
  });

  it('marks the part an edit changed as Just updated', async () => {
    global.fetch.mockImplementation(() => reply(state({ profile: { ...state().profile, text: '# A\nOne' } })));
    await render();
    global.fetch.mockImplementation(() =>
      reply({ ...state({ profile: { ...state().profile, text: '# A\nOne\n# B\nTwo' } }), edit: { status: 'applied' } })
    );
    await type(q('#laEdit'), 'Add B');
    await act(async () => Simulate.click(byText('button', 'Update profile')));
    await flush();
    const items = [...container.querySelectorAll('.laProfileItem')];
    expect(items[1].textContent).toContain('Just updated');
    expect(items[0].textContent).not.toContain('Just updated');
    expect(q('#laEdit').value).toBe('');
  });

  it('hides the testing tools unless labEnabled', async () => {
    await render();
    expect(q('#testing-tools')).toBeNull();
    unmount();
    global.fetch.mockImplementation(() => reply(state({ labEnabled: true })));
    await render();
    expect(q('#testing-tools')).not.toBeNull();
  });

  it('gives every testing tool its helper line', async () => {
    global.fetch.mockImplementation(() => reply(state({ labEnabled: true })));
    await render();
    for (const id of ['laRunNow', 'laDreamNow', 'laEvery', 'laPlain', 'laHealth']) {
      expect(q(`#${id}-hint`)).not.toBeNull();
    }
  });

  it('shows a Run now result in plain words, and the hourly limit on a 429', async () => {
    global.fetch.mockImplementation((url, init) => {
      const { action } = JSON.parse(init.body);
      return reply(
        action === 'run_now'
          ? { ...state({ labEnabled: true }), run: { status: 'no_change', reason: 'nothing_to_write' } }
          : state({ labEnabled: true })
      );
    });
    await render();
    await act(async () => Simulate.click(byText('button', 'Run now')));
    await flush();
    expect(q('.laRunResult').textContent).toBe(
      'No change to the Profile. Nothing new to add. (no_change: nothing_to_write)'
    );
    global.fetch.mockImplementation(() => reply({}, 429));
    await act(async () => Simulate.click(byText('button', 'Dream now')));
    await flush();
    expect(q('.laRunResult').textContent).toBe('Hourly limit reached. Try again later.');
  });

  it('explains a 404 on a page with no preview server, and keeps it short with one', async () => {
    global.fetch.mockImplementation(() => reply({}, 404));
    await render();
    expect(q('#personalization').textContent).toContain('Open the test link you were sent');
    unmount();
    await render({ chatbot_version: 9298 });
    expect(q('#personalization').textContent).toContain('Personalization is not available here.');
    expect(q('#personalization').textContent).not.toContain('Open the test link you were sent');
  });

  it('a first read that never answers ends in the error with Try again', async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation(
      (url, init) =>
        new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    );
    await mount();
    expect(q('#personalization').textContent).toContain('Loading…');
    await act(async () => {
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS);
    });
    jest.useRealTimers();
    await flush();
    expect(q('#personalization').textContent).toContain('Could not reach the Library Assistant. Try again.');
    global.fetch.mockImplementation(() => reply(state()));
    await act(async () => Simulate.click(byText('button', 'Try again')));
    await flush();
    expect(q('#profile')).not.toBeNull();
  });

  it('turning the assistant off posts the setting and shows Saving changes', async () => {
    await render();
    await check(q('#laAssistant'), false);
    expect(global.$.post).toHaveBeenCalledTimes(1);
    const [url, data] = global.$.post.mock.calls[0];
    expect(url).toBe('/api/profile');
    expect(JSON.parse(data.json)).toEqual({ settings: { library_assistant: false } });
    expect(q('.laSaveStatus').textContent).toBe('Saving changes…');
  });

  it('a failed assistant save says so and puts the switch back', async () => {
    await render();
    await check(q('#laAssistant'), false);
    await act(async () => global.$.post.mock.results[0].value.failFn());
    expect(q('#libraryAssistantSetting').textContent).toContain('Could not save the setting. Try again.');
    expect(q('#laAssistant').checked).toBe(true);
  });

  it('with the assistant off: the note on top, the area grayed and inert, its switches off', async () => {
    await render({ libraryAssistantEnabled: false });
    expect(q('.laOffNote').textContent).toBe('Turn on the Library Assistant to activate personalized answers.');
    expect(q('#personalization').className).toContain('laGroupOff');
    expect(q('#personalization').getAttribute('inert')).toBe('true');
    expect(q('#laProfile').checked).toBe(false);
    expect(q('#laProfile').disabled).toBe(true);
  });

  it('does not update state after unmount', async () => {
    let finish;
    global.fetch.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    unmount();
    await act(async () => finish({ ok: true, status: 200, json: () => state() }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
