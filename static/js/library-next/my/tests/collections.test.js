import { createCollection, kv, flush, PREFIX, _resetStore } from '../../store';
import { setPersona } from '../../persona';
import {
  SCHEMAS, COLLECTION_NAMES, collection, bookOf,
  addHistory, clearHistory, isHistoryPaused, setHistoryPaused, markStreakToday, getStreak,
  saveToShelf, removeFromShelf, isOnShelf, setShelfTags,
  addNote, updateNote, addHighlight, addFlashcard, updateFlashcard,
  createPlan, addToPlan, markPlanUnitDone, updatePlan,
  createLesson, addSourceToLesson, addQuestion, updateLesson, classCode,
  addNotebookEntry, updateNotebookEntry, citationFor, counts,
} from '../collections';

beforeEach(() => { _resetStore(); localStorage.clear(); });

test('every PLAN.md collection has a schema and is created with its version', () => {
  expect(COLLECTION_NAMES.sort()).toEqual(['flashcards', 'highlights', 'history', 'lessons', 'notebook', 'notes', 'plans', 'shelf', 'streak']);
  COLLECTION_NAMES.forEach(name => {
    const col = collection(name);
    expect(col.version).toBe(SCHEMAS[name].version);
    expect(createCollection(name)).toBe(col);   // same instance for other agents' useCollection(name)
  });
  expect(() => collection('nope')).toThrow(TypeError);
});

test('migration fills defaults for rows written without a version', () => {
  localStorage.setItem(PREFIX + 'shelf', JSON.stringify({ items: { 'shelf:Genesis 1': { id: 'shelf:Genesis 1', ref: 'Genesis 1', ts: 5 } } }));
  const shelf = collection('shelf');
  expect(shelf.get('shelf:Genesis 1')).toEqual({ id: 'shelf:Genesis 1', ref: 'Genesis 1', title: '', heTitle: '', kind: 'ref', tags: [], ts: 5 });
  expect(JSON.parse(localStorage.getItem(PREFIX + 'shelf')).v).toBe(1);
});

test('bookOf strips section numbers', () => {
  expect(bookOf('Genesis 1:1')).toBe('Genesis');
  expect(bookOf('Berakhot 2a:3')).toBe('Berakhot');
  expect(bookOf('Rashi on Genesis 1:1:2')).toBe('Rashi on Genesis');
  expect(bookOf('Shulchan Arukh, Orach Chayim 1:1')).toBe('Shulchan Arukh, Orach Chayim');
  expect(bookOf('Pirkei Avot')).toBe('Pirkei Avot');
});

test('addHistory validates, records persona, dedupes consecutive visits, marks the streak and honours pause', () => {
  setPersona('learner');
  expect(() => addHistory('', 'x')).toThrow(TypeError);
  const a = addHistory('Genesis 1:1', 'Genesis 1:1', { heTitle: 'בראשית א׳:א׳', ts: 1000 });
  expect(a).toMatchObject({ ref: 'Genesis 1:1', title: 'Genesis 1:1', heTitle: 'בראשית א׳:א׳', book: 'Genesis', persona: 'learner', ts: 1000 });
  const b = addHistory('Genesis 1:1', undefined, { ts: 2000 });
  expect(b.id).toBe(a.id);
  expect(collection('history').list()).toHaveLength(1);
  addHistory('Exodus 2', 'Exodus 2', { persona: 'scholar', ts: 3000 });
  expect(collection('history').list().map(h => h.ref)).toEqual(['Exodus 2', 'Genesis 1:1']);
  expect(collection('history').list()[0].persona).toBe('scholar');
  expect(getStreak().total).toBe(1);
  setHistoryPaused(true);
  expect(isHistoryPaused()).toBe(true);
  expect(addHistory('Leviticus 1', 'Leviticus 1')).toBeNull();
  expect(collection('history').list()).toHaveLength(2);
  clearHistory();
  expect(collection('history').list()).toHaveLength(0);
});

