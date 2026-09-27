/**
 * Translation feedback POC: the client-side word locator must agree with the server's
 * (sefaria/model/translation_feedback.py) on which instance of a word was double-clicked.
 */
jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: {} }));

import { wordMatchStarts, trimToWord } from '../TranslationFeedback.jsx';

describe('wordMatchStarts', () => {
  test('matches whole words only', () => {
    const text = 'And God saw the Godly light; God said';
    expect(wordMatchStarts(text, 'God')).toEqual([4, 29]);
  });

  test('is case sensitive and non-overlapping', () => {
    expect(wordMatchStarts('the The the', 'the')).toEqual([0, 8]);
    expect(wordMatchStarts('a’a’a a’a', 'a’a')).toEqual([0, 6]);
  });

  test('handles non-Latin letters and combining marks as word characters', () => {
    expect(wordMatchStarts('שלום ושלום שלום', 'שלום')).toEqual([0, 11]);
    expect(wordMatchStarts('café cafe', 'cafe')).toEqual([6]);
  });
});

describe('trimToWord', () => {
  test('strips surrounding whitespace and punctuation', () => {
    expect(trimToWord(' light, ')).toEqual({leading: 1, word: 'light'});
    expect(trimToWord('“God’s”')).toEqual({leading: 1, word: 'God’s'});
    expect(trimToWord(' ... ')).toBeNull();
  });
});
