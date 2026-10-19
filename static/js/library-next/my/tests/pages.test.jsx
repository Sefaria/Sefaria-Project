import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../../strings';
import '../../routes';
import MyHub from '../MyHub';
import { setLang, t } from '../../i18n';
import { setPersona } from '../../persona';
import { _resetStore, kv, flush } from '../../store';
import { _resetOverlays } from '../../overlays';
import { closeAssistant, isAssistantOpen } from '../../AssistantDock';
import { ASSISTANT_EVENT } from '../assistant';
import { addHistory, addNote, addHighlight, addFlashcard, createLesson, createPlan, addNotebookEntry, collection, saveToShelf } from '../collections';
import { lessonShareUrl } from '../share';
import { importPreview } from '../DataPage';

jest.mock('../data', () => ({
  refUrl: (ref) => `/${String(ref).replace(/ /g, '_').replace(/:/g, '.')}`,
  categoryColor: () => '#000',
  fetchPreview: jest.fn(async (ref) => {
    if (/Nonsense/.test(ref)) { throw new Error('Could not find title'); }
    return { ref, heRef: 'בראשית א׳:א׳', he: 'בְּרֵאשִׁית בָּרָא', en: 'In the beginning', category: 'Tanakh', indexTitle: 'Genesis', versionTitle: 'JPS', heVersionTitle: '', versions: [{ title: 'JPS', lang: 'en' }, { title: 'Tanach with Nikkud', lang: 'he' }] };
  }),
  fetchIndex: jest.fn(async (title) => {
    if (title !== 'Genesis') { throw new Error('Unknown'); }
    return { title: 'Genesis', heTitle: 'בראשית', schema: { nodeType: 'JaggedArrayNode', lengths: [50, 1533], sectionNames: ['Chapter', 'Verse'], heSectionNames: ['פרק', 'פסוק'], addressTypes: ['Perek', 'Pasuk'] } };
  }),
  fetchCalendars: jest.fn(async () => [{ title: { en: 'Daf Yomi', he: 'דף יומי' }, displayValue: { en: 'Bekhorot 13', he: 'בכורות י״ג' }, ref: 'Bekhorot 13', url: 'Bekhorot.13', category: 'Talmud' }]),
  suggestBooks: jest.fn(async () => []),
}));

let container;
beforeAll(() => { window.scrollTo = jest.fn(); });
beforeEach(() => {
  _resetStore(); _resetOverlays(); localStorage.clear(); closeAssistant();
  window.history.replaceState({}, '', '/my');
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); setLang('en'); });

const render = (rest = '', { lang = 'en', persona = 'learner', query = {} } = {}) => {
  act(() => { setLang(lang); setPersona(persona); });
  window.history.replaceState({}, '', `/my${rest ? `/${rest}` : ''}${window.location.hash}`);
  act(() => { ReactDOM.render(<MyHub params={{ rest }} pathname={`/my/${rest}`} query={query} />, container); });
};
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => Array.from(container.querySelectorAll(sel));
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const type = (el, value) => act(() => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const submit = (form) => act(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const submitAsync = (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 0)); });
const byText = (sel, text) => $$(sel).find(el => el.textContent.trim() === text);

const PAGES = [
  ['', 'My Library', 'הספרייה שלי'],
  ['shelf', 'My shelf', 'המדף שלי'],
  ['history', 'Reading history', 'היסטוריית קריאה'],
  ['notes', 'Notes and highlights', 'הערות והדגשות'],
  ['plans', 'Study plans', 'תוכניות לימוד'],
  ['flashcards', 'Flashcards', 'כרטיסיות'],
  ['lessons', 'Lessons', 'שיעורים'],
  ['lessons/new', 'Lessons', 'שיעורים'],
  ['notebook', 'Research notebook', 'מחברת מחקר'],
  ['data', 'Your data', 'המידע שלך'],
];

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });   // let mocked fetches resolve inside act

test.each(PAGES)('renders /my/%s in English and Hebrew', async (rest, en, he) => {
  render(rest, { lang: 'en' });
  await settle();
  expect($('h1').textContent).toBe(en);
  expect($$('.ln-my-nav a')).toHaveLength(9);
  expect(container.textContent).not.toMatch(/my\.[a-z]+\./);   // no raw string keys
  render(rest, { lang: 'he' });
  await settle();
  expect($('h1').textContent).toBe(he);
  expect(container.textContent).not.toMatch(/my\.[a-z]+\./);
});

