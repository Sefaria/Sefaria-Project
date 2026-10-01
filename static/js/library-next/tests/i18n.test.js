import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import * as i18n from '../i18n';
import { addStrings, t, setLang, useT, pick, switchInterfaceLang, toShortLang, _resetStrings } from '../i18n';

beforeEach(() => {
  _resetStrings();
  setLang('en');
  addStrings({ hello: { en: 'Hello {name}', he: 'שלום {name}' }, onlyEn: { en: 'Only English' } });
});

test('t translates, interpolates and falls back', () => {
  expect(t('hello', { name: 'Ada' })).toBe('Hello Ada');
  setLang('hebrew');
  expect(t('hello', { name: 'עדה' })).toBe('שלום עדה');
  expect(t('onlyEn')).toBe('Only English');
  expect(t('missing.key')).toBe('missing.key');
  expect(t('hello')).toBe('שלום {name}');
});

test('lang and dir are live bindings and reach <html>', () => {
  expect(i18n.lang).toBe('en');
  expect(i18n.dir).toBe('ltr');
  setLang('he');
  expect(i18n.lang).toBe('he');
  expect(i18n.dir).toBe('rtl');
  expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  expect(document.documentElement.getAttribute('lang')).toBe('he');
  setLang('english');
  expect(document.documentElement.getAttribute('dir')).toBe('ltr');
});

test('toShortLang and pick', () => {
  expect(toShortLang('hebrew')).toBe('he');
  expect(toShortLang('english')).toBe('en');
  expect(toShortLang(undefined)).toBe('en');
  expect(pick({ en: 'Genesis', he: 'בראשית' })).toBe('Genesis');
  setLang('he');
  expect(pick({ en: 'Genesis', he: 'בראשית' })).toBe('בראשית');
  expect(pick({ en: 'Genesis' })).toBe('Genesis');
  expect(pick(null, '-')).toBe('-');
});

test('later addStrings win', () => {
  addStrings({ hello: { en: 'Hi {name}', he: 'היי {name}' } });
  expect(t('hello', { name: 'A' })).toBe('Hi A');
});

test('useT re-renders on language change', () => {
  const container = document.createElement('div');
  function Probe() { const { t, lang, dir } = useT(); return <span>{t('hello', { name: lang })}/{dir}</span>; }
  act(() => { ReactDOM.render(<Probe />, container); });
  expect(container.textContent).toBe('Hello en/ltr');
  act(() => { setLang('he'); });
  expect(container.textContent).toBe('שלום he/rtl');
  ReactDOM.unmountComponentAtNode(container);
});

test('switchInterfaceLang sets the classic cookie and reloads through /interface/', () => {
  const assign = jest.fn();
  const original = window.location;
  delete window.location;
  window.location = { ...original, assign, pathname: '/Genesis.1', search: '?lang=bi' };
  switchInterfaceLang('he');
  expect(document.cookie).toContain('interfaceLang=hebrew');
  expect(assign).toHaveBeenCalledWith('/interface/hebrew?next=%2FGenesis.1%3Flang%3Dbi');
  expect(i18n.lang).toBe('he');
  window.location = original;
});
