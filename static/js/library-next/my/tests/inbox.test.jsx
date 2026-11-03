/**
 * The discover inbox lists (planInbox, lessonInbox, notebookInbox, savedSearches) drain into the
 * hub pages: one tap folds an item into a plan / lesson / notebook entry and removes it.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../../strings';
import '../../routes';
import MyHub from '../MyHub';
import Sefaria from '../../../sefaria/sefaria';
import { setLang } from '../../i18n';
import { setPersona } from '../../persona';
import { _resetStore, kv } from '../../store';
import { _resetOverlays, useOverlays } from '../../overlays';
import { collection, createLesson, createPlan } from '../collections';
import { addToLessonInbox, addToPlanInbox, addToNotebookInbox, saveSearch } from '../../discover/personaActions';
import { inboxTitle, topicSourceRefs, INBOX } from '../inbox';

jest.mock('../data', () => ({
  refUrl: (ref) => `/${String(ref).replace(/ /g, '_').replace(/:/g, '.')}`,
  categoryColor: () => '#000',
  fetchPreview: jest.fn(async (ref) => ({ ref, heRef: `he:${ref}`, he: 'בְּרֵאשִׁית בָּרָא', en: `In the beginning of ${ref}`, category: 'Tanakh', indexTitle: 'Genesis', versionTitle: 'JPS', heVersionTitle: '', versions: [] })),
  fetchIndex: jest.fn(async () => { throw new Error('Unknown'); }),
  fetchCalendars: jest.fn(async () => []),
  suggestBooks: jest.fn(async () => []),
}));

const TOPIC = { slug: 'shabbat', primaryTitle: { en: 'Shabbat', he: 'שבת' }, tabs: { 'notable-sources': { refs: [
  { ref: 'Exodus 20:8', order: { curatedPrimacy: { en: 1 } } }, { ref: 'Genesis 2:1', order: { curatedPrimacy: { en: 5 } } }, { ref: 'Shabbat 2a', order: {} },
] } } };

let container;
beforeAll(() => { window.scrollTo = jest.fn(); });
beforeEach(() => {
  _resetStore(); _resetOverlays(); localStorage.clear();
  window.history.replaceState({}, '', '/my');
  container = document.createElement('div');
  document.body.appendChild(container);
  Sefaria.getTopic = jest.fn(async (slug) => (slug === 'shabbat' ? TOPIC : { slug, tabs: {} }));
});
afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); setLang('en'); });

/** The Shell renders toasts; here a probe exposes the newest toast text as `.ln-toast`. */
function ToastProbe() {
  const { toasts } = useOverlays();
  return toasts.length ? <div className="ln-toast">{toasts[toasts.length - 1].text}</div> : null;
}
const render = (rest = '', { lang = 'en', persona = 'learner' } = {}) => {
  act(() => { setLang(lang); setPersona(persona); });
  window.history.replaceState({}, '', `/my${rest ? `/${rest}` : ''}`);
  act(() => { ReactDOM.render(<><MyHub params={{ rest }} pathname={`/my/${rest}`} query={{}} /><ToastProbe /></>, container); });
};
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => Array.from(container.querySelectorAll(sel));
const text = (sel) => ($(sel) ? $(sel).textContent.trim() : null);
const clickAsync = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); });
const byText = (sel, re) => $$(sel).find(el => re.test(el.textContent.trim()));

test('inbox helpers: titles for ref and topic items, notable sources of a topic (curated first)', async () => {
  expect(inboxTitle({ kind: 'ref', ref: 'Genesis 1:1', heRef: 'בראשית א׳:א׳' }, 'he')).toBe('בראשית א׳:א׳');
  expect(inboxTitle({ kind: 'ref', ref: 'Genesis 1:1' }, 'he')).toBe('Genesis 1:1');
  expect(inboxTitle({ kind: 'topic', topic: 'shabbat', title: { en: 'Shabbat', he: 'שבת' } }, 'he')).toBe('שבת');
  expect(inboxTitle({ kind: 'topic', topic: 'moses', title: 'Moses' }, 'en')).toBe('Moses');
  expect(await topicSourceRefs('shabbat', { limit: 2 })).toEqual(['Genesis 2:1', 'Exodus 20:8']);
  expect(await topicSourceRefs('nothing')).toEqual([]);
  Sefaria.getTopic = jest.fn(() => Promise.reject(new Error('down')));
  expect(await topicSourceRefs('shabbat')).toEqual([]);
});

test('plans: a ref item becomes a unit of the newest plan, a topic item adds its notable sources, dismiss removes', async () => {
  addToPlanInbox({ topic: 'shabbat', title: { en: 'Shabbat', he: 'שבת' } });
  addToPlanInbox({ ref: 'Genesis 1:1', heRef: 'בראשית א׳:א׳' });
  render('plans');
  expect(text('.ln-my-inbox .ln-section-title')).toBe('Waiting from search and topics 2');
  expect($$('.ln-my-inbox-item .ln-my-row-title').map(e => e.textContent)).toEqual(['Genesis 1:1', 'Shabbat']);
  expect($('.ln-my-inbox-item a[href="/topics/shabbat"]')).not.toBeNull();
  await clickAsync($$('.ln-my-inbox-actions .ln-btn-primary')[0]);                 // the ref: a new plan
  let plans = collection('plans').list();
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({ title: 'From search and topics', units: [{ ref: 'Genesis 1:1', heLabel: 'בראשית א׳:א׳' }] });
  expect(kv.get(INBOX.plan).map(x => x.topic)).toEqual(['shabbat']);
  expect(text('.ln-toast')).toBe('Added');
  await clickAsync($('.ln-my-inbox-actions .ln-btn-primary'));                       // the topic: its sources into the same plan
  plans = collection('plans').list();
  expect(plans).toHaveLength(1);
  expect(plans[0].units.map(u => u.ref)).toEqual(['Genesis 1:1', 'Genesis 2:1', 'Exodus 20:8', 'Shabbat 2a']);
  expect(kv.get(INBOX.plan)).toEqual([]);
  expect($('.ln-my-inbox')).toBeNull();
  addToPlanInbox({ ref: 'Genesis 1:2' });
  await clickAsync($('.ln-my-inbox-actions .ln-icon-button'));                       // dismiss
  expect(kv.get(INBOX.plan)).toEqual([]);
  expect(collection('plans').list()[0].units).toHaveLength(4);
});

