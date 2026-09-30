/**
 * LexiconContentEditBox: the moderator content-editing tool. Mounts through the real
 * LexiconEntryEditBox/useLexiconEntrySave (already covered in lexiconEntryEditBox.test.js).
 * json-edit-react's JsonEditor is stubbed to a plain data/setData harness -- these tests are
 * about this component's own GET-then-build-draft and save wiring, not the library's UI.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/tests/searchResultCardAuxClick.test.js.
 */

jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    ref: jest.fn(),
    getIndexDetails: jest.fn(),
    apiRequestWithBody: jest.fn(),
    interfaceLang: 'english',
    _: (k) => k,
  },
}));

jest.mock('../Misc', () => ({
  __esModule: true,
  InterfaceText: ({ text, children }) => (text ? (text.en ?? '') : (children ?? null)),
  LoadingMessage: () => 'loading',
}));

jest.mock('json-edit-react', () => {
  const React = require('react');  // jest.mock factories are hoisted above imports
  return {
    __esModule: true,
    JsonEditor: ({ data, setData }) => React.createElement('div', { className: 'fakeJsonEditor' },
      React.createElement('div', { className: 'fakeJsonEditorData' }, JSON.stringify(data)),
      React.createElement('button', {
        className: 'fakeJsonEditorMutate',
        onClick: () => setData({ ...data, notes: 'edited via fake editor' }),
      }, 'mutate'),
    ),
  };
});

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../sefaria/sefaria';
import LexiconContentEditBox, { ContentEditor } from '../LexiconContentEditBox';

let container = null;

async function mount(currentlyVisibleRef) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    ReactDOM.render(React.createElement(LexiconContentEditBox, { currentlyVisibleRef }), container);
  });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

