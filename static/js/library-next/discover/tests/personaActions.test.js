import { _resetStore, flush, kv } from '../../store';
import { saveSearch, isSearchSaved, forgetSearch, addToLessonInbox, inLessonInbox, addToPlanInbox, inPlanInbox, addToNotebookInbox, inNotebookInbox, rememberTopic, recentTopics, listKv } from '../personaActions';

beforeEach(() => { _resetStore(); localStorage.clear(); });

test('saved searches dedupe by url and persist', () => {
  saveSearch({ url: '/search?q=light', q: 'light', exact: false, sort: 'relevance', paths: [] });
  saveSearch({ url: '/search?q=light', q: 'light', exact: false, sort: 'relevance', paths: [] });
  saveSearch({ url: '/search?q=dark', q: 'dark' });
  expect(listKv('savedSearches').map(s => s.q)).toEqual(['dark', 'light']);
  expect(isSearchSaved('/search?q=light')).toBe(true);
  flush();
  expect(JSON.parse(localStorage.getItem('sefaria.libnext.kv')).items.savedSearches.value).toHaveLength(2);
  forgetSearch('/search?q=light');
  expect(isSearchSaved('/search?q=light')).toBe(false);
});

test('inboxes for lesson, plan and notebook', () => {
  addToLessonInbox({ ref: 'Genesis 1:3', heRef: 'בראשית א׳:ג׳', from: 'search' });
  addToLessonInbox({ topic: 'moses', title: { en: 'Moses', he: 'משה' }, from: 'topic' });
  expect(inLessonInbox('Genesis 1:3')).toBe(true);
  expect(listKv('lessonInbox').map(x => x.kind)).toEqual(['topic', 'ref']);
  addToPlanInbox({ topic: 'shabbat', title: { en: 'Shabbat', he: 'שבת' } });
  expect(inPlanInbox('shabbat')).toBe(true);
  addToNotebookInbox({ topic: 'moses', title: { en: 'Moses', he: 'משה' } });
  expect(inNotebookInbox('moses')).toBe(true);
  expect(kv.get('notebookInbox')[0]).toMatchObject({ kind: 'topic', topic: 'moses' });
});

test('recent topics are capped and most-recent first', () => {
  for (let i = 0; i < 15; i++) { rememberTopic(`t${i}`, { en: `T${i}`, he: `ת${i}` }); }
  rememberTopic('t3', { en: 'T3', he: 'ת3' });
  const recent = recentTopics();
  expect(recent).toHaveLength(12);
  expect(recent[0].slug).toBe('t3');
  expect(recent.filter(t => t.slug === 't3')).toHaveLength(1);
});
