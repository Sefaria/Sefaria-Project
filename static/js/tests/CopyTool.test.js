/* Testing done using Jest */
// No React Testing Library in this repo -- react-dom directly, as in auth/tests.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../sefaria/sefaria';
import { CopyToolDialog, CopyToolMenu } from '../CopyTool';

// Misc.jsx pulls in CSS imports Jest can't parse; only InterfaceText is needed.
jest.mock('../Misc', () => {
  const React = require('react');
  const Sefaria = require('../sefaria/sefaria').default;
  return {InterfaceText: ({children}) => React.createElement('span', null, Sefaria._(children))};
});

const fixture = require('../sefaria/tests/fixtures/copyToolGenesis1.json');
const segment = (section) => ({
  ...section, ref: 'Genesis 1:1', heRef: 'בראשית א׳:א׳', sections: ['1', '1'], toSections: ['1', '1'],
  versions: [{...section.versions[0], text: section.versions[0].text[0]}],
});
const target = {
  ref: 'Genesis 1:1', word: 'God', wordLang: 'translation',
  versions: {source: null, translation: null}, shown: {source: true, translation: true},
};
const readBlob = (blob) => new Promise(resolve => {
  const reader = new FileReader();  // jsdom's Blob has no .text()
  reader.onload = () => resolve(reader.result);
  reader.readAsText(blob);
});
const flush = () => act(() => new Promise(r => setTimeout(r, 0)));

let container;
beforeEach(() => {
  window.localStorage.clear();
  Sefaria.interfaceLang = 'english';
  jest.spyOn(Sefaria, 'normRef').mockImplementation(r => r.replace(/[ :]/g, '.'));
  jest.spyOn(Sefaria.util, 'fullURL').mockImplementation(path => path);  // no module domains in tests
  jest.spyOn(Sefaria, 'getVersions').mockResolvedValue({he: [fixture.he.versions[0]], en: [fixture.en.versions[0]]});
  jest.spyOn(Sefaria, '_getVersionObjects').mockResolvedValue([{languageFamilyName: 'primary'}, {languageFamilyName: 'translation'}]);
  jest.spyOn(Sefaria, '_ApiPromise').mockImplementation(url => {
    const section = url.includes('version=hebrew') ? fixture.he : fixture.en;
    return Promise.resolve(url.includes('/Genesis.1.1?') ? segment(section) : section);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  jest.restoreAllMocks();
});

const radio = (name, value) => container.querySelector(`input[name="${name}"][value="${value}"]`);

test('dialog loads, previews both languages, and copies with the chosen settings', async () => {
  const onCopied = jest.fn();
  let written = null;
  window.ClipboardItem = function (items) { this.items = items; };
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
    write: async ([item]) => { written = await item.items['text/html'].then(readBlob); },
  }});

  act(() => { ReactDOM.render(<CopyToolDialog target={target} onClose={() => {}} onCopied={onCopied} />, container); });
  await flush(); await flush();

  expect(container.querySelector('#copyToolTitle').textContent).toContain('Genesis 1:1');
  expect(Array.from(container.querySelectorAll('input[name="copyToolLevel"]')).map(i => i.parentElement.textContent))
    .toEqual(['Word', 'Verse', 'Chapter']);
  expect(container.querySelectorAll('.copyToolVersionSelect').length).toBe(2);
  expect(container.querySelector('.copyToolPreview').innerHTML).toContain('dir="rtl"');
  expect(radio('copyToolNotes', 'omit')).not.toBe(null);    // JPS has footnotes
  expect(radio('copyToolVowels', 'all')).not.toBe(null);    // Miqra has nikkud

  act(() => { radio('copyToolLevel', 'section').click(); });
  await flush();
  expect(container.querySelector('#copyToolTitle').textContent).toContain('Genesis 1');
  expect(container.querySelectorAll('.copyToolPreview p[dir]').length).toBe(4);

  act(() => { radio('copyToolLevel', 'word').click(); });
  await flush();
  const [sourceBox, translationBox] = container.querySelectorAll('.copyToolLanguage input[type="checkbox"]');
  expect([sourceBox.checked, sourceBox.disabled, translationBox.checked]).toEqual([false, true, true]);

  act(() => { radio('copyToolLevel', 'segment').click(); });
  await flush();
  const copyButton = Array.from(container.querySelectorAll('.copyToolButtons button')).pop();
  await act(async () => { copyButton.click(); });
  await flush(); await flush();
  expect(written).toContain('When God began to create');
  expect(onCopied).toHaveBeenCalledWith(expect.objectContaining({level: 'segment', format: 'formatted', citation: true}));
  expect(onCopied.mock.calls[0][0].versions).toBeUndefined();
});

test('menu hides "previous settings" until there are some', () => {
  const props = {x: 10, y: 10, onCopyPrevious: () => {}, onCopyDialog: () => {}, onClose: () => {}};
  act(() => { ReactDOM.render(<CopyToolMenu {...props} showPrevious={false} />, container); });
  expect(container.querySelectorAll('button').length).toBe(1);
  act(() => { ReactDOM.render(<CopyToolMenu {...props} showPrevious={true} />, container); });
  expect(container.querySelectorAll('button').length).toBe(2);
});
