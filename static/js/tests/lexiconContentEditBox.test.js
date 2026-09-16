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
    apiRequestWithBodyAndAlert: jest.fn(),
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
    Sefaria.apiRequestWithBody.mockResolvedValue({
      entry: { headword: 'שָׁמַר', content: { senses: [] } },
      content_attr_names: ['content'],
    });

    await mount('BDB, שָׁמַר');

    expect(Sefaria.apiRequestWithBody).toHaveBeenCalledWith(ENTRY_URL, null, null, 'GET');
  });

  test('the draft includes only content_attr_names keys, skipping ones absent from entry', async () => {
    Sefaria.apiRequestWithBody.mockResolvedValue({
      // 'notes' is content-patchable per content_attr_names but this entry doesn't have one --
      // it must not appear in the draft as e.g. undefined.
      entry: { headword: 'שָׁמַר', content: { senses: [] }, parent_lexicon: 'BDB Dictionary' },
      content_attr_names: ['content', 'notes'],
    });

    await mount('BDB, שָׁמַר');

    expect(editorData()).toEqual({ content: { senses: [] } });
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
      resolveSecond({ entry: { headword: 'אָב', content: { senses: ['second'] } }, content_attr_names: ['content'] });
    });
    expect(editorData()).toEqual({ content: { senses: ['second'] } });

    // The first (stale) entry's GET finally resolves -- must not overwrite the current draft.
    await act(async () => {
      resolveFirst({ entry: { headword: 'שָׁמַר', content: { senses: ['first'] } }, content_attr_names: ['content'] });
    });
    expect(editorData()).toEqual({ content: { senses: ['second'] } });
  });
});

describe('editing and saving', () => {
  beforeEach(() => {
    Sefaria.apiRequestWithBody.mockResolvedValue({
      entry: { headword: 'שָׁמַר', content: { senses: [] } },
      content_attr_names: ['content'],
    });
  });

  test('editing via the JSON editor updates the value that would be saved', async () => {
    await mount('BDB, שָׁמַר');
    mutate();
    expect(editorData()).toEqual({ content: { senses: [] }, notes: 'edited via fake editor' });
  });

  test('Save PATCHes the entry URL with {content: <current draft>}', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ ok: true });
    await mount('BDB, שָׁמַר');
    mutate();

    await clickSave();

    expect(Sefaria.apiRequestWithBodyAndAlert).toHaveBeenCalledWith(
      ENTRY_URL, null, { content: { content: { senses: [] }, notes: 'edited via fake editor' } }, 'PATCH'
    );
  });

  test('shows the generic "Saved." message on success', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ ok: true });
    await mount('BDB, שָׁמַר');

    await clickSave();

    expect(container.textContent).toContain('Saved.');
  });

  test('a failed save (already alerted) does not show a success message', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockRejectedValue(new Error('nope'));
    await mount('BDB, שָׁמַר');

    await clickSave();

    expect(container.textContent).not.toContain('Saved.');
  });
});