const editorData = () => JSON.parse(container.querySelector('.fakeJsonEditorData').textContent);
const mutate = () => act(() => {
  container.querySelector('.fakeJsonEditorMutate').dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
const saveButton = () => container.querySelector('button.button');
const clickSave = async () => act(async () => { saveButton().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

const ENTRY_URL = `/api/lexicon-entry/${encodeURIComponent('BDB Dictionary')}/${encodeURIComponent('שָׁמַר')}`;

// fetchLexiconApi reads apiRequestWithBody's raw Response (convertResponseToJSON=false),
// not a plain parsed object -- these build the {ok, json()} shape it expects.
const okResponse = (data) => ({ ok: true, json: () => Promise.resolve(data) });
const errorResponse = (message) => ({ ok: false, json: () => Promise.resolve({ error: message }) });

beforeEach(() => {
  jest.clearAllMocks();
  Sefaria.ref.mockReturnValue({ categories: ['Dictionary'], indexTitle: 'BDB', sectionRef: 'BDB, שָׁמַר' });
  Sefaria.getIndexDetails.mockResolvedValue({ lexiconName: 'BDB Dictionary' });
});

afterEach(() => {
  if (container) unmount();
});

describe('loading the entry', () => {
  test('GETs the resolved entry\'s content', async () => {
    Sefaria.apiRequestWithBody.mockResolvedValue(okResponse({
      entry: { headword: 'שָׁמַר', content: { senses: [] } },
      content_attr_names: ['content'],
    }));

    await mount('BDB, שָׁמַר');

    expect(Sefaria.apiRequestWithBody).toHaveBeenCalledWith(ENTRY_URL, null, null, 'GET', false);
  });

  test('the draft includes only content_attr_names keys, skipping ones absent from entry', async () => {
    Sefaria.apiRequestWithBody.mockResolvedValue(okResponse({
      // 'notes' is content-patchable per content_attr_names but this entry doesn't have one --
      // it must not appear in the draft as e.g. undefined.
      entry: { headword: 'שָׁמַר', content: { senses: [] }, parent_lexicon: 'BDB Dictionary' },
      content_attr_names: ['content', 'notes'],
    }));

    await mount('BDB, שָׁמַר');

    expect(editorData()).toEqual({ content: { senses: [] } });
  });

  test('a 404 response shows an error instead of an indefinite spinner', async () => {
    // Previously: no .catch() on the GET at all, so a rejection here was an unhandled
    // promise, and the panel stayed on LoadingMessage forever with no explanation.
    Sefaria.apiRequestWithBody.mockResolvedValue(errorResponse('Entry not found.'));

    await mount('BDB, שָׁמַר');

    expect(container.textContent).not.toBe('loading');
    expect(container.textContent).toContain('Entry not found.');
  });

  test('an earlier-started but later-resolving GET does not overwrite a newer entry\'s content', async () => {
    // Renders ContentEditor directly (not through LexiconContentEditBox/LexiconEntryEditBox):
    // that wrapper resets its own identity state to undefined -- and therefore unmounts
    // ContentEditor -- on every currentlyVisibleRef change, which would mask whether
    // ContentEditor's OWN stale-response guard actually does anything (React silently drops
    // a setState from an already-unmounted component regardless of any explicit guard).
    // Rendering ContentEditor directly with a changing `identity` prop, with no unmount in
    // between, is what actually exercises its guard.
    let resolveFirst, resolveSecond;
    const pendingFirst = new Promise((res) => { resolveFirst = res; });
    const pendingSecond = new Promise((res) => { resolveSecond = res; });
    const urlFor = (headword) => `/api/lexicon-entry/${encodeURIComponent('BDB Dictionary')}/${encodeURIComponent(headword)}`;
    Sefaria.apiRequestWithBody.mockImplementation((url) => (url === urlFor('שָׁמַר') ? pendingFirst : pendingSecond));

    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      ReactDOM.render(React.createElement(ContentEditor, { identity: { lexiconName: 'BDB Dictionary', headword: 'שָׁמַר' } }), container);
    });
    expect(container.textContent).toBe('loading');

    // Same component instance, new identity prop -- no unmount, unlike going through the
    // full LexiconContentEditBox tree.
    await act(async () => {
      ReactDOM.render(React.createElement(ContentEditor, { identity: { lexiconName: 'BDB Dictionary', headword: 'אָב' } }), container);
    });
    expect(container.textContent).toBe('loading');

    // The second (current) entry's GET resolves first.
    await act(async () => {
      resolveSecond(okResponse({ entry: { headword: 'אָב', content: { senses: ['second'] } }, content_attr_names: ['content'] }));
    });
    expect(editorData()).toEqual({ content: { senses: ['second'] } });

    // The first (stale) entry's GET finally resolves -- must not overwrite the current draft.
    await act(async () => {
      resolveFirst(okResponse({ entry: { headword: 'שָׁמַר', content: { senses: ['first'] } }, content_attr_names: ['content'] }));
    });
    expect(editorData()).toEqual({ content: { senses: ['second'] } });
  });
});

describe('editing and saving', () => {
  let alertSpy;

  // Argument-based dispatch (branching on `method`) rather than a call-order queue
  // (mockResolvedValueOnce chains): each test's mount() does a GET, then some also PATCH via
  // clickSave() -- a queue-based approach would leak into the next test if an assertion
  // failed partway through, since jest.clearAllMocks() doesn't clear queued
  // once-implementations, only call history.
  const patchResponse = () => okResponse({ ok: true });
  beforeEach(() => {
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    Sefaria.apiRequestWithBody.mockImplementation((url, params, payload, method) => {
      if (method === 'GET') {
        return Promise.resolve(okResponse({ entry: { headword: 'שָׁמַר', content: { senses: [] } }, content_attr_names: ['content'] }));
      }
      return Promise.resolve(patchResponse());
    });
  });
  afterEach(() => { alertSpy.mockRestore(); });

  test('editing via the JSON editor updates the value that would be saved', async () => {
    await mount('BDB, שָׁמַר');
    mutate();
    expect(editorData()).toEqual({ content: { senses: [] }, notes: 'edited via fake editor' });
  });

  test('Save PATCHes the entry URL with {content: <current draft>}', async () => {
    await mount('BDB, שָׁמַר');
    mutate();

    await clickSave();

    expect(Sefaria.apiRequestWithBody).toHaveBeenCalledWith(
      ENTRY_URL, null, { content: { content: { senses: [] }, notes: 'edited via fake editor' } }, 'PATCH', false
    );
  });

  test('shows the generic "Saved." message on success', async () => {
    await mount('BDB, שָׁמַר');

    await clickSave();

    expect(container.textContent).toContain('Saved.');
  });

  test('a 4xx/409 response alerts the server\'s specific message and does not show a success message', async () => {
    Sefaria.apiRequestWithBody.mockImplementation((url, params, payload, method) =>
      Promise.resolve(method === 'GET'
        ? okResponse({ entry: { headword: 'שָׁמַר', content: { senses: [] } }, content_attr_names: ['content'] })
        : errorResponse('nope')));
    await mount('BDB, שָׁמַר');

    await clickSave();

    expect(alertSpy).toHaveBeenCalledWith('nope');
    expect(container.textContent).not.toContain('Saved.');
  });
});