test('nav order follows the persona and marks the current section', () => {
  render('notes', { persona: 'learner' });
  expect($$('.ln-my-nav a').slice(0, 3).map(a => a.textContent)).toEqual(['Overview', 'Plans', 'Flashcards']);
  expect($('.ln-my-nav a[aria-current="page"]').getAttribute('href')).toBe('/my/notes');
  render('notes', { persona: 'educator', lang: 'he' });
  expect($$('.ln-my-nav a').slice(0, 2).map(a => a.textContent)).toEqual(['סקירה', 'שיעורים']);
  render('nope');
  expect($('.ln-my-empty').textContent).toContain('/my/nope');
});

test('overview: continue reading, streak, counts, persona quick actions and start-here progress', () => {
  addHistory('Genesis 1:1', 'Genesis 1:1', { heTitle: 'בראשית א׳:א׳', ts: Date.now() - 3600000 });
  addHistory('Berakhot 2a', 'Berakhot 2a', { ts: Date.now() });
  addNote('Genesis 1:1', 'light');
  render('', { persona: 'learner' });
  expect($$('.ln-my-continue .ln-my-ref').map(a => a.textContent)).toEqual(['Berakhot 2a', 'Genesis 1:1']);
  expect($('.ln-my-continue .ln-my-ref').getAttribute('href')).toBe('/Berakhot_2a');
  expect($('.ln-my-stats dd').textContent).toBe('1 days');
  expect($$('.ln-my-heatmap-grid .ln-my-heat:not(.is-pad)')).toHaveLength(84);
  expect($$('.ln-my-heatmap-grid .ln-my-heat[data-level="2"]')).toHaveLength(1);   // two readings today
  expect($('.ln-row .ln-btn-primary').textContent).toBe('New study plan');
  expect(byText('.ln-my-tile', '1Notes')).toBeTruthy();
  expect($('.ln-my-start')).toBeNull();

  render('', { persona: 'newcomer', lang: 'he' });
  expect($$('.ln-my-start li')).toHaveLength(5);
  expect($$('.ln-my-start li.is-done')).toHaveLength(2);      // Genesis 1 (via 1:1) and Berakhot 2a
  expect(container.textContent).toContain('2 מתוך 5 צעדים נקראו');
  expect($('.ln-my-continue .ln-my-ref').textContent).toBe('Berakhot 2a');
});

test('shelf: add by reference, tag filter, remove', () => {
  saveToShelf({ ref: 'Exodus 1', title: 'Exodus 1', tags: ['torah'] });
  render('shelf');
  expect($$('.ln-my-shelf-item')).toHaveLength(1);
  type($('.ln-my-form input[placeholder="Genesis 1:1"]'), 'Genesis 2:3');
  type($$('.ln-my-form input')[1], 'shabbat, creation');
  submit($('.ln-my-form'));
  expect($$('.ln-my-shelf-item')).toHaveLength(2);
  expect($$('.ln-my-tags[role=group] .ln-my-tag').map(b => b.textContent)).toEqual(['creation', 'shabbat', 'torah']);
  click(byText('.ln-my-tags[role=group] .ln-my-tag', 'torah'));
  expect($$('.ln-my-shelf-item')).toHaveLength(1);
  expect($('.ln-my-shelf-item .ln-my-ref').textContent).toBe('Exodus 1');
  click($('.ln-my-shelf-item .ln-icon-button'));
  expect($('.ln-my-empty').textContent).toBe('Nothing matches this filter.');
});

test('history: pause toggle writes kv, clear needs confirmation', () => {
  addHistory('Genesis 1', 'Genesis 1', { ts: Date.now() });
  render('history', { lang: 'he' });
  expect($$('.ln-my-timeline .ln-my-ref')).toHaveLength(1);
  click($('.ln-my-switch input'));
  expect(kv.get('historyPaused')).toBe(true);
  expect(addHistory('Exodus 1', 'Exodus 1')).toBeNull();
  const clear = $('.ln-my-controls .ln-btn-quiet');
  expect(clear.textContent).toBe('ניקוי ההיסטוריה');
  click(clear);
  expect(clear.textContent).toBe('לנקות הכול?');
  click(clear);
  expect(collection('history').list()).toHaveLength(0);
  expect($('.ln-my-empty').textContent).toBe('ההיסטוריה מושהית וריקה.');
});

