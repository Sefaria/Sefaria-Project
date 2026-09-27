/**
 * The table-of-contents model (tocData.js) on index records captured from sefaria.org:
 * Genesis (a chapter grid, with parashot), Berakhot (amudim from 2a, with perakim), and the
 * Pesach Haggadah (a schema tree).
 */
import {
  buildToc, currentAltIndex, currentPath, dafIndex, dafLabel, nodeIsCurrent, rangeContains, refPosition, sectionIsCurrent,
  splitRange,
} from '../tocData';
import {indexFixture} from './helpers';

describe('Genesis: chapters and parashot', () => {
  const toc = buildToc(indexFixture('Genesis'));

  test('a grid of 50 chapters, numbered in English and Hebrew', () => {
    expect(toc.title).toBe('Genesis');
    expect(toc.heTitle).toBe('בראשית');
    expect(toc.root.children).toBeNull();
    expect(toc.root.sections).toHaveLength(50);
    expect(toc.root.sections[0]).toEqual({ref: 'Genesis 1', match: 'Genesis 1', label: '1', heLabel: 'א', empty: false});
    expect(toc.root.sections[49].ref).toBe('Genesis 50');
    expect(toc.root.sections[14].heLabel).toBe('טו');
    expect(toc.root.sectionName).toBe('Chapter');
  });

  test('parashot from the alt structure, with their ranges', () => {
    expect(toc.alts.map(a => a.name)).toEqual(['Parasha']);
    const parashot = toc.alts[0];
    expect(parashot.title).toBe('Parashot');
    expect(parashot.items).toHaveLength(12);
    expect(parashot.items[1]).toMatchObject({ref: 'Genesis 6:9', title: 'Noach', heTitle: 'נח', subtitle: '6:9–11:32'});
    expect(parashot.items[0].heSubtitle).toBe('א:א–ו:ח');
  });

  test('the current parasha holds the current verse, including a chapter split between two', () => {
    const parashot = toc.alts[0];
    expect(currentAltIndex(parashot, 'Genesis 6:8', 'Genesis')).toBe(0);
    expect(currentAltIndex(parashot, 'Genesis 6:12', 'Genesis')).toBe(1);
    expect(currentAltIndex(parashot, 'Genesis 50:26', 'Genesis')).toBe(11);
    expect(currentAltIndex(parashot, 'Exodus 1:1', 'Genesis')).toBe(-1);
  });

  test('the current chapter matches its section ref and its segments', () => {
    const [ch1, ch2] = toc.root.sections;
    expect(sectionIsCurrent(ch1, 'Genesis 1')).toBe(true);
    expect(sectionIsCurrent(ch1, 'Genesis 1:5')).toBe(true);
    expect(sectionIsCurrent(ch1, 'Genesis 10')).toBe(false);
    expect(sectionIsCurrent(ch2, 'Genesis 1')).toBe(false);
  });
});

describe('Berakhot: amudim and perakim', () => {
  const toc = buildToc(indexFixture('Berakhot'));

  test('the grid starts on 2a (1a and 1b have no text) and ends on the last amud with text', () => {
    const sections = toc.root.sections;
    expect(toc.root.talmud).toBe(true);
    expect(sections[0]).toMatchObject({ref: 'Berakhot 2a', label: '2a', heLabel: 'ב.'});
    expect(sections[1]).toMatchObject({ref: 'Berakhot 2b', label: '2b', heLabel: 'ב:'});
    expect(sections[sections.length - 1].ref).toBe('Berakhot 64a');
    expect(sections.every(s => !s.empty)).toBe(true);
  });

  test('perakim, named, with the tractate range of each', () => {
    const perakim = toc.alts.find(a => a.name === 'Chapters');
    expect(perakim.title).toBe('Chapters');
    expect(perakim.heTitle).toBe('פרקים');
    expect(perakim.items[0]).toMatchObject({ref: 'Berakhot 2a:1', title: 'MeEimatai', kicker: 'Chapter 1', heKicker: 'פרק א', subtitle: '2a:1–13a:15'});
    expect(currentAltIndex(perakim, 'Berakhot 13a:15', 'Berakhot')).toBe(0);
    expect(currentAltIndex(perakim, 'Berakhot 13a:16', 'Berakhot')).toBe(1);
    expect(currentAltIndex(perakim, 'Berakhot 5a', 'Berakhot')).toBe(0);
  });
});