test('streak: idempotent per day, current and longest runs', () => {
  const today = new Date(2026, 9, 1);   // 2026-10-01
  markStreakToday(today);
  markStreakToday(today);
  expect(collection('streak').get('2026-10-01').count).toBe(2);
  markStreakToday('2026-09-30');
  markStreakToday('2026-09-29');
  markStreakToday('2026-09-20');
  markStreakToday('2026-09-19');
  markStreakToday('2026-09-18');
  markStreakToday('2026-09-17');
  const s = getStreak(today);
  expect(s).toMatchObject({ current: 3, longest: 4, total: 7 });
  expect(s.days['2026-09-30']).toBe(1);
  // today not read yet: yesterday's run still counts
  expect(getStreak(new Date(2026, 9, 2)).current).toBe(3);
  expect(getStreak(new Date(2026, 9, 3)).current).toBe(0);
  expect(() => markStreakToday('not a date')).toThrow(TypeError);
});

test('shelf merges tags on re-save, remove and query', () => {
  expect(() => saveToShelf({ ref: 'Genesis 1', kind: 'folder' })).toThrow(TypeError);
  saveToShelf({ ref: 'Genesis 1', title: 'Genesis 1', tags: ['torah', 'creation'] });
  saveToShelf({ ref: 'Genesis 1', tags: ['creation', 'week-1'] });
  const item = collection('shelf').get('shelf:Genesis 1');
  expect(item.tags).toEqual(['torah', 'creation', 'week-1']);
  expect(item.title).toBe('Genesis 1');
  expect(isOnShelf('Genesis 1')).toBe(true);
  setShelfTags('Genesis 1', ['only']);
  expect(collection('shelf').get('shelf:Genesis 1').tags).toEqual(['only']);
  expect(removeFromShelf('Genesis 1')).toBe(true);
  expect(isOnShelf('Genesis 1')).toBe(false);
});

test('notes and highlights', () => {
  const n = addNote('Genesis 1:1', 'In the beginning…');
  expect(n).toMatchObject({ ref: 'Genesis 1:1', text: 'In the beginning…', book: 'Genesis', title: 'Genesis 1:1' });
  expect(updateNote(n.id, 'changed').text).toBe('changed');
  expect(updateNote('missing', 'x')).toBeNull();
  expect(() => addNote('Genesis 1:1', '   ')).toThrow(TypeError);
  expect(addHighlight('Genesis 1:2', 'green', { text: 'the earth' })).toMatchObject({ color: 'green', book: 'Genesis', text: 'the earth' });
  expect(() => addHighlight('Genesis 1:2', 'purple')).toThrow(TypeError);
});

test('flashcards start due now with SM-2 fields', () => {
  const card = addFlashcard('בראשית', 'In the beginning', { ref: 'Genesis 1:1', due: 42 });
  expect(card).toMatchObject({ front: 'בראשית', back: 'In the beginning', ref: 'Genesis 1:1', due: 42, interval: 0, ease: 2.5, reps: 0 });
  expect(updateFlashcard(card.id, { interval: 1, reps: 1 }).interval).toBe(1);
  expect(() => addFlashcard('', 'x')).toThrow(TypeError);
});

