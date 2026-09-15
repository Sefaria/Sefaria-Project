/**
 * LexiconEntryEditBox: the shared identity-resolution wrapper and save-state hook used by
 * both LexiconHeadwordEditBox and LexiconContentEditBox.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/tests/searchResultCardAuxClick.test.js.
 */

jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    ref: jest.fn(),
    getIndexDetails: jest.fn(),
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

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../sefaria/sefaria';
import LexiconEntryEditBox, { resolveLexiconEntryRef, useLexiconEntrySave } from '../LexiconEntryEditBox';

let container = null;

function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { ReactDOM.render(el, container); });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  if (container) unmount();
});

describe('resolveLexiconEntryRef', () => {
  test('returns null when Sefaria.ref finds nothing', async () => {
    Sefaria.ref.mockReturnValue(null);
    expect(await resolveLexiconEntryRef('some ref')).toBeNull();
    expect(Sefaria.getIndexDetails).not.toHaveBeenCalled();
  });

  test('returns null when the ref is not a dictionary entry', async () => {
    Sefaria.ref.mockReturnValue({ categories: ['Tanakh'], indexTitle: 'Genesis', sectionRef: 'Genesis 1:1' });
    expect(await resolveLexiconEntryRef('Genesis 1:1')).toBeNull();
    expect(Sefaria.getIndexDetails).not.toHaveBeenCalled();
  });

  test('resolves lexiconName and headword for a real dictionary ref', async () => {
    Sefaria.ref.mockReturnValue({ categories: ['Reference', 'Dictionary'], indexTitle: 'BDB', sectionRef: 'BDB, שָׁמַר' });
    Sefaria.getIndexDetails.mockResolvedValue({ lexiconName: 'BDB Dictionary' });

    const identity = await resolveLexiconEntryRef('BDB, שָׁמַר');

    expect(Sefaria.getIndexDetails).toHaveBeenCalledWith('BDB');
    expect(identity).toEqual({ lexiconName: 'BDB Dictionary', headword: 'שָׁמַר' });
  });

  test('returns null when the Index record has no lexiconName', async () => {
    Sefaria.ref.mockReturnValue({ categories: ['Dictionary'], indexTitle: 'BDB', sectionRef: 'BDB, שָׁמַר' });
    Sefaria.getIndexDetails.mockResolvedValue({});
    expect(await resolveLexiconEntryRef('BDB, שָׁמַר')).toBeNull();
  });
});

describe('useLexiconEntrySave', () => {
  let hookApi;
  function Harness({ initialValue }) {
    hookApi = useLexiconEntrySave(initialValue);
    return null;
  }

  test('initializes value from initialValue', () => {
    mount(React.createElement(Harness, { initialValue: 'alpha' }));
    expect(hookApi.value).toBe('alpha');
    expect(hookApi.saving).toBe(false);
    expect(hookApi.message).toBeNull();
  });

  test('setValue updates value locally', () => {
    mount(React.createElement(Harness, { initialValue: 'alpha' }));
    act(() => { hookApi.setValue('beta'); });
    expect(hookApi.value).toBe('beta');
  });

  test('a changed initialValue resets value and clears any message', () => {
    mount(React.createElement(Harness, { initialValue: 'alpha' }));
    act(() => { hookApi.setValue('typed but not saved'); });

    act(() => { ReactDOM.render(React.createElement(Harness, { initialValue: 'beta' }), container); });

    expect(hookApi.value).toBe('beta');
    expect(hookApi.message).toBeNull();
  });

  test('save PATCHes the given url/payload and stores formatMessage\'s result', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ headword: 'saved-value' });
    mount(React.createElement(Harness, { initialValue: 'alpha' }));

    let returned;
    await act(async () => {
      returned = await hookApi.save('/api/x', { a: 1 }, (data) => ({ en: `got ${data.headword}`, he: 'x' }));
    });

    expect(Sefaria.apiRequestWithBodyAndAlert).toHaveBeenCalledWith('/api/x', null, { a: 1 }, 'PATCH');
    expect(hookApi.message).toEqual({ en: 'got saved-value', he: 'x' });
    expect(hookApi.saving).toBe(false);
    expect(returned).toEqual({ headword: 'saved-value' });
  });

  test('save without formatMessage falls back to a generic "Saved." message', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ ok: true });
    mount(React.createElement(Harness, { initialValue: 'alpha' }));

    await act(async () => { await hookApi.save('/api/x', {}); });

    expect(hookApi.message).toEqual({ en: 'Saved.', he: 'נשמר.' });
  });

  test('a rejected save leaves message untouched, resets saving, and does not throw', async () => {
    // apiRequestWithBodyAndAlert already alerts the user itself before rejecting.
    Sefaria.apiRequestWithBodyAndAlert.mockRejectedValue(new Error('server said no'));
    mount(React.createElement(Harness, { initialValue: 'alpha' }));

    let returned = 'not set';
    await act(async () => {
      returned = await hookApi.save('/api/x', {});
    });

    expect(returned).toBeNull();
    expect(hookApi.message).toBeNull();
    expect(hookApi.saving).toBe(false);
  });
});

