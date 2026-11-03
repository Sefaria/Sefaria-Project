import {
  buildSegments, highlightRange, isSegmentLevel, stripHebrewMarks, groupVersions, splitVersionGroups, groupConnections,
  selectionRef, plainText, selectionText, citation, positionLabel, bookInfo, CITED_BY_CATEGORY, NIKKUD_RE,
} from '../textData';
import genesis from './fixtures/genesis1.json';
import berakhot from './fixtures/berakhot2a.json';
import rashi from './fixtures/rashi.json';
import links from './fixtures/links.json';

describe('segments', () => {
  test('Genesis 1: refs, Hebrew refs and labels', () => {
    const segs = buildSegments(genesis);
    expect(segs).toHaveLength(5);
    expect(segs[0]).toMatchObject({ ref: 'Genesis 1:1', heRef: 'בראשית א׳:א׳', n: 1, label: '1', heLabel: 'א׳', sectionRef: 'Genesis 1' });
    expect(segs[4].ref).toBe('Genesis 1:5');
    expect(segs[0].he).toMatch(/^<big>ב/);
    expect(segs[0].en).toContain('When God began');
    expect(isSegmentLevel(genesis)).toBe(false);
    expect(highlightRange(genesis)).toBeNull();
  });
  test('Talmud and commentary refs', () => {
    expect(buildSegments(berakhot)[2].ref).toBe('Berakhot 2a:3');
    expect(buildSegments(berakhot)[2].heRef).toBe('ברכות ב׳ א:ג׳');
    const r = buildSegments(rashi);
    expect(r[0].ref).toBe('Rashi on Genesis 1:1:1');
    expect(highlightRange(rashi)).toEqual({ from: 0, to: 0 });
  });
  test('range highlight and nested (depth+1) sections', () => {
    const range = { ...genesis, sections: [1, 2], toSections: [1, 4] };
    expect(highlightRange(range)).toEqual({ from: 1, to: 3 });
    const nested = { ref: 'Rashi on Genesis 1', sectionRef: 'Rashi on Genesis 1', heSectionRef: 'רש"י על בראשית א׳', text: [['a', 'b'], ['c']], he: [['א', 'ב'], ['ג']], textDepth: 3, sections: [1] };
    const segs = buildSegments(nested);
    expect(segs.map(s => s.ref)).toEqual(['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:2:1']);
    expect(segs[1].label).toBe('1:2');
    expect(segs[2].heLabel).toBe('ב׳:א׳');
  });
  test('missing language or string payloads', () => {
    expect(buildSegments({ ref: 'X 1', sectionRef: 'X 1', text: 'one', he: 'אחד' })).toHaveLength(1);
    expect(buildSegments({ ref: 'X 1', sectionRef: 'X 1', text: [], he: ['א', 'ב'] }).map(s => s.en)).toEqual(['', '']);
  });
});

describe('Hebrew marks', () => {
  const word = 'בְּרֵאשִׁ֖ית בָּרָ֣א';
  test('cantillation off keeps vowels; vowels off strips both; maqaf stays', () => {
    const noTaamim = stripHebrewMarks(word, { cantillation: false });
    expect(noTaamim).not.toMatch(/[֑-֯]/);
    expect(noTaamim).toMatch(/[ְ-ֽ]/);
    const bare = stripHebrewMarks(word, { vowels: false });
    expect(bare).toBe('בראשית ברא');
    expect(stripHebrewMarks('אֶת־הַ', { vowels: false })).toBe('את־ה');
    expect(stripHebrewMarks('<b>בְּ</b>', { vowels: false })).toBe('<b>ב</b>');
    expect(stripHebrewMarks(word)).toBe(word);
  });
});

describe('versions', () => {
  test('grouped Hebrew first, sorted by priority', () => {
    const groups = groupVersions(genesis.versions);
    expect(groups.map(g => g.lang)).toEqual(['he', 'en']);
    const en = groups[1].versions;
    expect(en[0].priority).toBeGreaterThanOrEqual(en[1].priority);
    expect(en[0].versionTitle).toBe('THE JPS TANAKH: Gender-Sensitive Edition');
    const { source, translation } = splitVersionGroups(groups);
    expect(source[0].lang).toBe('he');
    expect(translation.map(g => g.lang)).toEqual(['en']);
  });
  test('other languages after English, alphabetical', () => {
    const groups = groupVersions([{ language: 'en', versionTitle: 'B [fr]', actualLanguage: 'fr' }, { language: 'en', versionTitle: 'C', actualLanguage: 'en' }, { language: 'en', versionTitle: 'A [de]', actualLanguage: 'de' }, { language: 'he', versionTitle: 'H' }]);
    expect(groups.map(g => g.lang)).toEqual(['he', 'en', 'de', 'fr']);
  });
});

