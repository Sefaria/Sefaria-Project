/** Render every browse page in English and Hebrew through the real App shell. */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../../strings';
import '../../routes';
import App from '../../App';
import { setLang } from '../../i18n';
import { setPersona } from '../../persona';
import { _resetStore, flush } from '../../store';
import { _resetOverlays } from '../../overlays';
import { navigate } from '../../router';
import { collections } from '../data';
import { seedSefaria, settle } from './fixtures';

let container;
beforeAll(() => { window.scrollTo = jest.fn(); });
beforeEach(() => {
  seedSefaria(); _resetStore(); _resetOverlays(); localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); setLang('en'); jest.restoreAllMocks(); });

const render = async (path, { lang = 'en', persona = 'newcomer' } = {}) => {
  setLang(lang); setPersona(persona);
  await act(async () => { ReactDOM.render(<App props={{}} />, container); });
  // the router caches its last match: move the document and tell it, as the browser would
  await act(async () => { window.history.replaceState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); await settle(); await settle(); });
};
const text = (sel) => (container.querySelector(sel) || { textContent: '' }).textContent.trim();
const all = (sel) => Array.from(container.querySelectorAll(sel));
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('home', () => {
  test('newcomer, English: modules in persona order, start-here path, explore last', async () => {
    await render('/', { persona: 'newcomer' });
    expect(text('main h1')).toBe('Welcome to the Library');
    expect(document.title).toBe('Home | Sefaria Library');
    expect(all('.ln-module').map(m => m.dataset.module)).toEqual(['startHere', 'parashaExplained', 'glossary', 'fiveMinuteReads', 'calendarToday', 'explore']);
    expect(all('.ln-path-step')).toHaveLength(6);
    expect(container.querySelector('.ln-path-step a').getAttribute('href')).toBe('/Genesis.1');
    expect(text('.ln-parasha-name')).toBe('Bereshit');
    expect(text('.ln-progress-pill')).toBe('0 of 6 done');
    click(container.querySelector('.ln-path-done'));
    expect(text('.ln-progress-pill')).toBe('1 of 6 done');
    expect(container.querySelector('.ln-path-step').classList.contains('is-done')).toBe(true);
    expect(all('.ln-cat-tile')).toHaveLength(2);
  });

  test('learner, Hebrew: continue reading, plans + streak, recommendations based on history', async () => {
    collections.history().put({ ref: 'Genesis 3', title: 'Genesis', ts: Date.now() });
    collections.streak().put({ date: new Date().toISOString().slice(0, 10) });
    await render('/', { lang: 'he', persona: 'learner' });
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(text('main h1')).toBe('ברוכים השבים');
    expect(all('.ln-module').map(m => m.dataset.module)).toEqual(['continueReading', 'plans', 'calendarToday', 'recommendations', 'topics', 'explore']);
    expect(text('.ln-ref-card-title')).toBe('Genesis 3');
    expect(text('.ln-streak-num')).toBe('1');
    expect(text('[data-module="recommendations"] .ln-module-sub')).toBe('על סמך הקריאה שלך');
    expect(all('[data-module="recommendations"] .ln-tile-title').map(e => e.textContent)).toEqual(['שמות · Exodus', 'איוב · Job']);
    expect(all('.ln-cal-row .ln-cal-name').map(e => e.textContent)).toEqual(['פרשת השבוע', 'דף יומי']);
  });

  test('educator and scholar modules', async () => {
    collections.lessons().put({ title: 'Unit 1', sources: [{ ref: 'Genesis 1' }], questions: [], handoutNotes: '' });
    await render('/', { persona: 'educator' });
    expect(all('.ln-module').map(m => m.dataset.module)).toEqual(['lessons', 'sourceCollections', 'buildLesson', 'parashaForClass', 'calendarToday', 'explore']);
    expect(text('.ln-plan-title')).toBe('Unit 1');
    click(all('[data-module="parashaForClass"] button').find(b => b.textContent === 'Add to lesson'));
    expect(collections.lessons().list()[0].sources.map(s => s.ref)).toEqual(['Genesis 1', 'Genesis 1:1-6:8']);
    expect(text('.ln-toast')).toBe('Added to “Unit 1”');
    collections.notebook().put({ ref: 'Genesis 1:1', versions: ['A', 'B'], text: 'note' });
    await render('/', { lang: 'he', persona: 'scholar' });
    expect(all('.ln-module').map(m => m.dataset.module)).toEqual(['notebook', 'recentRefs', 'comparisons', 'advancedSearch', 'calendarToday', 'explore']);
    expect(text('[data-module="comparisons"] .ln-ref-card-title')).toBe('Genesis 1:1');
    expect(text('[data-module="advancedSearch"] h2')).toBe('חיפוש מתקדם');
  });
});

