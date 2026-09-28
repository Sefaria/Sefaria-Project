/* Testing done using Jest */
import Sefaria from '../sefaria';
import {
  wordAt, toSegments, render, resolveOptions, recordCopy, shouldPitch, stashPending, takePending,
  LEVELS, FORMATS, NOTES, VOWELS, DEFAULT_SETTINGS,
} from '../copyTool';

const meta = {
  ref: 'Genesis 1', heRef: 'בראשית א׳', sectionRef: 'Genesis 1', book: 'Genesis',
  sections: ['1'], toSections: ['1'], textDepth: 2, isSpanning: false,
};
const versionInfo = {
  source: {versionTitle: 'Miqra', direction: 'rtl', language: 'he'},
  translation: {versionTitle: 'JPS', license: 'CC-BY', direction: 'ltr', language: 'en'},
};
const segments = toSegments(meta, {
  source: ['בְּרֵאשִׁ֖ית בָּרָ֣א', 'וְהָאָ֗רֶץ'],
  translation: ['In the <b>beginning</b><sup class="footnote-marker">*</sup><i class="footnote">Or "when"</i>', 'The earth'],
});
const data = {level: LEVELS.SECTION, meta, versionInfo, segments};
const opts = (o) => ({...DEFAULT_SETTINGS, citation: false, ...o});

describe('wordAt', () => {
  test('finds the word around an offset', () => {
    expect(wordAt('In the beginning, God', 9)).toBe('beginning');
  });
  test('handles a click just past the end of a word', () => {
    expect(wordAt('In the beginning, God', 16)).toBe('beginning');
  });
  test('splits Hebrew on maqaf and keeps nikkud', () => {
    expect(wordAt('אֶת־הַשָּׁמַיִם', 6)).toBe('הַשָּׁמַיִם');
  });
  test('returns null on whitespace between words', () => {
    expect(wordAt('a  b', 2)).toBe(null);
  });
});

describe('toSegments', () => {
  test('numbers segments of a section and builds their refs', () => {
    expect(segments.map(s => [s.ref, s.number])).toEqual([['Genesis 1:1', 1], ['Genesis 1:2', 2]]);
  });
  test('handles a single segment with string sections', () => {
    const segMeta = {...meta, ref: 'Genesis 1:3', sections: ['1', '3'], toSections: ['1', '3']};
    expect(toSegments(segMeta, {translation: 'Light'})).toEqual([{ref: 'Genesis 1:3', number: 3, source: '', translation: 'Light'}]);
  });
});

describe('render', () => {
  test('plain, bilingual, stacked per segment', () => {
    expect(render(data, opts({format: FORMATS.PLAIN})).plain)
      .toBe('בְּרֵאשִׁ֖ית בָּרָ֣א\nIn the beginning\n\nוְהָאָ֗רֶץ\nThe earth');
  });
  test('notes inline, at end, or omitted', () => {
    const translationOnly = {...data, versionInfo: {translation: versionInfo.translation}};
    expect(render(translationOnly, opts({format: FORMATS.PLAIN, notes: NOTES.INLINE})).plain)
      .toBe('In the beginning [Or "when"]\nThe earth');
    expect(render(translationOnly, opts({format: FORMATS.MARKDOWN, notes: NOTES.END})).plain)
      .toBe('In the **beginning**[^1]\n\nThe earth\n\n[^1]: Or "when"');
    expect(render(translationOnly, opts({format: FORMATS.PLAIN})).hasNotes).toBe(true);
  });
  test('vowel options strip cantillation, then nikkud', () => {
    const sourceOnly = {...data, versionInfo: {source: versionInfo.source}};
    expect(render(sourceOnly, opts({format: FORMATS.PLAIN, vowels: VOWELS.VOWELS})).plain).toBe('בְּרֵאשִׁית בָּרָא\nוְהָאָרֶץ');
    expect(render(sourceOnly, opts({format: FORMATS.PLAIN, vowels: VOWELS.NONE})).plain).toBe('בראשית ברא\nוהארץ');
  });
  test('segment numbers use Hebrew numerals for Hebrew-only output', () => {
    const sourceOnly = {...data, versionInfo: {source: versionInfo.source}};
    expect(render(sourceOnly, opts({format: FORMATS.PLAIN, vowels: VOWELS.NONE, segmentNumbers: true})).plain)
      .toBe('(א) בראשית ברא\n(ב) והארץ');
  });
  test('formatted gives html with direction plus a plain fallback', () => {
    jest.spyOn(Sefaria, 'normRef').mockImplementation(r => r.replace(/ /g, '_'));
    Sefaria.interfaceLang = 'english';
    const out = render(data, opts({format: FORMATS.FORMATTED, citation: true}));
    expect(out.html).toContain('<p dir="rtl" lang="he">בְּרֵאשִׁ֖ית בָּרָ֣א</p>');
    expect(out.html).toContain('<p dir="ltr" lang="en">In the <b>beginning</b></p>');
    expect(out.html).toContain('>Genesis 1</a>, Miqra; JPS (CC-BY)');
    expect(out.plain).toContain('— Genesis 1, Miqra; JPS (CC-BY), ');
  });
  test('html source pastes markup as text', () => {
    const out = render(data, opts({format: FORMATS.HTML}));
    expect(out.html).toBe(null);
    expect(out.plain.startsWith('<p dir="rtl"')).toBe(true);
  });
  test('word level', () => {
    const wordData = {level: LEVELS.WORD, word: 'בְּרֵאשִׁ֖ית', wordLang: 'source', meta, versionInfo: {source: versionInfo.source}, segments: []};
    expect(render(wordData, opts({format: FORMATS.PLAIN, vowels: VOWELS.VOWELS})).plain).toBe('בְּרֵאשִׁית');
  });
});

