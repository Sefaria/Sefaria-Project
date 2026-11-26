import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../strings';
import { setLang } from '../i18n';
import { OnboardingDialog, openOnboarding } from '../Onboarding';
import { getChosenPersona } from '../persona';
import { isModalOpen, closeModal, _resetOverlays } from '../overlays';
import { _resetStore } from '../store';

let container;
beforeEach(() => {
  _resetStore(); _resetOverlays(); localStorage.clear(); setLang('en');
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); });

const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

test('renders the four personas and the question in English', () => {
  act(() => { ReactDOM.render(<OnboardingDialog />, container); });
  expect(container.querySelector('h2').textContent).toBe('Who are you learning as today?');
  const cards = container.querySelectorAll('.ln-persona-card');
  expect(cards).toHaveLength(4);
  expect([...cards].map(c => c.dataset.persona)).toEqual(['newcomer', 'learner', 'educator', 'scholar']);
  expect(cards[3].textContent).toContain('Scholar');
});

test('renders in Hebrew', () => {
  setLang('he');
  act(() => { ReactDOM.render(<OnboardingDialog />, container); });
  expect(container.querySelector('h2').textContent).toBe('בתור מי לומדים היום?');
  expect(container.querySelector('.ln-persona-card[data-persona=educator]').textContent).toContain('מורה');
});

test('choosing stores the persona and closes; skipping picks newcomer', () => {
  openOnboarding();
  expect(isModalOpen()).toBe(true);
  act(() => { ReactDOM.render(<OnboardingDialog />, container); });
  click(container.querySelector('.ln-persona-card[data-persona=learner]'));
  expect(getChosenPersona()).toBe('learner');
  expect(isModalOpen()).toBe(false);

  _resetStore(); localStorage.clear();
  openOnboarding();
  click(container.querySelector('.ln-btn-quiet'));
  expect(getChosenPersona()).toBe('newcomer');
  expect(isModalOpen()).toBe(false);
});

test('dismissing without choosing also lands on newcomer', () => {
  openOnboarding();
  closeModal();
  expect(getChosenPersona()).toBe('newcomer');
});
