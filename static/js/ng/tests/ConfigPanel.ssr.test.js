/**
 * @jest-environment node
 *
 * The config panel under Node: the reader's server HTML is unaffected by it (the overlay is
 * closed and empty), and the panel itself renders without touching browser globals, in case
 * a future page ever server-renders it open.
 */
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {NgReaderApp, ngSetup, ngUnpackProps} from '../index';
import {NgReaderContext, OVERLAY} from '../context';
import ConfigPanel from '../panels/ConfigPanel';
import {DEFAULT_PANELS} from '../OverlaySlot';
import {sectionFromApi} from '../text';
import {initialSettingsFromProps} from '../settings';
import {strings} from '../strings';
import {fixture, SHARED_DATA} from './helpers';

function renderLikeNode(props) {
  ngSetup(SHARED_DATA, props);
  ngUnpackProps(props);
  return ReactDOMServer.renderToString(<NgReaderApp {...props} />);
}

let errors;
beforeEach(() => { errors = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => {
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

test('the real panel is registered in the config slot', () => {
  expect(DEFAULT_PANELS[OVERLAY.CONFIG]).toBe(ConfigPanel);
});

test('NgReaderApp server HTML: the overlay is closed and holds no panel', () => {
  for (const name of ['genesis-1', 'berakhot-2a']) {
    const html = renderLikeNode(fixture(name));
    expect(html).toContain('data-ng="overlay" data-overlay="none" hidden=""');
    expect(html).not.toContain('data-ng="panel-config"');
    expect(html).toContain('data-ng="header-settings"');
  }
});

test.each([['english'], ['hebrew']])('the panel renders to a string in Node (%s interface)', (interfaceLang) => {
  const props = fixture('genesis-1', {interfaceLang});
  ngSetup(SHARED_DATA, props);
  ngUnpackProps(props);
  const section = sectionFromApi(props.initialPanel.text);
  const api = {
    interfaceLang, strings: strings(interfaceLang), translationLanguagePreference: null,
    settings: initialSettingsFromProps(props), setSetting: () => {}, currentLayout: 'segmented',
    currVersions: {en: null, he: null}, setCurrVersions: () => Promise.resolve(),
    currentSection: section, currentSegment: null, currentUrl: '/Genesis.1?lang=bi',
  };
  const html = ReactDOMServer.renderToString(
    <NgReaderContext.Provider value={api}><ConfigPanel overlay={{type: OVERLAY.CONFIG}} onClose={() => {}} /></NgReaderContext.Provider>);
  expect(html).toContain('data-ng="panel-config"');
  expect(html).toContain('data-ng="setting-language-bilingual"');
  expect(html).toContain('href="/Genesis.1?lang=bi&amp;ng=0"');
  expect(html).toContain(interfaceLang === 'hebrew' ? 'הגדרות טקסט' : 'Text settings');
});
