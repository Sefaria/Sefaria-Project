import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { PERSONAS, PERSONA_IDS, getPersona, getChosenPersona, setPersona, clearPersona, usePersona, getPersonaDef } from '../persona';
import { getContentLang, setContentLang, clearContentLang, useContentLang, CONTENT_LANGS } from '../contentLang';
import { _resetStore } from '../store';

beforeEach(() => { _resetStore(); localStorage.clear(); });

test('four personas with complete bilingual definitions', () => {
  expect(PERSONA_IDS).toEqual(['newcomer', 'learner', 'educator', 'scholar']);
  for (const id of PERSONA_IDS) {
    const def = PERSONAS[id];
    expect(def.id).toBe(id);
    expect(def.label.en && def.label.he).toBeTruthy();
    expect(def.tagline.en && def.tagline.he).toBeTruthy();
    expect(CONTENT_LANGS).toContain(def.contentLang);
    expect(def.homeModules.length).toBeGreaterThan(2);
    expect(def.readerTools.length).toBeGreaterThan(1);
  }
});

test('unset means newcomer but not chosen; set persists; invalid rejected', () => {
  expect(getChosenPersona()).toBeNull();
  expect(getPersona()).toBe('newcomer');
  setPersona('scholar');
  expect(getChosenPersona()).toBe('scholar');
  expect(getPersonaDef().contentLang).toBe('he');
  expect(() => setPersona('wizard')).toThrow();
  clearPersona();
  expect(getPersona()).toBe('newcomer');
});

test('content language follows the persona until chosen explicitly', () => {
  expect(getContentLang()).toBe('en');          // newcomer default
  setPersona('learner');
  expect(getContentLang()).toBe('bi');
  setContentLang('he');
  expect(getContentLang()).toBe('he');
  setPersona('newcomer');
  expect(getContentLang()).toBe('he');          // explicit choice sticks
  clearContentLang();
  expect(getContentLang()).toBe('en');
  expect(() => setContentLang('fr')).toThrow();
});

test('usePersona and useContentLang re-render together', () => {
  const container = document.createElement('div');
  function Probe() {
    const { persona, def, chosen } = usePersona();
    const [contentLang] = useContentLang();
    return <span>{persona}/{def.label.en}/{String(chosen)}/{contentLang}</span>;
  }
  act(() => { ReactDOM.render(<Probe />, container); });
  expect(container.textContent).toBe('newcomer/Newcomer/false/en');
  act(() => { setPersona('educator'); });
  expect(container.textContent).toBe('educator/Educator/true/bi');
  act(() => { setContentLang('en'); });
  expect(container.textContent).toBe('educator/Educator/true/en');
  ReactDOM.unmountComponentAtNode(container);
});
