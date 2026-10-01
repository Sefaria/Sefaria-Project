/* Testing done using Jest */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

// Misc.jsx imports CSS, which Jest has no transform for.
jest.mock('../Misc.jsx', () => ({
  InterfaceText: ({children}) => children || null,
}));
jest.mock('../sefaria/util', () => ({
  __esModule: true,
  default: {focusFirstElement: () => {}, trapFocusWithTab: () => {}, handleRadioKeyDown: () => {}},
}));
jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {_: key => key, _siteSettings: {TORAH_SPECIFIC: true}},
}));

/* eslint-disable import/first */
import {ReaderPanelContext} from '../context';
import ReaderDisplayOptionsMenu from '../ReaderDisplayOptionsMenu';
/* eslint-enable import/first */

// ReaderDisplayOptionsMenu relies on webpack's ProvidePlugin for the React global.
global.React = React;

let container = null;
const mount = context => {
  container = document.createElement('div');
  document.body.appendChild(container);
  const value = {
    language: 'bilingual', setOption: () => {}, panelMode: 'Text', textsData: {he: ['א'], text: ['a'], book: 'Siddur Sefard'},
    layout: 'stacked', width: 1000, panelPosition: 0, ...context,
  };
  act(() => {
    ReactDOM.render(<ReaderPanelContext.Provider value={value}><ReaderDisplayOptionsMenu/></ReaderPanelContext.Provider>, container);
  });
};
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
});

const modeGroup = () => container.querySelector('.siddur-mode-buttons');

describe('Siddur Mode / Learning Mode toggle', () => {
  test('is the first row of the display options menu on a siddur, styled like the language toggle', () => {
    mount({siddurMode: 'siddur', setSiddurMode: () => {}});
    const menu = container.querySelector('.texts-properties-menu');
    expect(menu.firstElementChild).toBe(modeGroup());
    expect(modeGroup().classList.contains('show-source-translation-buttons')).toBe(true);
    expect([...modeGroup().querySelectorAll('input[type=radio]')].map(i => i.value)).toEqual(['Siddur Mode', 'Learning Mode']);
    expect(modeGroup().querySelector('input:checked').value).toBe('Siddur Mode');
  });
  test('reflects Learning Mode and reports a switch', () => {
    const setSiddurMode = jest.fn();
    mount({siddurMode: 'learning', setSiddurMode});
    expect(modeGroup().querySelector('input:checked').value).toBe('Learning Mode');
    act(() => { modeGroup().querySelector('input[value="Siddur Mode"]').click(); });
    expect(setSiddurMode).toHaveBeenCalledWith('siddur');
  });
  test('is absent on other books', () => {
    mount({siddurMode: null, setSiddurMode: () => {}, textsData: {he: ['א'], text: ['a'], book: 'Genesis'}});
    expect(modeGroup()).toBe(null);
    expect(container.querySelector('.show-source-translation-buttons')).not.toBe(null);
  });
});