describe('LexiconEntryEditBox', () => {
  test('shows a loading state before resolution settles', async () => {
    Sefaria.ref.mockReturnValue(null); // resolves to null, but not yet awaited
    mount(React.createElement(LexiconEntryEditBox, { currentlyVisibleRef: 'Genesis 1:1', children: () => null }));
    expect(container.textContent).toBe('loading');
    // resolveLexiconEntryRef is async, so even a synchronous `return null` inside it settles
    // on a microtask -- flush it here so the pending .then(setIdentity) doesn't fire outside
    // any act() later, once this test's own act() block has already closed.
    await act(async () => {});
  });

  test('renders the "not available" message when the ref is not a dictionary entry', async () => {
    Sefaria.ref.mockReturnValue({ categories: ['Tanakh'], indexTitle: 'Genesis', sectionRef: 'Genesis 1:1' });
    await act(async () => {
      mount(React.createElement(LexiconEntryEditBox, { currentlyVisibleRef: 'Genesis 1:1', children: () => null }));
    });
    expect(container.textContent).toContain('This tool is only available while viewing a lexicon entry.');
  });

  test('renders the lexicon name and passes the resolved identity to children', async () => {
    Sefaria.ref.mockReturnValue({ categories: ['Dictionary'], indexTitle: 'BDB', sectionRef: 'BDB, שָׁמַר' });
    Sefaria.getIndexDetails.mockResolvedValue({ lexiconName: 'BDB Dictionary' });
    const childrenSpy = jest.fn(() => 'entry-form');

    await act(async () => {
      mount(React.createElement(LexiconEntryEditBox, { currentlyVisibleRef: 'BDB, שָׁמַר', children: childrenSpy }));
    });

    expect(container.textContent).toContain('BDB Dictionary');
    expect(container.textContent).toContain('entry-form');
    expect(childrenSpy).toHaveBeenCalledWith({ lexiconName: 'BDB Dictionary', headword: 'שָׁמַר' });
  });

  test('re-resolves when currentlyVisibleRef changes', async () => {
    Sefaria.ref.mockReturnValue({ categories: ['Dictionary'], indexTitle: 'BDB', sectionRef: 'BDB, שָׁמַר' });
    Sefaria.getIndexDetails.mockResolvedValue({ lexiconName: 'BDB Dictionary' });
    await act(async () => {
      mount(React.createElement(LexiconEntryEditBox, { currentlyVisibleRef: 'BDB, שָׁמַר', children: (id) => id.headword }));
    });
    expect(container.textContent).toContain('שָׁמַר');

    Sefaria.ref.mockReturnValue({ categories: ['Dictionary'], indexTitle: 'BDB', sectionRef: 'BDB, אָב' });
    await act(async () => {
      ReactDOM.render(
        React.createElement(LexiconEntryEditBox, { currentlyVisibleRef: 'BDB, אָב', children: (id) => id.headword }),
        container
      );
    });
    expect(container.textContent).toContain('אָב');
  });
});
