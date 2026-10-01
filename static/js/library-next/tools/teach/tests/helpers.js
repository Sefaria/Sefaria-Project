/** Shared render harness for the tool tests: mounts <App/> at a reader URL with mocked Sefaria calls (pattern from reader/tests/ReaderPage.test.jsx). */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../../../../sefaria/sefaria';
import '../../../strings';
import '../../../routes';
import App from '../../../App';
import { setLang } from '../../../i18n';
import { setPersona } from '../../../persona';
import { _resetStore } from '../../../store';
import { _resetOverlays } from '../../../overlays';
import genesis from '../../../reader/tests/fixtures/genesis1.json';
import berakhot from '../../../reader/tests/fixtures/berakhot2a.json';
import links from '../../../reader/tests/fixtures/links.json';
import indexGenesis from '../../../reader/tests/fixtures/indexGenesis.json';

export { genesis, berakhot, links };
export const flush = () => new Promise(r => setTimeout(r, 0));

const TEXTS = { 'Genesis 1': genesis, 'Berakhot 2a': berakhot };

export function setup({ getText } = {}) {
  let container;
  beforeAll(() => {
    window.scrollTo = jest.fn();
    window.scrollBy = jest.fn();
    Sefaria.virtualBooks = Sefaria.virtualBooks || [];
  });
  beforeEach(() => {
    _resetStore(); _resetOverlays(); localStorage.clear();
    jest.spyOn(Sefaria, 'getText').mockImplementation((ref, settings = {}) => {
      if (getText) { const r = getText(ref, settings); if (r) { return r; } }
      if (TEXTS[ref]) { return Promise.resolve(TEXTS[ref]); }
      return Promise.resolve({ ref, he: `<b>${ref}</b> עברית`, text: `${ref} english`, versions: [] });
    });
    jest.spyOn(Sefaria, 'getLinks').mockImplementation(() => Promise.resolve(links));
    jest.spyOn(Sefaria, 'getIndexDetails').mockImplementation(() => Promise.resolve(indexGenesis));
    jest.spyOn(Sefaria, 'getIndexDetailsFromCache').mockImplementation(() => null);
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    jest.restoreAllMocks();
    setLang('en');
  });
  const $ = sel => container.querySelector(sel);
  const $$ = sel => Array.from(container.querySelectorAll(sel));
  const text = sel => ($(sel) ? $(sel).textContent.trim() : null);
  const click = async (el, init = {}) => act(async () => {
    if (!el) { throw new Error('click: element not found'); }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })); await flush(); });
  const type = async (el, value) => act(async () => {
    const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await flush(); });
  const check = async (el) => click(el);
  const open = async (path, { lang = 'english', persona = 'educator' } = {}) => {
    setLang(lang);
    setPersona(persona);
    window.history.replaceState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await act(async () => { ReactDOM.render(<App props={{ interfaceLang: lang }} />, container); await flush(); });
  };
  /** Open the page, click segment `n` (1-based), then the tool button. Returns the panel element. */
  const openTool = async (path, toolId, { lang, persona, segment = 1 } = {}) => {
    await open(path, { lang, persona });
    await click($$('.ln-seg')[segment - 1]);
    await click($(`[data-tool="${toolId}"]`));
    await act(async () => { await flush(); await flush(); });
    return $(`.ln-reader-panel[data-tool="${toolId}"]`);
  };
  const byText = (sel, re) => $$(sel).find(el => re.test(el.textContent));
  return { get container() { return container; }, $, $$, text, click, type, check, open, openTool, byText, flush };
}
