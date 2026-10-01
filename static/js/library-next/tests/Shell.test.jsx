import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../strings';
import '../routes';
import App from '../App';
import { setLang } from '../i18n';
import { setPersona } from '../persona';
import { toast, openModal, closeModal, _resetOverlays } from '../overlays';
import { toggleAssistant, closeAssistant } from '../AssistantDock';
import { navigate } from '../router';
import { _resetStore } from '../store';

let container;
beforeAll(() => { window.scrollTo = jest.fn(); });
beforeEach(() => {
  _resetStore(); _resetOverlays(); localStorage.clear(); closeAssistant();
  window.history.replaceState({}, '', '/texts');
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); setLang('en'); });

const render = (props = {}) => act(() => { ReactDOM.render(<App props={props} />, container); });

test('renders the shell in English with ltr and a placeholder page', () => {
  setLang('english');
  setPersona('learner');
  render({ interfaceLang: 'english' });
  const shell = container.querySelector('.ln-shell');
  expect(shell.getAttribute('dir')).toBe('ltr');
  expect(shell.getAttribute('lang')).toBe('en');
  expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  expect(container.querySelector('header .ln-nav').textContent).toBe('TextsTopicsLearning schedules');
  expect(container.querySelector('main h1').textContent).toBe('Browse texts');
  expect(container.querySelector('main .ln-placeholder-body').textContent).toBe('This part of Library Next is being built.');
  expect(container.querySelector('.ln-chip-label').textContent).toBe('Learner');
  expect(container.querySelector('.ln-segment.active').textContent).toBe('Both');
  expect(container.querySelector('.ln-my-link').getAttribute('href')).toBe('/my');
  expect(document.title).toBe('Browse texts | Sefaria Library');
  expect(container.querySelector('.ln-modal')).toBeNull();   // persona chosen: no onboarding
});

test('renders in Hebrew with rtl', () => {
  setLang('hebrew');
  setPersona('scholar');
  render({ interfaceLang: 'hebrew' });
  const shell = container.querySelector('.ln-shell');
  expect(shell.getAttribute('dir')).toBe('rtl');
  expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  expect(container.querySelector('main h1').textContent).toBe('עיון בטקסטים');
  expect(container.querySelector('.ln-chip-label').textContent).toBe('חוקר/ת');
  expect(container.querySelector('.ln-lang-toggle').textContent).toBe('English');
  expect(container.querySelector('.ln-logo img').getAttribute('src')).toContain('hebrew');
  expect(document.title).toBe('עיון בטקסטים | ספריית ספריא');
});

test('opens onboarding on first visit', () => {
  setLang('en');
  render({});
  const modal = container.querySelector('.ln-modal');
  expect(modal).not.toBeNull();
  expect(modal.querySelectorAll('.ln-persona-card')).toHaveLength(4);
});

test('routes: ref catch-all, not found, search query, my hub', () => {
  setLang('en'); setPersona('newcomer');
  render({});
  act(() => { navigate('/Genesis.1'); });
  expect(container.querySelector('main h1').textContent).toBe('Genesis.1');
  expect(document.title).toBe('Genesis.1 | Sefaria Library');
  act(() => { navigate('/search?q=light'); });
  expect(container.querySelector('#ln-search-input').value).toBe('light');
  act(() => { navigate('/my/notes'); });
  expect(container.querySelector('main h1').textContent).toBe('Notes and highlights');
  act(() => { window.history.replaceState({}, '', '/texts/Tanakh/Torah'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(container.querySelector('main h1').textContent).toBe('Browse texts');
  act(() => { window.history.replaceState({}, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(container.querySelector('main h1').textContent).toBe('Page not found');
});

test('toasts, modal and the assistant dock', () => {
  setLang('en'); setPersona('newcomer');
  render({});
  act(() => { toast('Saved', { duration: 0 }); });
  expect(container.querySelector('.ln-toast').textContent).toBe('Saved');
  act(() => { openModal(<p id="dlg">Hello</p>, { label: 'Test' }); });
  expect(container.querySelector('.ln-modal #dlg').textContent).toBe('Hello');
  expect(container.querySelector('.ln-modal').getAttribute('aria-label')).toBe('Test');
  act(() => { closeModal(); });
  expect(container.querySelector('.ln-modal')).toBeNull();
  const panel = container.querySelector('#ln-assistant-panel');
  expect(panel.classList.contains('is-open')).toBe(false);
  act(() => { toggleAssistant(); });
  expect(panel.classList.contains('is-open')).toBe(true);
  expect(panel.textContent).toContain('The assistant is being connected');
  expect(panel.querySelector('.ln-assistant-body').dataset.persona).toBe('newcomer');
  act(() => { closeAssistant(); });
  expect(panel.classList.contains('is-open')).toBe(false);
});

test('persona menu switches persona and shows a toast', () => {
  setLang('en'); setPersona('newcomer');
  render({});
  act(() => { container.querySelector('.ln-chip').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const items = container.querySelectorAll('.ln-menu [role=menuitemradio]');
  expect(items).toHaveLength(4);
  act(() => { items[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(container.querySelector('.ln-chip-label').textContent).toBe('Educator');
  expect(container.querySelector('.ln-toast').textContent).toBe('Now learning as Educator');
  expect(container.querySelector('.ln-menu')).toBeNull();
});