test('plans v1 rows from browse (items / titleHe / reminder) migrate to units / heTitle / reminders with a start date', () => {
  localStorage.setItem(PREFIX + 'plans', JSON.stringify({ v: 1, items: {
    a: { id: 'a', title: 'Daf Yomi', titleHe: 'דף יומי', calendar: 'Daf Yomi', reminder: true, items: [{ ref: 'Berakhot 2', title: 'Berakhot 2' }], ts: 1 },
    b: { id: 'b', title: 'x', units: [{ ref: 'Genesis 1', label: 'Chapter 1', heLabel: '' }], startDate: '2026-10-01', done: [], reminders: false, ts: 2 },
  } }));
  const plans = collection('plans');
  expect(plans.get('a')).toMatchObject({ heTitle: 'דף יומי', calendar: 'Daf Yomi', reminders: true, units: [{ ref: 'Berakhot 2', label: 'Berakhot 2', heLabel: '' }], done: [], unitsPerDay: 1 });
  expect(plans.get('a').startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(plans.get('a').items).toBeUndefined();
  expect(plans.get('b')).toMatchObject({ units: [{ ref: 'Genesis 1' }], startDate: '2026-10-01', calendar: '' });
  expect(JSON.parse(localStorage.getItem(PREFIX + 'plans')).v).toBe(2);
  expect(createPlan({ title: 'c', calendar: 'Parashat Hashavua' }).calendar).toBe('Parashat Hashavua');
});

test('plans validate units and track completion', () => {
  const plan = createPlan({ title: 'Genesis, a chapter a day', book: 'Genesis', startDate: '2026-10-01', units: [{ ref: 'Genesis 1', label: 'Chapter 1' }, { ref: 'Genesis 2' }] });
  expect(plan.units[1]).toEqual({ ref: 'Genesis 2', label: 'Genesis 2', heLabel: '' });
  expect(plan.unitsPerDay).toBe(1);
  expect(createPlan({ title: 'x' }).startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(() => createPlan({ title: 'x', startDate: 'tomorrow' })).toThrow(TypeError);
  expect(() => createPlan({ title: 'x', unitsPerDay: 0 })).toThrow(TypeError);
  expect(addToPlan(plan.id, { ref: 'Genesis 2' }).units).toHaveLength(2);   // no duplicates
  expect(addToPlan(plan.id, { ref: 'Genesis 3' }).units).toHaveLength(3);
  expect(markPlanUnitDone(plan.id, 'Genesis 1').done).toEqual(['Genesis 1']);
  expect(markPlanUnitDone(plan.id, 'Genesis 1', false).done).toEqual([]);
  expect(updatePlan(plan.id, { reminders: true }).reminders).toBe(true);
  expect(addToPlan('missing', { ref: 'x' })).toBeNull();
});

test('lessons: sources, bilingual questions, class code', () => {
  const lesson = createLesson({ title: 'Creation', questions: ['Why light first?'] });
  expect(lesson.questions[0]).toMatchObject({ en: 'Why light first?', he: 'Why light first?' });
  addSourceToLesson(lesson.id, { ref: 'Genesis 1:1', he: 'בראשית', en: 'In the beginning' });
  addQuestion(lesson.id, { he: 'מה נברא ראשון?' });
  const saved = collection('lessons').get(lesson.id);
  expect(saved.sources[0]).toMatchObject({ ref: 'Genesis 1:1', title: 'Genesis 1:1', he: 'בראשית' });
  expect(saved.questions[1]).toMatchObject({ en: 'מה נברא ראשון?', he: 'מה נברא ראשון?' });
  expect(updateLesson(lesson.id, { handoutNotes: ' bring chumashim ' }).handoutNotes).toBe('bring chumashim');
  expect(() => addQuestion(lesson.id, {})).toThrow(TypeError);
  expect(() => createLesson({ title: '' })).toThrow(TypeError);
  expect(classCode(lesson.id)).toMatch(/^[A-Z2-9]{6}$/);
  expect(classCode(lesson.id)).toBe(classCode(lesson.id));
  expect(classCode('a')).not.toBe(classCode('b'));
});

test('notebook entries carry a default citation', () => {
  const e = addNotebookEntry({ ref: 'Berakhot 2a:1', text: 'opening', versions: ['William Davidson', 'Vilna', 'Vilna'] });
  expect(e.versions).toEqual(['William Davidson', 'Vilna']);
  expect(e.citation).toMatch(/^Berakhot 2a:1\. Sefaria\. https:\/\/www\.sefaria\.org\/Berakhot_2a\.1 \(accessed \d{4}-\d{2}-\d{2}\)\.$/);
  expect(citationFor('Genesis 1:1', { versionTitle: 'JPS 1985', accessed: new Date(2026, 0, 2) })).toBe('Genesis 1:1, JPS 1985. Sefaria. https://www.sefaria.org/Genesis_1.1 (accessed 2026-01-02).');
  expect(updateNotebookEntry(e.id, { text: 'more' }).text).toBe('more');
});

test('counts and persistence through the store', () => {
  addNote('Genesis 1:1', 'a');
  addNote('Genesis 1:2', 'b');
  saveToShelf({ ref: 'Exodus 1' });
  expect(counts()).toMatchObject({ notes: 2, shelf: 1, history: 0 });
  flush();
  expect(Object.keys(JSON.parse(localStorage.getItem(PREFIX + 'notes')).items)).toHaveLength(2);
  expect(kv.get('historyPaused', false)).toBe(false);
});