describe('/texts and categories', () => {
  test('English newcomer: tiles with plain descriptions and where-to-start picks', async () => {
    await render('/texts', { persona: 'newcomer' });
    expect(text('main h1')).toBe('Browse texts');
    expect(all('.ln-cat-card .ln-cat-card-title').map(e => e.textContent)).toEqual(['Tanakh', 'Talmud']);
    expect(text('.ln-cat-card-desc')).toBe('Torah, Prophets, and Writings.');
    expect(container.querySelector('.ln-cat-card-start a').getAttribute('href')).toBe('/Genesis.1');
    expect(container.querySelector('.ln-cat-card-counts')).toBeNull();
  });

  test('Hebrew scholar: counts, no picks', async () => {
    await render('/texts', { lang: 'he', persona: 'scholar' });
    expect(text('main h1')).toBe('עיון בטקסטים');
    expect(all('.ln-cat-card-counts').map(e => e.textContent)).toEqual(['4 ספרים · 2 קטגוריות', 'ספר אחד · 1 קטגוריות']);
    expect(container.querySelector('.ln-cat-card-start')).toBeNull();
    expect(text('.ln-cat-card-title')).toBe('תנ"ך');
  });

  test('category page: breadcrumbs, subcategories, books with learner "add to plan"', async () => {
    await render('/texts/Tanakh/Torah', { persona: 'learner' });
    expect(document.title).toBe('Torah | Sefaria Library');
    expect(all('.ln-crumbs a').map(a => a.getAttribute('href'))).toEqual(['/texts', '/texts/Tanakh']);
    expect(all('.ln-book-row-title').map(e => e.textContent)).toEqual(['Genesis · בראשית', 'Exodus · שמות', 'Job · איוב']);
    expect(container.querySelector('.ln-book-row-link').getAttribute('href')).toBe('/Genesis');
    click(all('.ln-book-row-actions button')[1]);
    expect(collections.plans().list()[0].units).toEqual([{ ref: 'Exodus', label: 'Exodus', heLabel: 'שמות' }]);
    await render('/texts/Tanakh', { lang: 'he', persona: 'educator' });
    expect(all('.ln-cat-grid .ln-cat-card-title').map(e => e.textContent)).toEqual(['תורה · Torah', 'פרשנות · Commentary']);
    expect(container.querySelector('.ln-print')).not.toBeNull();
  });

  test('unknown category shows the path segment and a note', async () => {
    await render('/texts/Nope', { persona: 'newcomer' });
    expect(text('main h1')).toBe('Nope');
    expect(text('.ln-category .ln-muted')).toBe('This category is not in the library.');
  });
});

