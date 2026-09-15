/**
 * LexiconHeadwordEditBox: the moderator headword-rename tool. Mounts through the real
 * LexiconEntryEditBox/useLexiconEntrySave (already covered in lexiconEntryEditBox.test.js),
 * so these tests focus on what's specific here: URL/payload shape, the disabled-Save rules,
 * and the "adjusted from" vs plain "Saved as" message choice.
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
import LexiconHeadwordEditBox from '../LexiconHeadwordEditBox';

let container = null;

async function mount(currentlyVisibleRef) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    ReactDOM.render(React.createElement(LexiconHeadwordEditBox, { currentlyVisibleRef }), container);
  });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

const input = () => container.querySelector('.lexiconEditHeadwordInput');
const saveButton = () => container.querySelector('button.button');
const typeHeadword = (text) => act(() => {
  const el = input();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const clickSave = async () => act(async () => { saveButton().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

beforeEach(() => {
  jest.clearAllMocks();
  Sefaria.ref.mockReturnValue({ categories: ['Dictionary'], indexTitle: 'BDB', sectionRef: 'BDB, שָׁמַר' });
  Sefaria.getIndexDetails.mockResolvedValue({ lexiconName: 'BDB Dictionary' });
});

afterEach(() => {
  if (container) unmount();
});

describe('initial render', () => {
  test('shows the current headword and pre-fills the input with it', async () => {
    await mount('BDB, שָׁמַר');
    expect(container.textContent).toContain('שָׁמַר');
    expect(input().value).toBe('שָׁמַר');
  });

  test('Save starts disabled (input unchanged from current headword)', async () => {
    await mount('BDB, שָׁמַר');
    expect(saveButton().disabled).toBe(true);
  });
});

describe('enabling Save', () => {
  test('typing a different headword enables Save', async () => {
    await mount('BDB, שָׁמַר');
    typeHeadword('שָׁמוּר');
    expect(saveButton().disabled).toBe(false);
  });

  test('clearing the input back out disables Save again', async () => {
    await mount('BDB, שָׁמַר');
    typeHeadword('');
    expect(saveButton().disabled).toBe(true);
  });

  test('retyping the same headword disables Save again', async () => {
    await mount('BDB, שָׁמַר');
    typeHeadword('שָׁמוּר');
    typeHeadword('שָׁמַר');
    expect(saveButton().disabled).toBe(true);
  });
});

describe('saving', () => {
  test('PATCHes headword/{lexicon}/{current headword} with the typed value', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ headword: 'שָׁמוּר' });
    await mount('BDB, שָׁמַר');
    typeHeadword('שָׁמוּר');

    await clickSave();

    expect(Sefaria.apiRequestWithBodyAndAlert).toHaveBeenCalledWith(
      `/api/lexicon-entry/headword/${encodeURIComponent('BDB Dictionary')}/${encodeURIComponent('שָׁמַר')}`,
      null, { new_headword: 'שָׁמוּר' }, 'PATCH'
    );
  });

  test('shows a plain "Saved as" message when the server kept the typed headword as-is', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ headword: 'שָׁמוּר' });
    await mount('BDB, שָׁמַר');
    typeHeadword('שָׁמוּר');

    await clickSave();

    expect(container.textContent).toContain('Saved as "שָׁמוּר".');
    expect(container.textContent).not.toContain('adjusted');
  });

  test('shows an "adjusted from" message when the server returned a different headword', async () => {
    // e.g. get_available_lexicon_headword resolved a collision with a superscript, or
    // normalized the typed value -- either way the response headword differs from what
    // was typed.
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ headword: 'שָׁמוּר²' });
    await mount('BDB, שָׁמַר');
    typeHeadword('שָׁמוּר');

    await clickSave();

    expect(container.textContent).toContain('Saved as "שָׁמוּר²" (adjusted from "שָׁמוּר").');
  });

  test('updates the displayed current headword after a successful save', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockResolvedValue({ headword: 'שָׁמוּר' });
    await mount('BDB, שָׁמַר');
    typeHeadword('שָׁמוּר');

    await clickSave();

    expect(container.textContent).toContain('שָׁמוּר');
    // Save is disabled again since the input now matches the (updated) current headword.
    expect(saveButton().disabled).toBe(true);
  });

  test('a failed save (already alerted by apiRequestWithBodyAndAlert) leaves the headword unchanged', async () => {
    Sefaria.apiRequestWithBodyAndAlert.mockRejectedValue(new Error('collision'));
    await mount('BDB, שָׁמַר');
    typeHeadword('שָׁמוּר');

    await clickSave();

    expect(container.textContent).not.toContain('Saved as');
    // The current-headword display still reads the original value, not the failed attempt.
    expect(container.querySelector('.lexiconEditCurrentHeadword').textContent).toBe('שָׁמַר');
  });
});