describe('resolveOptions', () => {
  const info = {
    defaults: {source: {versionTitle: 'Miqra'}, translation: null},
    levels: [{level: LEVELS.SEGMENT}, {level: LEVELS.SECTION}],
  };
  test('falls back to the segment level and to available languages', () => {
    const target = {shown: {source: false, translation: true}};
    const o = resolveOptions(target, info, {...DEFAULT_SETTINGS, level: LEVELS.WORD});
    expect(o.level).toBe(LEVELS.SEGMENT);
    expect(o.languages).toEqual({source: true, translation: false});
  });
});

describe('anonymous gating and pending requests', () => {
  beforeEach(() => { window.localStorage.clear(); Sefaria._uid = null; });
  test('anonymous users get one copy before the pitch', () => {
    expect(shouldPitch()).toBe(false);
    recordCopy();
    expect(shouldPitch()).toBe(true);
  });
  test('logged-in users are never pitched', () => {
    Sefaria._uid = 1;
    recordCopy();
    expect(shouldPitch()).toBe(false);
  });
  test('a pending request is taken once', () => {
    stashPending({ref: 'Genesis 1:1'});
    expect(takePending()).toEqual({ref: 'Genesis 1:1'});
    expect(takePending()).toBe(null);
  });
});

describe('pipeline on real API responses (Genesis 1, trimmed)', () => {
  // Captured from /api/v3/texts/Genesis.1?version=primary|translation&fill_in_missing_segments=0
  const fixture = require('./fixtures/copyToolGenesis1.json');
  const {loadTargetInfo, loadCopyData} = require('../copyTool');
  const segment = (section) => ({
    ...section, ref: 'Genesis 1:1', heRef: 'בראשית א׳:א׳', sections: ['1', '1'], toSections: ['1', '1'],
    versions: [{...section.versions[0], text: section.versions[0].text[0]}],
  });
  const target = {
    ref: 'Genesis 1:1', word: 'God', wordLang: 'translation',
    versions: {source: null, translation: null}, shown: {source: true, translation: true},
  };

  beforeEach(() => {
    Sefaria.interfaceLang = 'english';
    jest.spyOn(Sefaria, 'normRef').mockImplementation(r => r.replace(/[ :]/g, '.'));
    jest.spyOn(Sefaria, 'getVersions').mockResolvedValue({
      he: [fixture.he.versions[0]], en: [fixture.en.versions[0]],
    });
    jest.spyOn(Sefaria, '_getVersionObjects').mockResolvedValue([{languageFamilyName: 'primary'}, {languageFamilyName: 'translation'}]);
    jest.spyOn(Sefaria, '_ApiPromise').mockImplementation(url => {
      const section = url.includes('version=hebrew') ? fixture.he : fixture.en;
      return Promise.resolve(url.includes('/Genesis.1.1?') ? segment(section) : section);
    });
  });

  test('levels are named from the book structure', async () => {
    const info = await loadTargetInfo(target, null);
    expect(info.levels.map(l => [l.level, l.name, l.ref])).toEqual([
      ['word', undefined, undefined], ['segment', 'Verse', 'Genesis 1:1'], ['section', 'Chapter', 'Genesis 1'],
    ]);
    expect(info.defaults.translation.versionTitle).toBe('THE JPS TANAKH: Gender-Sensitive Edition');
  });

  test('chapter, both languages, markdown with endnotes and numbers', async () => {
    const info = await loadTargetInfo(target, null);
    const options = resolveOptions(target, info, {
      ...DEFAULT_SETTINGS, level: LEVELS.SECTION, format: FORMATS.MARKDOWN, notes: NOTES.END,
      segmentNumbers: true, vowels: VOWELS.NONE,
    });
    const out = render(await loadCopyData(target, info, options), options).plain;
    // Markdown puts every line in its own paragraph. "None" also drops sof pasuq, as the reader does.
    expect(out.split('\n\n')).toEqual([
      '**1** בראשית ברא אלהים את השמים ואת הארץ',
      'When God began to create[^1] heaven and earth—',
      '**2** והארץ היתה תהו ובהו וחשך על־פני תהום ורוח אלהים מרחפת על־פני המים',
      'the earth being unformed and void, with darkness over the surface of the deep and a wind from[^2] God sweeping over the water—',
      '[^1]: **When God began to create** In contrast to others “In the beginning God created.”\n' +
        '[^2]: **a wind from** In contrast to others “the spirit of.”',
      '— [Genesis 1](http://localhost/Genesis.1), Miqra according to the Masorah (CC-BY-SA); ' +
        'THE JPS TANAKH: Gender-Sensitive Edition (CC-BY-NC)',
    ]);
  });

  test('word in the translation, with citation', async () => {
    const info = await loadTargetInfo(target, null);
    const options = resolveOptions(target, info, {...DEFAULT_SETTINGS, level: LEVELS.WORD, format: FORMATS.PLAIN});
    const out = render(await loadCopyData(target, info, options), options).plain;
    expect(out).toBe('God\n\n— Genesis 1:1, THE JPS TANAKH: Gender-Sensitive Edition (CC-BY-NC), http://localhost/Genesis.1.1');
  });
});
