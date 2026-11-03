import Sefaria from '../../../sefaria/sefaria';
import { _resetStore, flush } from '../../store';
import { setLang } from '../../i18n';
import '../strings';
import {
  countBooks, splitContents, topCategories, nodeTitle, recommendFromHistory, computeStreak, groupByTag, refPath, bookPath,
  categoryPath, splitCategoryPath, addToPlan, addToLesson, saveToShelf, followCalendar, followedCalendar, setCalendarReminder, collections, lastReadIn,
} from '../data';
import { seedSefaria, CALENDARS } from './fixtures';

beforeEach(() => { seedSefaria(); _resetStore(); localStorage.clear(); setLang('en'); });
afterEach(() => { jest.restoreAllMocks(); });

test('toc helpers: top categories skip hidden, counts recurse, contents split', () => {
  expect(topCategories().map(c => c.category)).toEqual(['Tanakh', 'Talmud']);
  expect(countBooks(Sefaria.toc[0])).toBe(4);
  expect(countBooks(Sefaria.toc[0].contents[0].contents[0])).toBe(1);
  const { categories, books } = splitContents(Sefaria.tocObjectByCategories(['Tanakh']));
  expect(categories.map(c => c.category)).toEqual(['Torah', 'Commentary']);
  expect(books).toEqual([]);
  expect(nodeTitle(Sefaria.toc[1])).toEqual({ en: 'Talmud', he: 'תלמוד' });
});

test('urls', () => {
  expect(bookPath('Rashi on Genesis')).toBe('/Rashi_on_Genesis');
  expect(refPath('Genesis 1:1')).toBe('/Genesis.1.1');
  expect(refPath('Berakhot 2a')).toBe('/Berakhot.2a');
  expect(categoryPath(['Tanakh', 'Jewish Thought'])).toBe('/texts/Tanakh/Jewish%20Thought');
  expect(splitCategoryPath('Tanakh/Jewish%20Thought')).toEqual(['Tanakh', 'Jewish Thought']);
});

test('recommendations: sibling books of what was read, unread only, in TOC order', () => {
  const history = [{ ref: 'Genesis 3', ts: 2 }, { ref: 'Berakhot 5a', ts: 1 }];
  expect(recommendFromHistory(history).map(b => b.title)).toEqual(['Exodus', 'Job']);
  expect(recommendFromHistory([])).toEqual([]);
  expect(recommendFromHistory([{ ref: 'Nothing 1' }])).toEqual([]);
  expect(recommendFromHistory(history, 1).map(b => b.title)).toEqual(['Exodus']);
});

test('streak: consecutive days ending today or yesterday', () => {
  const today = new Date('2026-10-01T12:00:00Z');
  expect(computeStreak([], today)).toBe(0);
  expect(computeStreak(['2026-10-01'], today)).toBe(1);
  expect(computeStreak(['2026-09-30', '2026-09-29'], today)).toBe(2);   // yesterday still counts
  expect(computeStreak(['2026-10-01', '2026-09-30', '2026-09-28'], today)).toBe(2);
  expect(computeStreak(['2026-09-20'], today)).toBe(0);
});

test('groupByTag', () => {
  const groups = groupByTag([{ ref: 'a', tags: ['x'] }, { ref: 'b', tags: ['x', 'y'] }, { ref: 'c' }]);
  expect(groups.map(g => [g.tag, g.items.length])).toEqual([['x', 2], ['y', 1]]);
});

test('addToPlan / addToLesson create one entry and append unique sources', () => {
  addToPlan({ ref: 'Genesis', title: 'Genesis' });
  addToPlan({ ref: 'Exodus' });
  addToPlan({ ref: 'Genesis' });
  const plans = collections.plans().list();
  expect(plans).toHaveLength(1);
  expect(plans[0].title).toBe('My study plan');
  expect(plans[0].units.map(i => i.ref)).toEqual(['Genesis', 'Exodus']);     // my-library plan units, no repeats
  expect(plans[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  addToLesson({ ref: 'Genesis 1:1-5', title: 'Creation' });
  addToLesson({ ref: 'Genesis 1:1-5', title: 'Creation' });
  const lessons = collections.lessons().list();
  expect(lessons).toHaveLength(1);
  expect(lessons[0]).toMatchObject({ title: 'New lesson', sources: [{ ref: 'Genesis 1:1-5', title: 'Creation' }], questions: [], handoutNotes: '' });
  expect(lessons[0].sources[0].id).toBeTruthy();
});

test('saveToShelf is idempotent per ref', () => {
  saveToShelf({ ref: 'Genesis', title: 'Genesis', tags: ['t'] });
  saveToShelf({ ref: 'Genesis' });
  expect(collections.shelf().list()).toHaveLength(1);
  expect(collections.shelf().get('shelf:Genesis')).toMatchObject({ kind: 'book', tags: ['t'] });   // the my-library id, so /my/shelf can edit it
});

test('followCalendar creates one plan per schedule with a reminder flag', () => {
  const daf = CALENDARS[2];
  const plan = followCalendar(daf);
  followCalendar(daf);
  expect(collections.plans().list()).toHaveLength(1);
  expect(plan).toMatchObject({ calendar: 'Daf Yomi', title: 'Daf Yomi', heTitle: 'דף יומי', book: 'Berakhot', reminders: true, units: [{ ref: 'Berakhot 2', label: 'Berakhot 2' }], done: [] });
  expect(followedCalendar('Daf Yomi').id).toBe(plan.id);
  setCalendarReminder(plan, false);
  expect(followedCalendar('Daf Yomi').reminders).toBe(false);
  flush();
  expect(JSON.parse(localStorage.getItem('sefaria.libnext.plans')).items[plan.id].reminders).toBe(false);
});

test('lastReadIn finds the newest history item of a book', () => {
  collections.history().put({ ref: 'Genesis 3', title: 'Genesis', ts: 10 });
  collections.history().put({ ref: 'Genesis 7:1', title: 'Genesis', ts: 20 });
  collections.history().put({ ref: 'Berakhot 2a', title: 'Berakhot', ts: 30 });
  expect(lastReadIn('Genesis').ref).toBe('Genesis 7:1');
  expect(lastReadIn('Exodus')).toBeNull();
});
