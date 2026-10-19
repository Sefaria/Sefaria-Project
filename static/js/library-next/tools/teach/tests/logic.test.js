import { GRADE_LEVELS, GRADE_FONT_SCALE, handoutModel, handoutHtml, handoutMarkdown } from '../handout';
import { quoteFor, discussionPrompt } from '../discussion';
import genesis from '../../../reader/tests/fixtures/genesis1.json';
import { buildSegments, bookInfo, selectionRef } from '../../../reader/textData';

const segments = buildSegments(genesis).slice(0, 2);
const selection = { ...selectionRef(segments), segments, he: segments.map(s => s.he).join('\n'), en: segments.map(s => s.en).join('\n') };
const book = bookInfo(genesis);

describe('handout', () => {
  test('model carries both languages, versions and the grade scale', () => {
    const model = handoutModel({ selection, book, grade: 'elementary' });
    expect(model.ref).toBe('Genesis 1:1-2');
    expect(model.he).toHaveLength(2);
    expect(model.en).toHaveLength(2);
    expect(model.he[0]).not.toMatch(/<|>/);
    expect(model.versionTitle).toBe(genesis.versionTitle);
    expect(model.heVersionTitle).toBe(genesis.heVersionTitle);
    expect(model.scale).toBe(GRADE_FONT_SCALE.elementary);
    expect(GRADE_LEVELS).toEqual(['elementary', 'middle', 'high', 'adult']);
    expect(handoutModel({ selection, book, grade: 'bogus' }).grade).toBe('high');
  });
  test('content language drops a side; vowels can be stripped', () => {
    expect(handoutModel({ selection, book, contentLang: 'en' }).he).toEqual([]);
    expect(handoutModel({ selection, book, contentLang: 'he' }).en).toEqual([]);
    expect(handoutModel({ selection, book, vowels: false }).he[0]).not.toMatch(/[ְ-ֽ]/);
  });
  test('HTML card escapes text and carries captions; the document form has the print stylesheet', () => {
    const model = handoutModel({ selection, book });
    const html = handoutHtml(model, { source: 'Source', translation: 'Translation', gradeNote: 'Read <aloud>', from: 'From' }, { lang: 'he' });
    expect(html).toContain('class="ln-handout bi"');
    expect(html).toContain('Read &lt;aloud&gt;');
    expect(html).toContain(`Translation: ${genesis.versionTitle}`);
    expect(html).toContain('https://www.sefaria.org/Genesis.1.1-2');
    expect(html).not.toContain('<!doctype');
    const doc = handoutHtml(model, {}, { document: true, lang: 'he', writingLines: 3 });
    expect(doc).toMatch(/^<!doctype html><html lang="he" dir="rtl">/);
    expect(doc).toContain('@media print');
    expect((doc.match(/<div><\/div>/g) || []).length).toBe(3);
  });
  test('Markdown card quotes each line and ends with the attribution', () => {
    const md = handoutMarkdown(handoutModel({ selection, book }), { source: 'מקור', translation: 'תרגום', from: 'מתוך' });
    expect(md.startsWith('## Genesis 1:1-2 · בראשית א׳:א׳-ב׳')).toBe(true);
    expect(md).toContain('> 1. ');
    expect(md).toContain(`תרגום: ${genesis.versionTitle}`);
    expect(md.trim().endsWith('מתוך https://www.sefaria.org/Genesis.1.1-2')).toBe(true);
  });
});

describe('discussion prompt', () => {
  test('quotes the English text, trimmed at a word boundary', () => {
    const quote = quoteFor(selection, 40);
    expect(quote.length).toBeLessThanOrEqual(41);
    expect(quote.endsWith('…')).toBe(true);
    expect(quoteFor({ segments: [{ he: 'שלום', en: '' }] })).toBe('שלום');
  });
  test('prompt names the ref, category, the quote and the current questions, in both languages', () => {
    const en = discussionPrompt({ selection, book, lang: 'en', current: ['Why?', ''] });
    expect(en).toContain('I am teaching Genesis 1:1-2 (Tanakh)');
    expect(en).toContain('"When God began');
    expect(en).toContain('(1) Why?');
    const he = discussionPrompt({ selection, book, lang: 'he' });
    expect(he).toContain('בראשית א׳:א׳-ב׳');
    expect(he).toContain('הצע/י שלוש שאלות');
  });
});

test('every teach and research string has EN and HE', () => {
  jest.isolateModules(() => {
    const i18n = require('../../../i18n');
    const spy = jest.spyOn(i18n, 'addStrings');
    require('../strings');
    require('../../research/strings');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mock.calls.forEach(([table]) => Object.entries(table).forEach(([key, v]) => {
      expect(typeof v.en).toBe('string'); expect(v.en.trim()).not.toBe('');
      expect(typeof v.he).toBe('string'); expect(v.he.trim()).not.toBe('');
      expect(key).toMatch(/^(teach|research)\./);
    }));
  });
});