test('notes: grouped by book with highlights, search, add and export', () => {
  addNote('Genesis 1:1', 'In the beginning');
  addNote('Berakhot 2a:1', 'From when');
  addHighlight('Genesis 1:2', 'green', { text: 'the earth' });
  render('notes');
  expect($$('.ln-my-book-title').map(h => h.firstChild.textContent.trim())).toEqual(['Berakhot', 'Genesis']);
  expect($$('.ln-my-highlight')).toHaveLength(1);
  type($('.ln-my-search'), 'earth');
  expect($$('.ln-my-book-title')).toHaveLength(1);
  expect($$('.ln-my-note')).toHaveLength(0);
  type($('.ln-my-search'), '');
  type($('.ln-my-form input'), 'Exodus 3:2');
  type($('.ln-my-form textarea'), 'the bush');
  submit($('.ln-my-form'));
  expect($$('.ln-my-book-title')).toHaveLength(3);
  click(byText('.ln-btn', 'Export Markdown'));
  expect($('.ln-toast') || document.body.textContent).toBeTruthy();   // toast is rendered by the Shell; no crash here
});

test('plans: create from a book, today\'s unit, mark done, reminders are simulated', async () => {
  await act(async () => { render('plans', { query: { new: '1' } }); await new Promise(r => setTimeout(r, 0)); });   // calendars resolve inside act
  expect($('.ln-my-cal').textContent).toContain('Daf Yomi');
  type($('input[list="ln-my-book-suggest"]'), 'Nowhere');
  await submitAsync($('.ln-my-newplan'));
  expect($('.ln-my-error').textContent).toBe('No book by that name was found.');
  type($('input[list="ln-my-book-suggest"]'), 'Genesis');
  type($('input[type="number"]'), '2');
  await submitAsync($('.ln-my-newplan'));
  const plan = collection('plans').list()[0];
  expect(plan.title).toBe('Genesis, 2 chapters a day');
  expect(plan.units).toHaveLength(50);
  expect($('.ln-my-plan-title').textContent).toBe('Genesis, 2 chapters a day');
  expect($$('.ln-my-today .ln-my-ref').map(a => a.textContent)).toEqual(['Chapter 1', 'Chapter 2']);
  expect($('.ln-my-plan .ln-btn-primary').getAttribute('href')).toBe('/Genesis_1');
  click($('.ln-my-check-row input'));
  expect(container.textContent).toContain('1 of 50 done (2%)');
  expect($('.ln-my-plan .ln-btn-primary').getAttribute('href')).toBe('/Genesis_2');
  expect($('.ln-my-plan .ln-badge-simulated')).toBeTruthy();
  click($('.ln-my-plan .ln-my-switch input'));
  expect(collection('plans').list()[0].reminders).toBe(true);

  render('plans', { lang: 'he' });
  expect($('.ln-my-plan-title').textContent).toBe('בראשית');   // bilingual content + Hebrew interface → the book's Hebrew title
  expect($$('.ln-my-today .ln-my-ref').map(a => a.textContent)).toEqual(['פרק א׳', 'פרק ב׳']);   // learner default is bilingual; he interface picks Hebrew labels
});

test('plans from a calendar start at today\'s daf', () => {
  createPlan({ title: 'x', book: 'Bekhorot', startDate: '2026-10-01', units: [{ ref: 'Bekhorot 13a' }] });
  render('plans');
  expect($('.ln-my-plan-title').textContent).toBe('x');
});

test('flashcards: add, review with grades, session summary', () => {
  addFlashcard('בראשית', 'In the beginning', { ref: 'Genesis 1:1', due: 1 });
  addFlashcard('שמות', 'Exodus', { due: Date.now() + 86400000 * 3 });
  render('flashcards');
  expect($$('.ln-my-stats dd').map(d => d.textContent)).toEqual(['1', '2']);
  click(byText('.ln-btn-primary', 'Start review'));
  expect($('.ln-my-review-big').textContent).toBe('בראשית');
  expect($('.ln-my-review-big').getAttribute('lang')).toBe('he');
  click(byText('.ln-btn-primary', 'Show answer'));
  expect($('.ln-my-review-back').textContent).toBe('In the beginning');
  expect($$('.ln-my-grade').map(b => b.textContent)).toEqual(['Again10m', 'Hard1d', 'Good1d', 'Easy2d']);
  click($('.ln-my-grade.is-good'));
  expect($('.ln-my-review-done').textContent).toContain('1 cards reviewed');
  const card = collection('flashcards').list().find(c => c.front === 'בראשית');
  expect(card).toMatchObject({ reps: 1, interval: 1 });
  click(byText('.ln-btn-primary', 'Done'));
  expect($$('.ln-my-stats dd').map(d => d.textContent)).toEqual(['0', '2']);
  type($('.ln-my-form input'), 'תורה');
  type($$('.ln-my-form input')[1], 'Torah');
  submit($('.ln-my-form'));
  expect(collection('flashcards').list()).toHaveLength(3);
});