describe('Pesach Haggadah: a schema tree', () => {
  const toc = buildToc(indexFixture('Pesach Haggadah'));

  test('parts and sub-parts with their refs; depth-1 parts are leaves', () => {
    const titles = toc.root.children.map(c => c.title);
    expect(titles.slice(0, 5)).toEqual(['Kadesh', 'Urchatz', 'Karpas', 'Yachatz', 'Magid']);
    const kadesh = toc.root.children[0];
    expect(kadesh).toMatchObject({ref: 'Pesach Haggadah, Kadesh', heTitle: 'קדש', sections: null, children: null});
    const magid = toc.root.children[4];
    expect(magid.children.map(c => c.ref)).toContain('Pesach Haggadah, Magid, The Four Sons');
    expect(toc.alts).toEqual([]);
  });

  test('the path to the current part opens, and only it is current', () => {
    const current = 'Pesach Haggadah, Magid, The Four Sons';
    const magid = toc.root.children[4];
    expect(currentPath(toc.root, current)).toEqual(['root', magid.id, magid.children.find(c => c.ref === current).id]);
    expect(nodeIsCurrent(magid, current)).toBe(true);
    expect(nodeIsCurrent(toc.root.children[0], current)).toBe(false);
    // "Magid, The Four" is not a prefix match for "Magid, The Four Sons"
    expect(nodeIsCurrent({ref: 'Pesach Haggadah, Magid, The Four'}, current)).toBe(false);
  });
});

describe('other shapes', () => {
  test('a depth-3 book: a chapter cell opens its first section with content', () => {
    const toc = buildToc({
      title: 'Rashi on Genesis', heTitle: 'רש״י על בראשית',
      schema: {nodeType: 'JaggedArrayNode', depth: 3, addressTypes: ['Perek', 'Pasuk', 'Integer'], sectionNames: ['Chapter', 'Verse', 'Comment'],
        content_counts: [[3, 0, 2], [0, 0, 4], [0, 0, 0]]},
    });
    expect(toc.root.sections.map(s => [s.ref, s.match, s.empty])).toEqual([
      ['Rashi on Genesis 1:1', 'Rashi on Genesis 1', false],
      ['Rashi on Genesis 2:3', 'Rashi on Genesis 2', false],
      ['Rashi on Genesis 3:1', 'Rashi on Genesis 3', true],
    ]);
    expect(sectionIsCurrent(toc.root.sections[1], 'Rashi on Genesis 2:3')).toBe(true);
  });

  test('a default node under a schema reads as its parent', () => {
    const toc = buildToc({
      title: 'Ramban on Genesis', heTitle: 'רמב״ן על בראשית',
      schema: {nodes: [
        {nodeType: 'JaggedArrayNode', depth: 1, title: 'Introduction', heTitle: 'הקדמה', key: 'Introduction', content_counts: 4},
        {nodeType: 'JaggedArrayNode', depth: 2, default: true, key: 'default', sectionNames: ['Chapter', 'Verse'], content_counts: [5, 7]},
      ]},
    });
    expect(toc.root.children[0].ref).toBe('Ramban on Genesis, Introduction');
    expect(toc.root.children[1].isDefault).toBe(true);
    expect(toc.root.children[1].sections.map(s => s.ref)).toEqual(['Ramban on Genesis 1', 'Ramban on Genesis 2']);
  });

  test('no schema, no table of contents', () => {
    expect(buildToc(null)).toBeNull();
    expect(buildToc({title: 'X'})).toBeNull();
  });
});

describe('addresses and ranges', () => {
  test('daf labels and positions', () => {
    expect([0, 1, 2, 3, 126].map(dafLabel)).toEqual(['1a', '1b', '2a', '2b', '64a']);
    expect(dafIndex('2a')).toBe(2);
    expect(dafIndex('13b')).toBe(25);
    expect(refPosition('Berakhot 13b:3', 'Berakhot')).toEqual([25, 3]);
    expect(refPosition('Genesis 12', 'Genesis')).toEqual([12]);
    expect(refPosition('Exodus 1', 'Genesis')).toBeNull();
  });

  test('a short range end takes its leading parts from the start', () => {
    const range = splitRange('Genesis 1:1-31', 'Genesis');
    expect(range.endParts).toEqual(['1', '31']);
    expect(rangeContains(range, [1, 31])).toBe(true);
    expect(rangeContains(range, [2, 1])).toBe(false);
  });
});