test('plans: "Add all" drains every item; a topic without sources stays', async () => {
  addToPlanInbox({ topic: 'empty', title: 'Empty' });
  addToPlanInbox({ ref: 'Genesis 1:3' });
  addToPlanInbox({ ref: 'Genesis 1:4' });
  render('plans', { lang: 'he' });
  expect(text('.ln-my-inbox .ln-section-title')).toBe('ממתינים מחיפוש ומנושאים 3');
  await clickAsync(byText('.ln-my-inbox .ln-btn', /^הוספת הכול$/));
  expect(collection('plans').list()[0].units.map(u => u.ref)).toEqual(['Genesis 1:4', 'Genesis 1:3']);
  expect(kv.get(INBOX.plan).map(x => x.topic)).toEqual(['empty']);
});

test('lessons: list drains into the newest lesson with fetched text; the editor drains into the open lesson', async () => {
  addToLessonInbox({ ref: 'Genesis 1:3', heRef: 'בראשית א׳:ג׳', snippet: 'Let there be light', q: 'light', from: 'search' });
  render('lessons', { persona: 'educator' });
  expect(text('.ln-my-inbox-snippet')).toBe('Let there be light');
  expect(text('.ln-my-inbox-main .ln-small.ln-muted')).toBe('from the search “light”');
  await clickAsync($('.ln-my-inbox-actions .ln-btn-primary'));
  let lessons = collection('lessons').list();
  expect(lessons).toHaveLength(1);
  expect(lessons[0].title).toBe('From search and topics');
  expect(lessons[0].sources[0]).toMatchObject({ ref: 'Genesis 1:3', heTitle: 'he:Genesis 1:3', en: 'In the beginning of Genesis 1:3', category: 'Tanakh' });
  expect(kv.get(INBOX.lesson)).toEqual([]);

  const mine = createLesson({ title: 'Creation' });
  addToLessonInbox({ topic: 'shabbat', title: { en: 'Shabbat', he: 'שבת' }, from: 'topic' });
  render(`lessons/${mine.id}`, { persona: 'educator' });
  expect(text('.ln-my-inbox .ln-btn-primary')).toBe('Add to this lesson');
  await clickAsync($('.ln-my-inbox .ln-btn-primary'));
  lessons = collection('lessons').list();
  const saved = lessons.find(l => l.id === mine.id);
  expect(saved.sources.map(s => s.ref)).toEqual(['Genesis 2:1', 'Exodus 20:8', 'Shabbat 2a']);
  expect(lessons.find(l => l.title === 'From search and topics').sources).toHaveLength(1);   // untouched
  expect(text('.ln-toast')).toBe('3 added');
  expect($$('.ln-my-source')).toHaveLength(3);
});

test('notebook: a topic item becomes an entry linking to the topic with its citation; a ref item an entry for the ref', async () => {
  addToNotebookInbox({ topic: 'moses', title: { en: 'Moses', he: 'משה' }, citation: 'Moses. Sefaria. https://www.sefaria.org/topics/moses', text: 'The prophet.' });
  addToNotebookInbox({ ref: 'Exodus 2:1', heRef: 'שמות ב׳:א׳', snippet: 'A man went' });
  render('notebook', { persona: 'scholar' });
  await clickAsync($$('.ln-my-inbox-actions .ln-btn-primary')[1]);   // Moses (older, second)
  await clickAsync($$('.ln-my-inbox-actions .ln-btn-primary')[0]);   // Exodus
  const entries = collection('notebook').list();
  expect(entries).toHaveLength(2);
  expect(entries.find(e => e.ref === 'topics/moses')).toMatchObject({ title: 'Moses', heTitle: 'משה', text: 'The prophet.', citation: 'Moses. Sefaria. https://www.sefaria.org/topics/moses' });
  expect(entries.find(e => e.ref === 'Exodus 2:1')).toMatchObject({ heTitle: 'שמות ב׳:א׳', text: 'A man went' });
  expect(kv.get(INBOX.notebook)).toEqual([]);
  expect($$('.ln-my-entry')).toHaveLength(2);
  expect($('.ln-my-entry a[href="/topics/moses"]')).not.toBeNull();
});

test('overview lists saved searches with a forget button', async () => {
  saveSearch({ url: '/search?q=light&exact=1', q: 'light', exact: true, sort: 'relevance', paths: [] });
  saveSearch({ url: '/search?q=dark', q: 'dark' });
  render('');
  expect($$('#my-searches ~ ul a').map(a => [a.getAttribute('href'), a.textContent])).toEqual([['/search?q=dark', 'dark'], ['/search?q=light&exact=1', 'light · exact']]);
  await clickAsync($('#my-searches ~ ul .ln-icon-button'));
  expect(kv.get(INBOX.searches).map(s => s.q)).toEqual(['light']);
  render('', { lang: 'he' });
  expect(text('#my-searches')).toBe('חיפושים שמורים');
});
