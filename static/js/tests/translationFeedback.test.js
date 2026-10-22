/**
 * Translation feedback POC (segment level): the double-click target and the helpers the modal uses.
 */
jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: {} }));

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { getTranslationFeedbackTarget, normalizeSpace, segmentTextsUrl, marksForSegment, segmentMarksUrl, SegmentFeedbackMarks } from '../TranslationFeedback.jsx';

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

describe('reader marks', () => {
  const marks = {
    'Genesis 1:1': {
      pending: [
        {id: 'b', versionTitle: 'Test Version', suggestion: 'Newest suggestion', created: 1790000000},
        {id: 'a', versionTitle: 'Test Version', suggestion: 'Older suggestion', created: 1789000000},
        {id: 'x', versionTitle: 'Other Version', suggestion: 'Other translation', created: 1789000000},
      ],
      changed: [{versionTitle: 'Test Version', at: 1789500000}],
    },
    'Genesis 1:2': {pending: [], changed: [{versionTitle: 'Other Version', at: 1789500000}]},
  };

  test('marksForSegment keeps only the translation shown', () => {
    const m = marksForSegment(marks, 'Genesis 1:1', 'Test Version');
    expect(m.pending.map(p => p.id)).toEqual(['b', 'a']);
    expect(m.changed.at).toBe(1789500000);
    expect(marksForSegment(marks, 'Genesis 1:2', 'Test Version')).toBeNull();
    expect(marksForSegment(marks, 'Genesis 1:3', 'Test Version')).toBeNull();
    expect(marksForSegment(null, 'Genesis 1:1', 'Test Version')).toBeNull();
  });

  test('segmentMarksUrl encodes the ref', () => {
    expect(segmentMarksUrl('Rashi on Genesis 1')).toBe('/api/translation-feedback/marks?ref=Rashi+on+Genesis+1');
  });

  const renderInto = (element) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { ReactDOM.render(element, container); });
    return container;
  };

  test('SegmentFeedbackMarks shows the newest suggestion, the badge, and expands', () => {
    const m = marksForSegment(marks, 'Genesis 1:1', 'Test Version');
    const container = renderInto(<SegmentFeedbackMarks pending={m.pending} changed={m.changed}/>);
    expect(container.textContent).toContain("Updated from a reader's suggestion");
    expect(container.textContent).toContain('Newest suggestion');
    expect(container.textContent).not.toContain('Older suggestion');
    const more = container.querySelector('.segmentFeedbackMore');
    expect(more.textContent).toBe('+1 more suggestion');
    act(() => { more.dispatchEvent(new MouseEvent('click', {bubbles: true})); });
    expect(container.textContent).toContain('Older suggestion');
  });

  test('SegmentFeedbackMarks renders nothing without marks', () => {
    const container = renderInto(<SegmentFeedbackMarks pending={[]} changed={null}/>);
    expect(container.innerHTML).toBe('');
  });
});
