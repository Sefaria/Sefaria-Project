import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';

/*
 * Translation feedback POC.
 *
 * Double-clicking a word in the *translation* side of a segment (the `.contentSpan.translation`
 * rendered by VersionContent) opens a small modal where the reader can suggest a replacement for
 * that word and/or leave a comment. Double-clicks on the primary (source) text are ignored, and the
 * browser's own double-click word selection is left untouched, so the existing selection behavior
 * (selected-words lookup, segment highlight) keeps working.
 *
 * The word is identified by its occurrence index among whole-word matches in the span's
 * textContent. sefaria/model/translation_feedback.py applies the same rule to the stored HTML
 * (tags stripped, entities decoded) so the server can replace exactly that instance.
 */

const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;
const MAX_WORD_LEN = 100;
const MAX_SUGGESTION_LEN = 300;
const MAX_COMMENT_LEN = 5000;

const isWordChar = (ch) => !!ch && WORD_CHAR.test(ch);

export function wordMatchStarts(text, word) {
  // Start offsets of whole-word, non-overlapping matches of `word` in `text`.
  // Mirrors word_pattern() + finditer in sefaria/model/translation_feedback.py.
  const starts = [];
  if (!word) { return starts; }
  let i = text.indexOf(word);
  while (i !== -1) {
    const end = i + word.length;
    // Look at whole code points on either side (Array.from handles astral chars).
    const before = i > 0 ? Array.from(text.slice(Math.max(0, i - 2), i)).pop() : '';
    const after = end < text.length ? Array.from(text.slice(end, end + 2))[0] : '';
    if (!isWordChar(before) && !isWordChar(after)) {
      starts.push(i);
      i = text.indexOf(word, end);
    } else {
      i = text.indexOf(word, i + 1);
    }
  }
  return starts;
}

export function trimToWord(selected) {
  // Strip leading/trailing whitespace and punctuation from a double-click selection.
  const chars = Array.from(selected);
  let s = 0, e = chars.length;
  while (s < e && !isWordChar(chars[s])) { s++; }
  while (e > s && !isWordChar(chars[e - 1])) { e--; }
  if (s >= e) { return null; }
  return {leading: chars.slice(0, s).join('').length, word: chars.slice(s, e).join('')};
}

export function getTranslationFeedbackTarget(event) {
  // Returns {ref, versionTitle, actualLanguage, word, occurrence, charOffset} when `event` is a
  // double-click on a word in a translation, else null.
  const target = event.target;
  if (!target || !target.closest || typeof window === 'undefined') { return null; }
  const span = target.closest('.contentSpan.translation');
  if (!span) { return null; }
  const segment = span.closest('.segment[data-ref]');
  const versionTitle = segment && segment.getAttribute('data-translation-vtitle');
  if (!versionTitle) { return null; }
  if (target.closest('sup, a[data-ref]')) { return null; } // footnote markers and citation links keep their own behavior

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) { return null; }
  const range = selection.getRangeAt(0);
  if (!span.contains(range.startContainer)) { return null; }

  const trimmed = trimToWord(range.toString());
  if (!trimmed || trimmed.word.length > MAX_WORD_LEN || /\s/.test(trimmed.word)) { return null; }

  const pre = document.createRange();
  pre.selectNodeContents(span);
  pre.setEnd(range.startContainer, range.startOffset);
  const charOffset = pre.toString().length + trimmed.leading;

  const text = span.textContent;
  const starts = wordMatchStarts(text, trimmed.word);
  const occurrence = starts.findIndex(st => st <= charOffset && charOffset < st + trimmed.word.length);
  if (occurrence === -1) { return null; }

  return {
    ref: segment.getAttribute('data-ref'),
    versionTitle,
    actualLanguage: segment.getAttribute('data-translation-lang') || null,
    word: trimmed.word,
    occurrence,
    charOffset,
  };
}

const stopPropagation = (e) => e.stopPropagation();

export const TranslationFeedbackModal = ({target, onClose, onSaved}) => {
  const dialogRef = useRef(null);
  const [suggestion, setSuggestion] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) { return; }
    if (dialog.showModal && !dialog.open) { dialog.showModal(); }
    // If the browser closes the dialog itself (e.g. Escape), sync our state.
    const onNativeClose = () => onClose();
    dialog.addEventListener('close', onNativeClose);
    return () => {
      dialog.removeEventListener('close', onNativeClose);
      if (dialog.open) { dialog.close(); }
    };
  }, []);

  const canSave = !saving && (suggestion.trim().length > 0 || comment.trim().length > 0);

  const save = async (e) => {
    e.preventDefault();
    if (!canSave) { return; }
    setSaving(true);
    setError(null);
    try {
      await Sefaria.apiRequestWithBody('/api/translation-feedback', null, {
        ...target,
        suggestion: suggestion.trim(),
        comment: comment.trim(),
      });
      onSaved();
    } catch (err) {
      setSaving(false);
      setError(err.message || 'Something went wrong. Please try again.');
    }
  };

  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const onDialogClick = (e) => {
    e.stopPropagation();
    if (e.target === dialogRef.current) { onClose(); } // click on the backdrop
  };

  return (
    // Stop events here so they don't reach TextColumn's selection / click handlers.
    <div onMouseUp={stopPropagation} onMouseDown={stopPropagation} onDoubleClick={stopPropagation}>
      <dialog ref={dialogRef} className="translationFeedbackDialog" onClick={onDialogClick} onKeyDown={onKeyDown}
              aria-labelledby="translationFeedbackTitle">
        <form className="translationFeedbackForm" onSubmit={save}>
          <h2 id="translationFeedbackTitle">Translation Feedback</h2>
          <div className="translationFeedbackField">
            <label>Ref</label>
            <div className="readOnlyValue">{target.ref}</div>
            <div className="translationFeedbackMeta">{target.versionTitle}</div>
          </div>
          <div className="translationFeedbackField">
            <label>Word</label>
            <div className="readOnlyValue selectedWord">{target.word}</div>
          </div>
          <div className="translationFeedbackField">
            <label htmlFor="translationFeedbackSuggestion">Change Suggestion <span className="optional">(optional)</span></label>
            <div className="translationFeedbackHelp">If you think we could have done better with this word, make your suggestion</div>
            <input id="translationFeedbackSuggestion" type="text" value={suggestion} maxLength={MAX_SUGGESTION_LEN}
                   autoFocus onChange={e => setSuggestion(e.target.value)} />
          </div>
          <div className="translationFeedbackField">
            <label htmlFor="translationFeedbackComment">Comment</label>
            <div className="translationFeedbackHelp">If you make a suggestion, describe your reasoning. If you have general feedback, let us know what’s on your mind!</div>
            <textarea id="translationFeedbackComment" rows={5} value={comment} maxLength={MAX_COMMENT_LEN}
                      onChange={e => setComment(e.target.value)} />
          </div>
          {error ? <div className="translationFeedbackError">{error}</div> : null}
          <div className="translationFeedbackButtons">
            <button type="button" className="button small white" onClick={onClose}>Cancel</button>
            <button type="submit" className="button small" disabled={!canSave}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
TranslationFeedbackModal.propTypes = {
  target: PropTypes.shape({
    ref: PropTypes.string.isRequired,
    versionTitle: PropTypes.string.isRequired,
    word: PropTypes.string.isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

export const TranslationFeedbackToast = ({onDone}) => {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, []);
  return <div className="translationFeedbackToast" role="status">Thanks for helping serve the Jewish People</div>;
};
TranslationFeedbackToast.propTypes = {
  onDone: PropTypes.func.isRequired,
};