describe('book page', () => {
  test('Genesis, English newcomer: about, chapter grid, parasha tab, start reading, shelf', async () => {
    await render('/Genesis', { persona: 'newcomer' });
    expect(document.title).toBe('Genesis | Sefaria Library');
    expect(text('main h1')).toBe('Genesis');
    expect(all('.ln-section-cell').map(a => a.getAttribute('href'))).toEqual(['/Genesis.1', '/Genesis.2', '/Genesis.3']);
    expect(all('.ln-structs [role=tab]').map(b => b.textContent)).toEqual(['By Chapter', 'Parasha']);
    click(all('.ln-structs [role=tab]')[1]);
    expect(all('.ln-alt-title').map(a => a.getAttribute('href'))).toEqual(['/Genesis.1.1-6.8', '/Genesis.6.9-11.32']);
    expect(container.querySelector('.ln-book-actions .ln-btn-primary').getAttribute('href')).toBe('/Genesis.1');
    expect(text('.ln-meta dd')).toBe('Sinai/Canaan (c.1400 – c.400 BCE)');
    expect(container.querySelector('.ln-book-versions').tagName).toBe('DETAILS');
    click(all('.ln-book-actions button')[0]);
    expect(collections.shelf().list()[0].ref).toBe('Genesis');
    expect(text('.ln-book-actions button')).toBe('On your shelf');
  });

  test('Berakhot, Hebrew scholar: chapters structure with dapim, versions emphasised, era, published', async () => {
    collections.history().put({ ref: 'Berakhot 5a', title: 'Berakhot', ts: Date.now() });
    await render('/Berakhot', { lang: 'he', persona: 'scholar' });
    expect(text('main h1')).toBe('ברכות');
    expect(container.querySelector('.ln-structs')).toBeNull();   // schema excluded: a single structure, no tabs
    expect(all('.ln-section-cell').map(a => a.textContent)).toEqual(['ב.', 'ב:', 'ג.', 'ג:']);
    expect(container.querySelector('.ln-book-actions .ln-btn-primary').getAttribute('href')).toBe('/Berakhot.5a');
    expect(container.querySelector('.ln-book-versions').tagName).toBe('SECTION');
    expect(all('.ln-version-title').map(e => e.textContent)).toEqual(['תנ"ך מנוקד', 'The Holy Scriptures', 'Bible en français [fr]']);
    expect(all('.ln-meta dt').map(e => e.textContent)).toEqual(['נדפס לראשונה', 'תקופה']);
    expect(all('.ln-meta dd')[1].textContent).toBe('אמוראים');
  });

  test('complex book renders the schema tree; unknown book says so', async () => {
    await render('/Pesach_Haggadah', { persona: 'learner' });
    expect(all('.ln-schema-row.is-leaf > a').map(a => a.getAttribute('href'))).toEqual(['/Pesach_Haggadah,_Kadesh', '/Pesach_Haggadah,_Magid,_Ha_Lachma_Anya', '/Pesach_Haggadah,_Magid,_Dayenu']);
    expect(all('.ln-book-actions button').map(b => b.textContent)).toEqual(['Save to shelf', 'Add to plan']);
    await render('/Bereshit', { persona: 'learner' });
    expect(text('.ln-book .ln-muted')).toBe('No book by that name.');
  });
});

describe('/calendars', () => {
  test('English learner: all schedules, follow creates a plan with a simulated reminder', async () => {
    await render('/calendars', { persona: 'learner' });
    expect(text('main h1')).toBe('Learning schedules');
    expect(all('.ln-cal-card-title').map(e => e.textContent)).toEqual(['Parashat Hashavua', 'Haftarah', 'Daf Yomi', 'Chok LeYisrael']);
    expect(all('.ln-cal-card')[3].querySelector('a.ln-btn').getAttribute('href')).toBe('/collections/x?tag=Bereshit');
    const follow = all('.ln-cal-card')[2].querySelector('button');
    click(follow);
    expect(collections.plans().list()[0]).toMatchObject({ calendar: 'Daf Yomi', reminders: true });
    expect(text('.ln-following')).toBe('Following');
    expect(text('.ln-reminder .ln-badge-simulated')).toBe('Simulated');
    click(container.querySelector('.ln-reminder input'));
    expect(collections.plans().list()[0].reminders).toBe(false);
  });

  test('Hebrew newcomer and educator', async () => {
    await render('/calendars', { lang: 'he', persona: 'newcomer' });
    expect(text('main h1')).toBe('לוחות לימוד');
    expect(text('.ln-cal-card .ln-small.ln-muted')).toBe('פרשת השבוע הנקראת בבית הכנסת; כל התורה בכל שנה.');
    expect(all('.ln-cal-card button').map(b => b.textContent)).toEqual(['מעקב אחרי הלוח', 'מעקב אחרי הלוח', 'מעקב אחרי הלוח', 'מעקב אחרי הלוח']);
    await render('/calendars', { persona: 'educator' });
    expect(all('.ln-cal-card button').map(b => b.textContent)).toEqual(['Add to lesson', 'Add to lesson', 'Add to lesson']);
  });
});

test('navigation between browse routes stays in the SPA', async () => {
  await render('/texts', { persona: 'newcomer' });
  act(() => { navigate('/Genesis'); });
  await act(async () => { await settle(); });
  expect(text('main h1')).toBe('Genesis');
  act(() => { navigate('/calendars'); });
  await act(async () => { await settle(); });
  expect(text('main h1')).toBe('Learning schedules');
  act(() => { navigate('/Genesis.1'); });
  expect(text('main h1')).toBe('Genesis 1');   // the reader's ref route owns section refs
});
