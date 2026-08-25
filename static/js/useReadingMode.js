import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react';

// Unicode ranges for Hebrew diacritics
const CANTILLATION_RE = /[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5\u200d]/g;
const VOWELS_AND_CANTILLATION_RE = /[\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d]/g;

/**
 * Strip all nikud and cantillation from Hebrew text for matching purposes.
 */
function stripDiacritics(text) {
  return text.replace(/[\u0591-\u05C7\u200d]/g, '').trim();
}

/**
 * Normalize Hebrew text for speech matching.
 */
function normalize(text) {
  return stripDiacritics(text)
    .replace(/[\u05BE]/g, ' ')  // maqaf to space
    .replace(/[^\u05D0-\u05EA\s]/g, '')  // keep only Hebrew letters and spaces
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function wordsMatch(spoken, target) {
  if (spoken === target) return true;
  if (spoken.length === 0 || target.length === 0) return false;
  if (target.startsWith(spoken) || spoken.startsWith(target)) return true;
  if (target.length > 2 && spoken.length > 2) {
    const dist = levenshtein(spoken, target);
    const maxLen = Math.max(spoken.length, target.length);
    return dist / maxLen <= 0.3;
  }
  return false;
}

/**
 * Parse Hebrew HTML into word array. Strips HTML tags, splits on whitespace.
 */
function parseHebrewWords(html) {
  if (!html) return [];
  const text = html.replace(/<[^>]*>/g, '');
  return text.split(/\s+/).filter(w => w.length > 0);
}

/**
 * Strip vowels and cantillation from a single word.
 */
function stripWordDiacritics(word) {
  return word.replace(VOWELS_AND_CANTILLATION_RE, '');
}


// ── Context ──

const ReadingModeContext = createContext(null);

/**
 * ReadingModeProvider — wraps text display area to manage reading mode state.
 *
 * Props:
 *   active: boolean
 *   highlightedRefs: string[] — currently highlighted refs (starting point)
 */
function ReadingModeProvider({ active, highlightedRefs, children }) {
  // Registry of segments: Map<ref, { he: string, words: string[], order: number }>
  const segmentRegistryRef = useRef(new Map());
  const [registryVersion, setRegistryVersion] = useState(0);

  // Flat word list built from registry (ordered by document position)
  const [wordList, setWordList] = useState([]);
  const wordListRef = useRef([]);

  // Current position in word list
  const [globalWordIdx, setGlobalWordIdx] = useState(0);
  const globalWordIdxRef = useRef(0);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);

  // Register a segment's text. Called by TextSegment on mount/update.
  const registerSegment = useCallback((ref, heText, domOrder) => {
    const existing = segmentRegistryRef.current.get(ref);
    const words = parseHebrewWords(heText);
    if (existing && existing.he === heText) return; // no change
    segmentRegistryRef.current.set(ref, { he: heText, words, order: domOrder });
    setRegistryVersion(v => v + 1);
  }, []);

  const unregisterSegment = useCallback((ref) => {
    segmentRegistryRef.current.delete(ref);
    setRegistryVersion(v => v + 1);
  }, []);

  // Rebuild flat word list when registry changes
  useEffect(() => {
    if (!active) {
      wordListRef.current = [];
      setWordList([]);
      return;
    }
    const entries = Array.from(segmentRegistryRef.current.entries());
    entries.sort((a, b) => a[1].order - b[1].order);
    const flat = [];
    for (const [ref, data] of entries) {
      data.words.forEach((word, idx) => {
        flat.push({ ref, wordIndex: idx, original: word, clean: normalize(word) });
      });
    }
    wordListRef.current = flat;
    setWordList(flat);
  }, [active, registryVersion]);

  // Reset position when reading mode activates or highlighted ref changes
  useEffect(() => {
    if (!active || wordList.length === 0) return;
    const startRef = highlightedRefs?.[0];
    if (startRef) {
      const idx = wordList.findIndex(w => w.ref === startRef);
      const startIdx = idx >= 0 ? idx : 0;
      globalWordIdxRef.current = startIdx;
      setGlobalWordIdx(startIdx);
    } else {
      globalWordIdxRef.current = 0;
      setGlobalWordIdx(0);
    }
  }, [active, wordList.length > 0, highlightedRefs?.[0]]);

  // Match spoken words
  const matchWords = useCallback((transcript, isFinal) => {
    const wl = wordListRef.current;
    const spokenWords = normalize(transcript).split(/\s+/).filter(w => w.length > 0);
    if (spokenWords.length === 0 || wl.length === 0) return;

    let matchIdx = globalWordIdxRef.current;
    const LOOK_AHEAD = 5;

    for (const spokenWord of spokenWords) {
      if (matchIdx >= wl.length) break;
      let bestMatch = -1;
      let bestDist = Infinity;
      const searchEnd = Math.min(matchIdx + LOOK_AHEAD, wl.length);
      for (let i = matchIdx; i < searchEnd; i++) {
        if (wordsMatch(spokenWord, wl[i].clean)) {
          const dist = i - matchIdx;
          if (dist < bestDist) { bestDist = dist; bestMatch = i; }
        }
      }
      if (bestMatch >= 0) {
        matchIdx = bestMatch + 1;
      }
    }

    if (isFinal && matchIdx > globalWordIdxRef.current) {
      globalWordIdxRef.current = matchIdx;
      setGlobalWordIdx(matchIdx);
    } else if (!isFinal && matchIdx > globalWordIdxRef.current) {
      setGlobalWordIdx(matchIdx);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!active || wordListRef.current.length === 0) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        matchWords(event.results[i][0].transcript, event.results[i].isFinal);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        stopListening();
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        try { recognition.start(); } catch (e) { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    setIsListening(true);
    try { recognition.start(); } catch (e) { /* ignore */ }
  }, [active, matchWords]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  // Auto-start listening when reading mode activates, stop when deactivates
  useEffect(() => {
    if (active && wordList.length > 0 && !isListeningRef.current) {
      startListening();
    }
    if (!active) {
      stopListening();
    }
  }, [active, wordList.length > 0]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  /**
   * Get the reading state for a word.
   * @returns {'read' | 'current' | 'unread'}
   */
  const getWordState = useCallback((ref, wordIndex) => {
    if (!active) return 'unread';
    const wl = wordListRef.current;
    // Find in flat list
    const flatIdx = wl.findIndex(w => w.ref === ref && w.wordIndex === wordIndex);
    if (flatIdx < 0) return 'unread';
    if (flatIdx < globalWordIdx) return 'read';
    if (flatIdx === globalWordIdx) return 'current';
    return 'unread';
  }, [active, globalWordIdx]);

  const contextValue = useMemo(() => ({
    active,
    registerSegment,
    unregisterSegment,
    getWordState,
    isListening,
    startListening,
    stopListening,
    globalWordIdx,
  }), [active, registerSegment, unregisterSegment, getWordState, isListening, startListening, stopListening, globalWordIdx]);

  return (
    <ReadingModeContext.Provider value={contextValue}>
      {children}
    </ReadingModeContext.Provider>
  );
}

function useReadingModeContext() {
  return useContext(ReadingModeContext);
}

export { ReadingModeContext, ReadingModeProvider, useReadingModeContext, parseHebrewWords, stripWordDiacritics, VOWELS_AND_CANTILLATION_RE };
export default ReadingModeProvider;