describe('connections', () => {
  const grouped = groupConnections(links);
  test('categories ordered, Commentary first with major commentators leading', () => {
    expect(grouped.total).toBe(links.length);
    expect(grouped.categories[0].category).toBe('Commentary');
    expect(grouped.categories.map(c => c.category)).not.toContain(CITED_BY_CATEGORY);
    const books = grouped.categories[0].books.map(b => b.title);
    expect(books.slice(0, 4)).toEqual(['Ibn Ezra', 'Ramban', 'Rashbam', 'Sforno']);
    expect(grouped.categories[1].category).toBe('Targum');
  });
  test('counts, Hebrew-only flags and cited-by split', () => {
    const commentary = grouped.categories[0];
    expect(commentary.count).toBe(commentary.books.reduce((n, b) => n + b.count, 0));
    const penei = commentary.books.find(b => b.title === 'Penei David');
    expect(penei.hasEnglish).toBe(false);
    expect(penei.count).toBe(2);
    expect(penei.heTitle).toBeTruthy();
    expect(grouped.citedBy.category).toBe(CITED_BY_CATEGORY);
    expect(grouped.citedBy.count).toBe(links.filter(l => l.category === CITED_BY_CATEGORY).length);
    expect(groupConnections([])).toEqual({ total: 0, categories: [], citedBy: null });
  });
});

describe('selection, text and citations', () => {
  const segs = buildSegments(genesis);
  test('selection refs', () => {
    expect(selectionRef([segs[1]])).toEqual({ ref: 'Genesis 1:2', heRef: 'בראשית א׳:ב׳' });
    expect(selectionRef(segs.slice(1, 4))).toEqual({ ref: 'Genesis 1:2-4', heRef: 'בראשית א׳:ב׳-ד׳' });
    const ch2 = buildSegments({ ...genesis, ref: 'Genesis 2', sectionRef: 'Genesis 2', heSectionRef: 'בראשית ב׳' });
    expect(selectionRef([segs[4], ch2[0], ch2[1]]).ref).toBe('Genesis 1:5-2:2');
    expect(selectionRef([segs[4], ch2[0]]).heRef).toBe('בראשית א׳:ה׳-ב׳:א׳');
    expect(selectionRef([])).toEqual({ ref: '', heRef: '' });
  });
  test('plain text drops footnotes and tags', () => {
    expect(plainText(segs[0].en)).toBe('When God began to create heaven and earth—');
    expect(plainText('a<br>b &amp; c&nbsp;d <i>e</i>')).toBe('a\nb & c d e');
    const { he, en } = selectionText(segs.slice(0, 2), { vowels: false });
    expect(he.split('\n')).toHaveLength(2);
    expect(he).not.toMatch(NIKKUD_RE);
    expect(he).toContain('־');   // maqaf is punctuation, not a vowel
    expect(en).toContain('\n');
  });
  test('citation styles', () => {
    const simple = citation({ ref: 'Genesis 1:2', book: 'Genesis', versionTitle: 'JPS 2023' });
    expect(simple).toBe('Genesis 1:2. JPS 2023. Sefaria. https://www.sefaria.org/Genesis.1.2.');
    const chicago = citation({ ref: 'Genesis 1:2-4', book: 'Genesis', versionTitle: 'JPS 2023', style: 'chicago', date: new Date(2026, 9, 1) });
    expect(chicago).toContain('accessed October 1, 2026');
    expect(chicago).toMatch(/^Genesis 1:2-4, JPS 2023, Sefaria, accessed/);
    expect(chicago.endsWith('https://www.sefaria.org/Genesis.1.2-4.')).toBe(true);
    expect(citation({ ref: 'Genesis 1:2', versionTitle: '' })).toBe('Genesis 1:2. Sefaria. https://www.sefaria.org/Genesis.1.2.');
  });
  test('position labels and book info', () => {
    expect(positionLabel(genesis)).toEqual({ en: 'Chapter 1', he: 'פרק א׳' });
    expect(positionLabel(berakhot)).toEqual({ en: 'Daf 2a', he: 'דף ב׳ א' });
    expect(positionLabel(rashi)).toEqual({ en: '1:1', he: 'א׳:א׳' });
    const info = bookInfo(genesis);
    expect(info).toMatchObject({ title: 'Genesis', heTitle: 'בראשית', primaryCategory: 'Tanakh', next: 'Genesis 2', prev: null });
  });
});
