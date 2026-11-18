// "Did this page help you?" (contract C6 `FeedbackYes`, `FeedbackNo`, `FeedbackPopover`, `FeedbackComment`,
// `FeedbackSubmit`; REFERENCE_SPEC §1.4 "Footer"; live strings `common.pageThumbs.*`). Yes or No opens a non-modal
// popover with an optional comment and "Vote"; voting POSTs the C3 feedback request to /_portal/feedback with the
// CSRF token from /_portal/csrf (fetched on first use), then thanks the reader.
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { COMMENT_MAX_LENGTH, csrfToken, feedbackBody, sendFeedback } from './api';
import styles from './Feedback.module.css';
import { FEEDBACK_STRINGS } from './strings';

export interface FeedbackProps {
  /** The page's path (C3 `path`); the server resolves the page from it. */
  path: string;
  /** Replaces `fetch` (tests). */
  fetchImpl?: typeof fetch;
}

type Choice = 'yes' | 'no' | null;

export function Feedback({ path, fetchImpl }: FeedbackProps) {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => window.fetch(...args));
  const [choice, setChoice] = useState<Choice>(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error' | 'rate_limited'>('idle');
  const popoverId = useId();
  const commentId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  // A new page starts over.
  const [forPath, setForPath] = useState(path);
  if (forPath !== path) {
    setForPath(path);
    setChoice(null);
    setComment('');
    setStatus('idle');
  }

  const open = choice !== null && status !== 'done';

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, choice]);

  // Close on a pointer press outside the widget.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setChoice(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (next: 'yes' | 'no') => {
    if (status === 'sending') return;
    setChoice((current) => (current === next ? null : next));
    if (status === 'error' || status === 'rate_limited') setStatus('idle');
    // First use: get the CSRF token now, so "Vote" sends at once. A failure is retried on Vote.
    csrfToken(doFetch).catch(() => undefined);
  };

  const vote = async () => {
    if (choice === null || status === 'sending') return;
    setStatus('sending');
    const result = await sendFeedback(feedbackBody(path, choice === 'yes', comment), doFetch);
    setStatus(result === 'ok' ? 'done' : result);
  };

  // Escape inside the widget closes the popover and returns focus to the button that opened it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !rootRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      const opener = choice === 'yes' ? yesRef.current : noRef.current;
      setChoice(null);
      opener?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, choice]);

  if (status === 'done') {
    return (
      <div className={styles.root} data-visual-region="pageFooter">
        <div className={styles.thumbs} data-visual="thumbs">
          <p className={styles.thanks} role="status">
            {FEEDBACK_STRINGS.thanks}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} ref={rootRef} data-visual-region="pageFooter">
      <div className={styles.thumbs} data-visual="thumbs">
        <div className={styles.pill}>
          <span className={styles.prompt}>{FEEDBACK_STRINGS.prompt}</span>
          {/* Live's `.PageThumbs-cta`: the two buttons stay together when the pill wraps. */}
          <span className={styles.cta}>
            <span className={styles.anchor}>
              <button
                type="button"
                ref={yesRef}
                className={styles.thumb}
                data-selected={choice === 'yes' ? 'true' : undefined}
                aria-label={FEEDBACK_STRINGS.yesLabel}
                aria-haspopup="dialog"
                aria-expanded={open && choice === 'yes'}
                aria-controls={open && choice === 'yes' ? popoverId : undefined}
                onClick={() => choose('yes')}
                data-visual="thumbBtn"
              >
                <ThumbsUp className={`${styles.thumbIcon} ${styles.up}`} aria-hidden="true" strokeWidth={1.5} />
                {FEEDBACK_STRINGS.yes}
              </button>
              {open && choice === 'yes' && (
                <Popover
                  id={popoverId}
                  commentId={commentId}
                  comment={comment}
                  setComment={setComment}
                  status={status}
                  onVote={() => void vote()}
                  textareaRef={textareaRef}
                />
              )}
            </span>
            <span className={styles.anchor}>
              <button
                type="button"
                ref={noRef}
                className={styles.thumb}
                data-selected={choice === 'no' ? 'true' : undefined}
                aria-label={FEEDBACK_STRINGS.noLabel}
                aria-haspopup="dialog"
                aria-expanded={open && choice === 'no'}
                aria-controls={open && choice === 'no' ? popoverId : undefined}
                onClick={() => choose('no')}
              >
                <ThumbsDown className={`${styles.thumbIcon} ${styles.down}`} aria-hidden="true" strokeWidth={1.5} />
                {FEEDBACK_STRINGS.no}
              </button>
              {open && choice === 'no' && (
                <Popover
                  id={popoverId}
                  commentId={commentId}
                  comment={comment}
                  setComment={setComment}
                  status={status}
                  onVote={() => void vote()}
                  textareaRef={textareaRef}
                />
              )}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface PopoverProps {
  id: string;
  commentId: string;
  comment: string;
  setComment: (value: string) => void;
  status: 'idle' | 'sending' | 'error' | 'rate_limited' | 'done';
  onVote: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/** C6 `FeedbackPopover`: a non-modal dialog above the pill. */
function Popover({ id, commentId, comment, setComment, status, onVote, textareaRef }: PopoverProps) {
  return (
    <div className={styles.popover} data-visual-region="popover">
      <div className={styles.dialog} id={id} role="dialog" aria-label={FEEDBACK_STRINGS.prompt}>
        <div className={styles.body}>
          <label className={styles.label} htmlFor={commentId}>
            {FEEDBACK_STRINGS.comment}
          </label>
          <textarea
            ref={textareaRef}
            id={commentId}
            className={styles.textarea}
            value={comment}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => setComment(event.target.value.slice(0, COMMENT_MAX_LENGTH))}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.vote} onClick={onVote} disabled={status === 'sending'}>
            {FEEDBACK_STRINGS.submit}
          </button>
          {(status === 'error' || status === 'rate_limited') && (
            <p className={styles.error} role="alert">
              {status === 'rate_limited' ? FEEDBACK_STRINGS.rateLimited : FEEDBACK_STRINGS.failed}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