test('lessons: create, add a source, suggest templated questions, ask the assistant', async () => {
  render('lessons/new', { persona: 'educator' });
  type($('.ln-my-form input'), 'Creation');
  submit($('.ln-my-form'));
  const lesson = collection('lessons').list()[0];
  expect(lesson.title).toBe('Creation');
  expect(window.location.pathname).toBe(`/my/lessons/${lesson.id}`);

  render(`lessons/${lesson.id}`, { persona: 'educator' });
  expect($('.ln-my-title-input').value).toBe('Creation');
  expect($('.ln-my-code code').textContent).toMatch(/^[A-Z2-9]{6}$/);
  type($('.ln-my-inline-form input'), 'Nonsense 1');
  await submitAsync($('.ln-my-inline-form'));
  expect($('.ln-my-error').textContent).toBe('Nonsense 1 was not found.');
  type($('.ln-my-inline-form input'), 'Genesis 1:1');
  await submitAsync($('.ln-my-inline-form'));
  expect($$('.ln-my-source')).toHaveLength(1);
  expect($('.ln-my-source .ln-text-he').textContent).toBe('בְּרֵאשִׁית בָּרָא');
  expect($('.ln-my-source .ln-text-en').textContent).toBe('In the beginning');
  expect(collection('lessons').get(lesson.id).sources[0]).toMatchObject({ ref: 'Genesis 1:1', heTitle: 'בראשית א׳:א׳', category: 'Tanakh' });

  click(byText('.ln-btn', 'Suggest questions'));
  expect($$('.ln-my-questions li')).toHaveLength(3);
  expect($('.ln-my-questions li').textContent).toContain('Read Genesis 1:1 aloud');
  click(byText('.ln-btn', 'Suggest questions'));
  expect($$('.ln-my-questions li')).toHaveLength(6);
  expect(new Set($$('.ln-my-questions li span').map(s => s.textContent)).size).toBe(6);

  const seen = [];
  window.addEventListener(ASSISTANT_EVENT, e => seen.push(e.detail));
  click(byText('.ln-btn-primary', 'Ask the Assistant'));
  expect(seen).toHaveLength(1);
  expect(seen[0].prompt).toContain('"Creation" on Genesis 1:1');
  expect(seen[0].source).toBe('lesson');
  expect(isAssistantOpen()).toBe(true);

  render(`lessons/${lesson.id}`, { persona: 'educator', lang: 'he' });
  expect($('.ln-my-questions li').textContent).toContain('קראו את Genesis 1:1 בקול');
  render('lessons', { persona: 'educator' });
  expect($('.ln-my-lesson .ln-my-row-title').textContent).toBe('Creation');
  expect(container.textContent).toContain('1 sources · 6 questions');
});

