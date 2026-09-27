/**
 * Translation feedback POC (segment level): the double-click target and the helpers the modal uses.
 */
jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: {} }));

import { getTranslationFeedbackTarget, normalizeSpace, segmentTextsUrl } from '../TranslationFeedback.jsx';

const segmentHtml = `
  <div class="segment" data-ref="Genesis 1:1" data-translation-vtitle="Test Version" data-translation-lang="en">
    <p class="segmentText">
      <span class="contentSpan primary"><span class="he">בראשית ברא</span></span>
      <span class="contentSpan translation"><span class="en">In the beginning <i>God</i>
        created<sup class="footnote-marker">1</sup> <a data-ref="Genesis 2:1">heaven</a></span></span>
    </p>
  </div>`;

describe('getTranslationFeedbackTarget', () => {
  beforeEach(() => { document.body.innerHTML = segmentHtml; });

  test('returns the whole segment for a double-click anywhere in the translation', () => {
    const target = getTranslationFeedbackTarget({target: document.querySelector('.contentSpan.translation i')});
    expect(target).toEqual({
      ref: 'Genesis 1:1',
      versionTitle: 'Test Version',
      actualLanguage: 'en',
      translationText: 'In the beginning God created1 heaven',
    });
  });

  test('ignores the primary text, footnote markers and citation links', () => {
    expect(getTranslationFeedbackTarget({target: document.querySelector('.he')})).toBeNull();
    expect(getTranslationFeedbackTarget({target: document.querySelector('sup')})).toBeNull();
    expect(getTranslationFeedbackTarget({target: document.querySelector('a[data-ref]')})).toBeNull();
  });

  test('ignores segments without a translation version', () => {
    document.querySelector('.segment').removeAttribute('data-translation-vtitle');
    expect(getTranslationFeedbackTarget({target: document.querySelector('.contentSpan.translation i')})).toBeNull();
  });
});

describe('helpers', () => {
  test('normalizeSpace collapses whitespace', () => {
    expect(normalizeSpace('  a\n  b\tc ')).toBe('a b c');
    expect(normalizeSpace(null)).toBe('');
  });

  test('segmentTextsUrl encodes params', () => {
    expect(segmentTextsUrl({ref: 'Genesis 1:1', versionTitle: 'A & B', actualLanguage: 'en'}))
      .toBe('/api/translation-feedback/segment?ref=Genesis+1%3A1&versionTitle=A+%26+B&actualLanguage=en');
    expect(segmentTextsUrl({ref: 'Genesis 1:1', versionTitle: 'V'})).toBe('/api/translation-feedback/segment?ref=Genesis+1%3A1&versionTitle=V');
  });
});
