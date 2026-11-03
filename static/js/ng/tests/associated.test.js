/**
 * What the associated-texts panel shows and in what order (associated.js). Fixtures are real
 * /api/links/<ref>?with_text=0 responses from sefaria.org, trimmed to the fields the panel reads:
 * every Genesis 1:1 link of the major commentators plus one link per other work, and all of
 * Berakhot 2a:1.
 */
import {
  CITED_BY, TOP_COMMENTATORS, TOP_COUNT, booksFromLinks, categoryLabel, compareBooks, connectionsParam, corpusOf,
  bookOpenTarget, displayTitle, formatCount, groupLinks, groupSourceRefs, isHebrewOnly, openTarget, panelLinks, resolveFilter,
  shortList, topBooks,
} from '../associated';

const GENESIS = require('./fixtures/links-genesis-1-1.json');
const BERAKHOT = require('./fixtures/links-berakhot-2a-1.json');

const titles = (books) => books.map(b => b.title);
const link = (title, category, extra = {}) => ({
  category, type: '', collectiveTitle: {en: title, he: extra.he || title}, sourceHasEn: !!extra.en,
  sourceRef: extra.ref || `${title} 1:1:1`, anchorRefExpanded: ['Genesis 1:1'], ...extra,
});

describe('the corpus decides the major commentators', () => {
  test('corpus from the section', () => {
    expect(corpusOf({primaryCategory: 'Tanakh', categories: ['Tanakh', 'Torah']})).toBe('Tanakh');
    expect(corpusOf({primaryCategory: 'Talmud', categories: ['Talmud', 'Bavli']})).toBe('Talmud');
    expect(corpusOf({primaryCategory: 'Mishnah', categories: ['Mishnah']})).toBe('Mishnah');
    expect(corpusOf({primaryCategory: 'Halakhah', categories: ['Halakhah']})).toBeNull();
    expect(corpusOf(null)).toBeNull();
  });

  test('a commentary filed under a corpus is not that corpus: its primary category decides', () => {
    // "Rashi on Genesis" (/api/v3/texts): categories start with Tanakh, primary_category is Commentary.
    expect(corpusOf({primaryCategory: 'Commentary', categories: ['Tanakh', 'Rishonim on Tanakh', 'Rashi', 'Torah']})).toBeNull();
    expect(corpusOf({primaryCategory: 'Commentary', categories: ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Tosafot']})).toBeNull();
    // With no primary category, the categories still decide.
    expect(corpusOf({primaryCategory: null, categories: ['Tanakh', 'Torah']})).toBe('Tanakh');
  });

  test('the top-5 lists live in one config map, each longer than five so a book missing some still gets five', () => {
    expect(Object.keys(TOP_COMMENTATORS).sort()).toEqual(['Mishnah', 'Talmud', 'Tanakh']);
    for (const list of Object.values(TOP_COMMENTATORS)) { expect(list.length).toBeGreaterThan(TOP_COUNT); }
    expect(TOP_COUNT).toBe(5);
  });

  test('Genesis 1:1: Rashi, Ramban, Ibn Ezra, Sforno, then Onkelos (the Targum), shown by its short name', () => {
    const top = topBooks(booksFromLinks(GENESIS), 'Tanakh');
    expect(titles(top)).toEqual(['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno', 'Onkelos Genesis']);
    expect(top.map(b => displayTitle(b, 'english'))).toEqual(['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno', 'Onkelos']);
    expect(displayTitle(top[4], 'hebrew')).toBe('אונקלוס');
    expect(top[4].category).toBe('Targum');
  });

  test('Berakhot 2a:1: Rashi, Tosafot, Steinsaltz; Rashba and Maharsha have nothing here, so Meiri and Rif fill in', () => {
    expect(titles(topBooks(booksFromLinks(BERAKHOT), 'Talmud'))).toEqual(['Rashi', 'Tosafot', 'Steinsaltz', 'Meiri', 'Rif']);
  });

  test('a commentator missing from the segment gives its slot to the next in the list', () => {
    const books = booksFromLinks([
      link('Rashi', 'Commentary'), link('Ibn Ezra', 'Commentary'), link('Radak', 'Commentary'),
      link('Metzudat David', 'Commentary'), link('Malbim', 'Commentary'), link('Ralbag', 'Commentary'),
      link('Targum Jonathan on Isaiah', 'Targum'),
    ]);
    expect(titles(topBooks(books, 'Tanakh'))).toEqual(['Rashi', 'Ibn Ezra', 'Targum Jonathan on Isaiah', 'Radak', 'Metzudat David']);
  });

  test("Maharsha's two works share one slot", () => {
    const books = booksFromLinks(['Rashi', 'Tosafot', 'Steinsaltz', 'Rashba', 'Chidushei Agadot', 'Chidushei Halachot', 'Ritva']
      .map(t => link(t, 'Commentary')));
    const top = titles(topBooks(books, 'Talmud'));
    expect(top.slice(0, 4)).toEqual(['Rashi', 'Tosafot', 'Steinsaltz', 'Rashba']);
    expect(top.slice(4).sort()).toEqual(['Chidushei Agadot', 'Chidushei Halachot']);
    expect(top).not.toContain('Ritva');
  });

  test('only Commentary and Targum works can be major commentators (not a Rashi quoted elsewhere)', () => {
    const books = booksFromLinks([link('Rashi', CITED_BY), link('Ramban', 'Commentary')]);
    expect(titles(topBooks(books, 'Tanakh'))).toEqual(['Ramban']);
  });

  test('outside the three corpora there are no major commentators', () => {
    expect(topBooks(booksFromLinks(GENESIS), null)).toEqual([]);
  });
});

describe('grouping and order', () => {
  const grouped = groupLinks(GENESIS, {corpus: 'Tanakh', interfaceLang: 'english'});

  test('books only: essays are dropped, every other link is counted', () => {
    expect(panelLinks(GENESIS).some(l => l.type === 'essay')).toBe(false);
    expect(grouped.total).toBe(panelLinks(GENESIS).length);
    expect(grouped.books.every(b => b.count === b.links.length)).toBe(true);
  });

  test("categories: Commentary, Targum, then the corpus's relatives (Talmud, Midrash, Halakhah), then the rest", () => {
    const order = grouped.categories.map(c => c.category);
    expect(order.slice(0, 5)).toEqual(['Commentary', 'Targum', 'Talmud', 'Midrash', 'Halakhah']);
    expect(order).not.toContain(CITED_BY);
    expect(order.indexOf('Tanakh')).toBeLessThan(order.indexOf('Kabbalah'));
  });

  test('inside Commentary: the major commentators first, then the rest A–Z', () => {
    const commentary = grouped.categories.find(c => c.category === 'Commentary');
    expect(titles(commentary.books.slice(0, 4))).toEqual(['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno']);
    expect(commentary.leading).toBe(4);
    const rest = titles(commentary.books.slice(4));
    expect(rest[0]).toBe('Abarbanel');
    expect(rest).toEqual(rest.slice().sort((a, b) => compareBooks({title: a}, {title: b}, 'english')));
    expect(rest).not.toContain('Rashi');
  });

  test('A–Z ignores quotes and case, and goes word by word', () => {
    const sorted = ["Ba'al HaTurim", 'Bartenura on Torah', 'Benayahu', 'Ben Yehoyada', 'abarbanel']
      .map(t => ({title: t})).sort((a, b) => compareBooks(a, b, 'english')).map(b => b.title);
    expect(sorted).toEqual(['abarbanel', "Ba'al HaTurim", 'Bartenura on Torah', 'Ben Yehoyada', 'Benayahu']);
  });

  test('in a Hebrew interface the rest are aleph–tav by Hebrew title', () => {
    const he = groupLinks(GENESIS, {corpus: 'Tanakh', interfaceLang: 'hebrew'});
    const commentary = he.categories.find(c => c.category === 'Commentary');
    expect(titles(commentary.books.slice(0, 4))).toEqual(['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno']);
    const rest = commentary.books.slice(4).map(b => b.heTitle.replace(/["'״׳]/g, ''));
    expect(rest[0].startsWith('א')).toBe(true);
    expect(rest[rest.length - 1][0]).toBe('ת');
    expect(rest).toEqual(rest.slice().sort((a, b) => a.localeCompare(b, 'he')));
  });

  test('other categories are A–Z throughout', () => {
    const midrash = grouped.categories.find(c => c.category === 'Midrash');
    expect(midrash.leading).toBe(0);
    const names = titles(midrash.books);
    expect(names).toEqual(names.slice().sort((a, b) => compareBooks({title: a}, {title: b}, 'english')));
  });

  test('"Quoting Commentary" is set aside as "Cited by"', () => {
    expect(grouped.citedBy.category).toBe(CITED_BY);
    expect(grouped.citedBy.books.length).toBeGreaterThan(50);
    expect(grouped.citedBy.books.every(b => b.category === CITED_BY)).toBe(true);
    expect(categoryLabel(CITED_BY, 'english', 'Cited by')).toBe('Cited by');
    expect(categoryLabel(CITED_BY, 'hebrew')).toBe('מצוטט אצל');
    expect(categoryLabel('Midrash', 'hebrew')).toBe('מדרש');
  });

  test("a work's links are in comment order", () => {
    const rashi = grouped.books.find(b => b.key === 'Commentary|Rashi');
    expect(rashi.links.map(l => l.sourceRef)).toEqual(['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3']);
    const sorted = booksFromLinks([link('X', 'Commentary', {ref: 'X 1:1:10'}), link('X', 'Commentary', {ref: 'X 1:1:2'})])[0];
    expect(sorted.links.map(l => l.sourceRef)).toEqual(['X 1:1:2', 'X 1:1:10']);
  });

  test('no links: an empty grouping, not an error', () => {
    expect(groupLinks([], {corpus: 'Tanakh'})).toMatchObject({total: 0, top: [], categories: [], citedBy: null});
  });
});

describe('translation-only readers', () => {
  const grouped = groupLinks(GENESIS, {corpus: 'Tanakh'});

  test('works without English are labelled "Hebrew only" for translation-only readers, and never hidden', () => {
    const aderet = grouped.books.find(b => b.title === 'Aderet Eliyahu');
    const rashi = grouped.books.find(b => b.key === 'Commentary|Rashi');
    expect(aderet.hasEnglish).toBe(false);
    expect(isHebrewOnly(aderet, 'english')).toBe(true);
    expect(isHebrewOnly(rashi, 'english')).toBe(false);
    expect(isHebrewOnly(aderet, 'hebrew')).toBe(false);
    expect(isHebrewOnly(aderet, 'bilingual')).toBe(false);
    // Same list whatever the language: nothing is filtered out.
    expect(groupLinks(GENESIS, {corpus: 'Tanakh'}).books.length).toBe(grouped.books.length);
  });

  test('a work with English on some comments has English', () => {
    const [book] = booksFromLinks([link('Gur Aryeh', 'Commentary'), link('Gur Aryeh', 'Commentary', {en: true, ref: 'G 2'})]);
    expect(book.hasEnglish).toBe(true);
  });
});

describe('with= values and the stack', () => {
  const grouped = groupLinks(GENESIS, {corpus: 'Tanakh'});

  test('a with= value resolves to a work, a category, or Cited by', () => {
    expect(resolveFilter(grouped, 'Rashi')).toEqual({kind: 'book', key: 'Commentary|Rashi'});
    expect(resolveFilter(grouped, 'Ibn_Ezra')).toEqual({kind: 'book', key: 'Commentary|Ibn Ezra'});
    expect(resolveFilter(grouped, 'Midrash')).toEqual({kind: 'category', category: 'Midrash'});
    expect(resolveFilter(grouped, 'Commentary ConnectionsList')).toEqual({kind: 'category', category: 'Commentary'});
    expect(resolveFilter(grouped, 'Quoting Commentary')).toEqual({kind: 'category', category: CITED_BY});
    const quoted = grouped.citedBy.books[0];
    expect(resolveFilter(grouped, `${quoted.title}|Quoting`)).toEqual({kind: 'book', key: quoted.key});
    expect(resolveFilter(grouped, 'Sheets')).toBeNull();
    expect(resolveFilter(null, 'Rashi')).toBeNull();
  });

  test('the stack writes back to with=, in the classic grammar', () => {
    expect(connectionsParam([{kind: 'home'}])).toBe('all');
    expect(connectionsParam([{kind: 'home'}, {kind: 'category', category: 'Midrash'}])).toBe('Midrash');
    expect(connectionsParam([{kind: 'home'}, {kind: 'book', key: 'Commentary|Rashi'}])).toBe('Rashi');
    expect(connectionsParam([{kind: 'home'}, {kind: 'book', key: 'Commentary|Rashi'}, {kind: 'ref', ref: 'Psalms 111:6'}])).toBe('Rashi');
    expect(connectionsParam([{kind: 'home'}, {kind: 'book', key: `${CITED_BY}|Zohar`}])).toBe('Zohar|Quoting');
    expect(connectionsParam([{kind: 'home'}, {kind: 'filter', name: 'Ramban'}])).toBe('Ramban');
  });
});

test('comment refs group into ranges, one request per run', () => {
  expect(groupSourceRefs(['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3'])).toEqual([
    {ref: 'Rashi on Genesis 1:1:1-3', refs: ['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3'], first: 1},
  ]);
  expect(groupSourceRefs(['X 1:1:1', 'X 1:1:3', 'X 1:2:1', 'X 1:2:2', 'Y 4-6']).map(g => g.ref))
    .toEqual(['X 1:1:1', 'X 1:1:3', 'X 1:2:1-2', 'Y 4-6']);
  expect(groupSourceRefs(['Steinsaltz on Berakhot 2a:1']).map(g => g.ref)).toEqual(['Steinsaltz on Berakhot 2a:1']);
});

test('badge counts stay short', () => {
  expect([0, 7, 999, 1000, 1815, 12400].map(formatCount)).toEqual(['0', '7', '999', '1k', '1.8k', '12k']);
});

describe('the first list: pins first, then the defaults', () => {
  const MEI = {title: 'Mei HaShiloach', heTitle: 'מי השלוח', category: 'Chasidut'};
  const SA = {title: 'Shulchan Arukh, Orach Chayim', heTitle: 'שולחן ערוך, אורח חיים', category: 'Halakhah'};
  const grouped = () => groupLinks(GENESIS, {corpus: 'Tanakh'});
  const keys = (list) => list.map(e => e.key);

  test('no pins: the corpus defaults, as before', () => {
    const list = shortList(grouped(), []);
    expect(keys(list)).toEqual(['Commentary|Rashi', 'Commentary|Ramban', 'Commentary|Ibn Ezra', 'Commentary|Sforno', 'Targum|Onkelos Genesis']);
    expect(list.every(e => !e.pinned && e.book)).toBe(true);
  });

  test('pins lead, in pin order, even from outside the defaults (Chasidut, Halakhah); the list grows to hold them', () => {
    const list = shortList(grouped(), [MEI, SA]);
    expect(keys(list)).toEqual(['Chasidut|Mei HaShiloach', 'Halakhah|Shulchan Arukh, Orach Chayim',
      'Commentary|Rashi', 'Commentary|Ramban', 'Commentary|Ibn Ezra', 'Commentary|Sforno', 'Targum|Onkelos Genesis']);
    expect(list.slice(0, 2).map(e => e.pinned)).toEqual([true, true]);
    expect(list[0].book.count).toBeGreaterThan(0);
  });

  test('a pinned default moves to the top instead of appearing twice', () => {
    const list = shortList(grouped(), [{title: 'Sforno', heTitle: 'ספורנו', category: 'Commentary'}, MEI]);
    expect(keys(list)).toEqual(['Commentary|Sforno', 'Chasidut|Mei HaShiloach',
      'Commentary|Rashi', 'Commentary|Ramban', 'Commentary|Ibn Ezra', 'Targum|Onkelos Genesis']);
  });

  test('a pinned work with nothing on this segment is still listed (so it can be unpinned), with no book', () => {
    const list = shortList(grouped(), [{title: 'Sfat Emet', heTitle: 'שפת אמת', category: 'Chasidut'}]);
    expect(list[0]).toMatchObject({key: 'Chasidut|Sfat Emet', book: null, pinned: true});
    expect(list).toHaveLength(6);
  });

  test('a pinned Onkelos keeps its short title', () => {
    const list = shortList(grouped(), [{title: 'Onkelos Genesis', heTitle: 'אונקלוס בראשית', category: 'Targum', shortTitle: 'Onkelos', heShortTitle: 'אונקלוס'}]);
    expect(displayTitle(list[0].book, 'english')).toBe('Onkelos');
  });
});

describe('what Open shows front and center', () => {
  test('the first run of a work\'s comments on the segment, as one range', () => {
    expect(openTarget(['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3'])).toBe('Rashi on Genesis 1:1:1-3');
    expect(openTarget(['Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:5'])).toBe('Rashi on Genesis 1:1:2');
    expect(openTarget(['Shulchan Arukh, Orach Chayim 668:2'])).toBe('Shulchan Arukh, Orach Chayim 668:2');
    expect(openTarget(['Berakhot 31a:5-7', 'Berakhot 31a:8'])).toBe('Berakhot 31a:5-7');
    expect(openTarget([])).toBeNull();
  });

  test('for a work in the panel: its links in order', () => {
    const rashi = groupLinks(GENESIS, {corpus: 'Tanakh'}).books.find(b => b.key === 'Commentary|Rashi');
    expect(bookOpenTarget(rashi)).toBe('Rashi on Genesis 1:1:1-3');
    expect(bookOpenTarget(null)).toBeNull();
  });
});
