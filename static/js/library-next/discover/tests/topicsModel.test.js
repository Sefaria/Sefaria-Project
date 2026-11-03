import Sefaria from '../../../sefaria/sefaria';
import { topicCategories, categoryChildren, findCategory, plainText, firstSentence, sortRefs, isNotable, sourceTabs, relatedGroups, alphabetize, matchTopics, refUrl } from '../topicsModel';

beforeAll(() => {
  Sefaria.topic_toc = [
    { slug: 'jewish-calendar2', primaryTitle: { en: 'Jewish Calendar', he: 'מועדי השנה' }, categoryDescription: { en: 'Festivals.', he: 'חגים.' }, children: [
      { slug: 'shabbat', primaryTitle: { en: 'Shabbat', he: 'שבת' }, displayOrder: 2, numSources: 1202, pools: ['library'], description: { en: 'Day of rest', he: 'יום מנוחה' } },
      { slug: 'purim', primaryTitle: { en: 'Purim', he: 'פורים' }, displayOrder: 1, numSources: 740 },
      { slug: 'hidden', primaryTitle: { en: 'Hidden', he: 'נסתר' }, shouldDisplay: false },
      { slug: 'fasts', primaryTitle: { en: 'Fasts', he: 'צומות' }, displayOrder: 3, children: [{ slug: 'tisha-bav', primaryTitle: { en: 'Tisha B’Av', he: 'תשעה באב' } }] },
    ] },
    { slug: 'authors', primaryTitle: { en: 'Authors', he: 'מחברים' }, children: [] },
  ];
});

test('categories and children come from topic_toc', () => {
  expect(topicCategories().map(c => [c.slug, c.count])).toEqual([['jewish-calendar2', 3], ['authors', 0]]);
  expect(categoryChildren('jewish-calendar2').map(c => c.slug)).toEqual(['purim', 'shabbat', 'fasts']);
  expect(categoryChildren('jewish-calendar2')[2]).toMatchObject({ isCategory: true, count: 1 });
  expect(findCategory('fasts').slug).toBe('fasts');
  expect(categoryChildren('nope')).toEqual([]);
});

test('plain text and first sentence', () => {
  expect(plainText('Moses married [Tzipporah](https://x) and *fled*. &amp; more')).toBe('Moses married Tzipporah and fled. & more');
  expect(firstSentence('Short.')).toBe('Short.');
  const long = 'First sentence is here and it is reasonably long for the test. Second sentence follows and keeps going for a while longer than the limit allows.';
  expect(firstSentence(long, 80)).toBe('First sentence is here and it is reasonably long for the test.');
});

const refs = [
  { ref: 'B', order: { curatedPrimacy: { en: 5, he: 0 }, pr: 1, comp_date: 500, order_id: 'b', availableLangs: ['en', 'he'] }, descriptions: { en: { title: 'Why B' } } },
  { ref: 'A', order: { curatedPrimacy: { en: 0, he: 9 }, pr: 3, comp_date: -1400, order_id: 'a', availableLangs: ['he'] } },
  { ref: 'C', order: { curatedPrimacy: { en: 0, he: 0 }, pr: 9, comp_date: 500, order_id: 'c', availableLangs: ['en'] }, descriptions: { en: { title: '', prompt: 'p', published: false } } },
  { ref: 'D' },
];

test('sortRefs by relevance per language and chronologically', () => {
  expect(sortRefs(refs, 'relevance', 'en').map(r => r.ref)).toEqual(['B', 'C', 'A', 'D']);
  expect(sortRefs(refs, 'relevance', 'he').map(r => r.ref)).toEqual(['A', 'B', 'C', 'D']);
  expect(sortRefs(refs, 'chronological').map(r => r.ref)).toEqual(['A', 'B', 'C', 'D']);
  expect(isNotable(refs[0], 'en')).toBe(true);
  expect(isNotable(refs[2], 'en')).toBe(false);
  expect(isNotable(refs[1], 'en')).toBe(false);
});

test('sourceTabs and relatedGroups', () => {
  const tabs = sourceTabs({ tabs: { 'notable-sources': { refs: [refs[0]] }, sources: { refs }, 'popular-writing-of': { refs: [] } } });
  expect(tabs.map(t => t.id)).toEqual(['notable', 'sources']);
  expect(sourceTabs(null)).toEqual([]);
  const groups = relatedGroups({
    'is-a': { shouldDisplay: false, links: [{ topic: 'x', title: { en: 'X', he: 'X' } }] },
    'has-relationship': { title: { en: 'Relationship', he: 'קשר' }, pluralTitle: { en: 'Relationships', he: 'קשרים' }, shouldDisplay: true, links: [
      { topic: 'aaron', title: { en: 'Aaron', he: 'אהרן' }, shouldDisplay: true, order: { tfidf: 2 } },
      { topic: 'miriam', title: { en: 'Miriam', he: 'מרים' }, shouldDisplay: true, order: { tfidf: 5 } },
      { topic: 'nope', title: { en: 'Nope', he: '' }, shouldDisplay: false },
    ] },
    'parent-of': { title: { en: 'Child', he: 'ילד' }, pluralTitle: { en: 'Children', he: 'ילדים' }, shouldDisplay: true, links: [{ topic: 'gershom', title: { en: 'Gershom', he: 'גרשם' }, shouldDisplay: true }] },
  });
  expect(groups.map(g => [g.title.en, g.topics.map(t => t.slug)])).toEqual([['Relationships', ['miriam', 'aaron']], ['Child', ['gershom']]]);
});

test('alphabetize and matchTopics', () => {
  const topics = [
    { slug: 'moses', primaryTitle: { en: 'Moses', he: 'משה' }, titles: [{ text: 'Moses' }, { text: 'משה' }], shouldDisplay: true, pools: ['library'], numSources: 6410 },
    { slug: 'miriam', primaryTitle: { en: 'Miriam', he: 'מרים' }, titles: [{ text: 'Miriam' }], shouldDisplay: true, pools: ['library'], numSources: 200 },
    { slug: 'aaron', primaryTitle: { en: 'Aaron', he: 'אהרן' }, titles: [{ text: 'Aaron' }], shouldDisplay: true, pools: ['library', 'sheets'], numSources: 900 },
    { slug: 'sheets-only', primaryTitle: { en: 'Zed', he: 'זד' }, titles: [{ text: 'Zed' }], shouldDisplay: true, pools: ['sheets'] },
  ];
  const az = alphabetize(topics, 'en');
  expect(az.map(g => [g.letter, g.topics.map(t => t.slug)])).toEqual([['A', ['aaron']], ['M', ['miriam', 'moses']]]);
  expect(alphabetize(topics, 'he')[0]).toMatchObject({ letter: 'א' });
  expect(matchTopics(topics, 'm').map(t => t.slug)).toEqual(['moses', 'miriam']);
  expect(matchTopics(topics, 'משה').map(t => t.slug)).toEqual(['moses']);
  expect(matchTopics(topics, '')).toEqual([]);
  expect(refUrl('Genesis 1:1')).toBe('/Genesis.1.1');
});
