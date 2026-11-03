import { jaggedSections, schemaRows, altRows, structures, versionBuckets, sectionLabel } from '../bookToc';
import { GENESIS, BERAKHOT, HAGGADAH, VERSIONS } from './fixtures';

test('section labels per address type', () => {
  expect(sectionLabel('Perek', 0)).toEqual({ en: '1', he: 'א', address: '1' });
  expect(sectionLabel('Talmud', 2)).toEqual({ en: '2a', he: 'ב.', address: '2a' });
  expect(sectionLabel('Integer', 14).he).toBe('טו');
});

test('jaggedSections skips empty sections and builds section refs', () => {
  expect(jaggedSections(GENESIS.schema, 'Genesis').map(s => s.ref)).toEqual(['Genesis 1', 'Genesis 2', 'Genesis 3']);
  expect(jaggedSections(BERAKHOT.schema, 'Berakhot').map(s => s.en)).toEqual(['2a', '2b', '3a', '3b']);
  expect(jaggedSections({ lengths: [2] }, 'X').map(s => s.ref)).toEqual(['X 1', 'X 2']);
});

test('schemaRows flattens a complex schema with node refs', () => {
  const rows = schemaRows(HAGGADAH.schema, 'Pesach Haggadah');
  expect(rows.map(r => [r.depth, r.leaf, r.ref])).toEqual([
    [1, true, 'Pesach Haggadah, Kadesh'],
    [1, false, 'Pesach Haggadah, Magid'],
    [2, true, 'Pesach Haggadah, Magid, Ha Lachma Anya'],
    [2, true, 'Pesach Haggadah, Magid, Dayenu'],
  ]);
  expect(rows[3].sections.map(s => s.ref)).toEqual(['Pesach Haggadah, Magid, Dayenu 1', 'Pesach Haggadah, Magid, Dayenu 2']);
  expect(rows[0].sections).toEqual([]);
});

test('altRows expands refs only when the structure includes sections', () => {
  const parashot = altRows(GENESIS.alts.Parasha, 'Genesis');
  expect(parashot.map(r => r.ref)).toEqual(['Genesis 1:1-6:8', 'Genesis 6:9-11:32']);
  expect(parashot[0].sections).toEqual([]);
  const chapters = altRows(BERAKHOT.alts.Chapters, 'Berakhot');
  expect(chapters[0].sections.map(s => s.en)).toEqual(['2a', '2b', '3a', '3b']);
});

test('structures: default schema first unless default_struct / exclude_structs say otherwise', () => {
  expect(structures(GENESIS).map(s => s.id)).toEqual(['schema', 'Parasha']);
  expect(structures(GENESIS)[0].label).toEqual({ en: 'Chapter', he: 'פרק' });
  expect(structures(GENESIS)[1].label).toEqual({ en: 'Parasha', he: 'Parasha' });
  expect(structures(BERAKHOT).map(s => s.id)).toEqual(['Chapters']);
  expect(structures(HAGGADAH)).toEqual([{ id: 'schema', kind: 'schema', label: null }]);
});

test('versionBuckets groups he / en / other and sorts by priority', () => {
  const byLang = { he: [VERSIONS[0]], en: [VERSIONS[1]], fr: [VERSIONS[2]] };
  const b = versionBuckets(byLang);
  expect(b.he.map(v => v.versionTitle)).toEqual(['Tanach with Nikkud']);
  expect(b.en.map(v => v.versionTitle)).toEqual(['The Holy Scriptures']);
  expect(b.other.map(v => v.versionTitle)).toEqual(['Bible en français [fr]']);
});