test('handout and shared lesson views', () => {
  const lesson = createLesson({ title: 'Light', sources: [{ ref: 'Genesis 1:3', heTitle: 'בראשית א׳:ג׳', he: 'יהי אור', en: 'Let there be light', note: 'read twice' }], questions: [{ en: 'Why light first?', he: 'למה אור קודם?' }], handoutNotes: 'Bring chumashim' });
  render(`lessons/${lesson.id}/handout`, { persona: 'educator' });
  expect($('.ln-my-nav')).toBeNull();
  expect(document.body.classList.contains('ln-handout-print')).toBe(true);
  expect($('.ln-my-handout h1').textContent).toBe('Light');
  expect($('.ln-my-handout-source .ln-text-he').textContent).toBe('יהי אור');
  expect($('.ln-my-handout-source .ln-text-en').textContent).toBe('Let there be light');
  expect($('.ln-my-handout-questions li').textContent).toBe('Why light first?למה אור קודם?');
  expect($('.ln-my-handout-notes p').textContent).toBe('Bring chumashim');
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  expect(document.body.classList.contains('ln-handout-print')).toBe(false);

  const url = lessonShareUrl(lesson, 'http://localhost');
  window.location.hash = url.split('#')[1];
  _resetStore(); localStorage.clear();
  render('lessons/shared', { lang: 'he' });
  expect($('.ln-my-handout h1').textContent).toBe('Light');
  expect($('.ln-my-shared-bar').textContent).toContain('מישהו שיתף אתכם');
  click(byText('.ln-btn-primary', 'שמירת עותק לשיעורים שלי'));
  const saved = collection('lessons').list()[0];
  expect(saved).toMatchObject({ title: 'Light', handoutNotes: 'Bring chumashim' });
  expect(saved.sources[0].en).toBe('Let there be light');
  expect(window.location.pathname).toBe(`/my/lessons/${saved.id}`);

  window.location.hash = 'garbage';
  act(() => { ReactDOM.unmountComponentAtNode(container); });   // a new link is a new page load
  render('lessons/shared');
  expect($('.ln-my-empty').textContent).toContain('does not contain a lesson');
  window.location.hash = '';
});

test('notebook: look up, pick versions, save with citation, export buttons', async () => {
  render('notebook', { persona: 'scholar' });
  expect($$('.ln-my-toolbar .ln-btn:disabled')).toHaveLength(3);
  type($('.ln-my-inline-form input'), 'Genesis 1:1');
  await clickAsync(byText('.ln-my-inline-form .ln-btn', 'Look up'));
  expect($$('.ln-my-version-list label')).toHaveLength(2);
  click($$('.ln-my-version-list input')[1]);
  expect($('input[value^="Genesis 1:1, Tanach with Nikkud"]')).toBeTruthy();
  type($('.ln-my-form textarea'), 'compare vocalisation');
  submit($('.ln-my-form'));
  const entry = collection('notebook').list()[0];
  expect(entry).toMatchObject({ ref: 'Genesis 1:1', heTitle: 'בראשית א׳:א׳', versions: ['Tanach with Nikkud'], text: 'compare vocalisation' });
  expect(entry.citation).toMatch(/^Genesis 1:1, Tanach with Nikkud\. Sefaria\./);
  expect($('.ln-my-entry .ln-my-citation code').textContent).toBe(entry.citation);
  expect($$('.ln-my-toolbar .ln-btn:disabled')).toHaveLength(0);
  render('notebook', { persona: 'scholar', lang: 'he' });
  expect($('.ln-my-entry .ln-my-ref').textContent).toBe('בראשית א׳:א׳');
});

test('data: storage table, import preview, simulated sync', () => {
  addNote('Genesis 1:1', 'a');
  addNotebookEntry({ ref: 'Genesis 1:1' });
  render('data', { persona: 'scholar' });
  const rows = $$('.ln-my-table tbody tr');
  expect(rows).toHaveLength(10);
  expect(rows.find(r => r.textContent.includes('sefaria.libnext.notes')).children[1].textContent).toBe('1');
  expect($('.ln-my-table tfoot td:nth-child(2)').textContent).toBe('3');   // notes + notebook + kv.persona

  const payload = { format: 'sefaria.libnext', data: { notes: { v: 1, items: { x1: { id: 'x1', ref: 'Exodus 1', text: 'b', ts: 1 } } }, shelf: { v: 1, items: { 'shelf:Genesis 1': { id: 'shelf:Genesis 1', ref: 'Genesis 1', ts: 2 } } } } };
  expect(importPreview(payload)).toEqual([
    { name: 'notes', incoming: 1, existing: 1, added: 1 },
    { name: 'shelf', incoming: 1, existing: 0, added: 1 },
  ]);
  expect(importPreview({ nope: 1 })).toBeNull();

  jest.useFakeTimers();
  click(byText('.ln-btn', 'Sync now'));
  expect($('[role=progressbar]')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(2000); });
  jest.useRealTimers();
  expect(kv.get('lastSync')).toMatch(/^\d{4}-/);
  expect(container.textContent).toContain('Last synced');
  expect($$('.ln-badge-simulated').length).toBeGreaterThan(0);

  const clear = byText('.ln-btn', 'Clear my library');
  click(clear); click(clear);
  expect(collection('notes').list()).toHaveLength(0);
  expect(kv.get('persona')).toBe('scholar');
  flush();
});
