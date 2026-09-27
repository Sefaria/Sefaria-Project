import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';

/*
 * Translation feedback POC.
 *
 * Double-clicking the *translation* side of a segment (the `.contentSpan.translation` rendered by
 * VersionContent) opens a modal about that whole segment: it shows the source (Hebrew) text and
 * the current translation, and lets the reader suggest a new translation for the segment and/or
 * leave a comment. "Start with existing" copies the current translation into the suggestion box so
 * the reader only has to edit what they would change. Double-clicks on the primary (source) text are
 * ignored, and the browser's own double-click selection is left untouched, so the existing selection
 * behavior (selected-words lookup, segment highlight) keeps working.
 */

const MAX_SUGGESTION_LEN = 10000;
const MAX_COMMENT_LEN = 5000;

export const normalizeSpace = (text) => (text || '').split(/\s+/).filter(Boolean).join(' ');

export function getTranslationFeedbackTarget(event) {
  // Returns {ref, versionTitle, actualLanguage, translationText} when `event` is a double-click on
  // the translation of a segment, else null.
  const target = event.target;
  if (!target || !target.closest || typeof window === 'undefined') { return null; }
  const span = target.closest('.contentSpan.translation');
  if (!span) { return null; }
  const segment = span.closest('.segment[data-ref]');
  const versionTitle = segment && segment.getAttribute('data-translation-vtitle');
  if (!versionTitle) { return null; }
  if (target.closest('sup, a[data-ref]')) { return null; } // footnote markers and citation links keep their own behavior
  return {
    ref: segment.getAttribute('data-ref'),
    versionTitle,
    actualLanguage: segment.getAttribute('data-translation-lang') || null,
    translationText: normalizeSpace(span.textContent),
  };
}

export const segmentTextsUrl = ({ref, versionTitle, actualLanguage}) => {
  const params = new URLSearchParams({ref, versionTitle});
  if (actualLanguage) { params.set('actualLanguage', actualLanguage); }
  return `/api/translation-feedback/segment?${params.toString()}`;
};

const stopPropagation = (e) => e.stopPropagation();

export const TranslationFeedbackModal = ({target, onClose, onSaved}) => {
  const dialogRef = useRef(null);
  const suggestionRef = useRef(null);
  const [heText, setHeText] = useState(null);           // null while loading
  const [translation, setTranslation] = useState(target.translationText || '');
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

  useEffect(() => {
    // Source text isn't necessarily on the page (English-only mode), so ask the server for both.
    let cancelled = false;
    Promise.resolve(Sefaria._ApiPromise(segmentTextsUrl(target))).then(data => {
      if (cancelled) { return; }
      if (!data || data.error) { setHeText(''); return; }
      setHeText(data.he || '');
      if (data.translation) { setTranslation(data.translation); }
    }, () => { if (!cancelled) { setHeText(''); } });
    return () => { cancelled = true; };
  }, []);

  const unchanged = normalizeSpace(suggestion) === normalizeSpace(translation);
  const hasSuggestion = suggestion.trim().length > 0 && !unchanged;
  const canSave = !saving && (hasSuggestion || comment.trim().length > 0);

  const startWithExisting = () => {
    setSuggestion(translation);
    if (suggestionRef.current) { suggestionRef.current.focus(); }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!canSave) { return; }
    setSaving(true);
    setError(null);
    try {
      await Sefaria.apiRequestWithBody('/api/translation-feedback', null, {
        ref: target.ref,
        versionTitle: target.versionTitle,
        actualLanguage: target.actualLanguage,
        suggestion: hasSuggestion ? suggestion.trim() : '',
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
            <label>Source</label>
            {heText === null ?
              <div className="readOnlyValue translationFeedbackLoading">Loading…</div> :
              heText ?
                <div className="readOnlyValue translationFeedbackSource" dir="rtl" lang="he">{heText}</div> :
                <div className="readOnlyValue translationFeedbackLoading">Source text unavailable</div>}
          </div>
          <div className="translationFeedbackField">
            <label>Current translation</label>
            <div className="readOnlyValue translationFeedbackCurrent">{translation}</div>
          </div>
          <div className="translationFeedbackField">
            <div className="translationFeedbackLabelRow">
              <label htmlFor="translationFeedbackSuggestion">Change Suggestion <span className="optional">(optional)</span></label>
              <button type="button" className="translationFeedbackStartButton" onClick={startWithExisting}
                      disabled={!translation}>Start with existing</button>
            </div>
            <div className="translationFeedbackHelp">If you think we could have done better with this passage, write your version</div>
            <textarea id="translationFeedbackSuggestion" ref={suggestionRef} rows={4} value={suggestion}
                      maxLength={MAX_SUGGESTION_LEN} autoFocus onChange={e => setSuggestion(e.target.value)} />
            {suggestion.trim() && unchanged ?
              <div className="translationFeedbackHelp">No changes yet: edit the text to make a suggestion.</div> : null}
          </div>
          <div className="translationFeedbackField">
            <label htmlFor="translationFeedbackComment">Comment</label>
            <div className="translationFeedbackHelp">If you make a suggestion, describe your reasoning. If you have general feedback, let us know what’s on your mind!</div>
            <textarea id="translationFeedbackComment" rows={4} value={comment} maxLength={MAX_COMMENT_LEN}
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
    actualLanguage: PropTypes.string,
    translationText: PropTypes.string,
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
