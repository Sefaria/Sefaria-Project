import React, { useEffect, useRef } from 'react';
import { useReadingModeContext, VOWELS_AND_CANTILLATION_RE } from './useReadingMode';

/**
 * Strip vowels and cantillation from a word.
 */
function stripDiacritics(word) {
  return word.replace(VOWELS_AND_CANTILLATION_RE, '');
}

// Monotonic counter scoped per provider via ref. Reset each render cycle.
let mountOrder = 0;

/**
 * ReadingModeText — renders Hebrew text word-by-word with reading mode states.
 * Unread words: stripped of vowels/cantillation
 * Current word: bolded, full diacritics shown
 * Read words: full diacritics shown
 */
const ReadingModeText = ({ sref, heText }) => {
  const readingMode = useReadingModeContext();
  const orderRef = useRef(null);

  useEffect(() => {
    if (!readingMode?.active || !heText) return;

    // Assign a mount order for segment ordering (effects fire in DOM order)
    if (orderRef.current === null) {
      orderRef.current = mountOrder++;
    }
    readingMode.registerSegment(sref, heText, orderRef.current);

    return () => {
      readingMode.unregisterSegment(sref);
    };
  }, [readingMode?.active, sref, heText]);

  if (!readingMode?.active || !heText) {
    return null;
  }

  // Parse the HTML text into words (strip tags first)
  const plainText = heText.replace(/<[^>]*>/g, '');
  const words = plainText.split(/\s+/).filter(w => w.length > 0);

  return (
    <span className="contentSpan he primary" lang="he" dir="rtl">
      {words.map((word, idx) => {
        const state = readingMode.getWordState(sref, idx);
        const displayWord = state === 'unread' ? stripDiacritics(word) : word;
        const className = `readingModeWord readingMode-${state}`;
        return (
          <React.Fragment key={idx}>
            <span className={className}>{displayWord}</span>
            {idx < words.length - 1 ? ' ' : ''}
          </React.Fragment>
        );
      })}
      {' '}
    </span>
  );
};

export default ReadingModeText;
