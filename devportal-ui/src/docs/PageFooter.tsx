// The end of a docs page (SITE_ATLAS §4 "Footer of article"; contract C6 Page footer): "Updated N ago",
// the previous/next links, then the feedback widget ("Did this page help you?", W2's) and, right after
// it, the Discord button (D-7, placement docs_page_end, W11's). This component only leaves slots for
// those two; page_doc.html renders the same markup on the server.
import type { ReactNode } from 'react';
import type { Pager } from '../contracts';
import { relativeTime } from './relativeTime';

export const PAGINATION_LABEL = 'Pagination Controls';
export const DISCORD_PLACEMENT = 'docs_page_end';

function relativeOrNull(iso: string, now: Date): string | null {
  const then = new Date(iso);
  return Number.isNaN(then.getTime()) ? null : relativeTime(then, now);
}

export function UpdatedAt({ updatedAt, now }: { updatedAt: string | null; now?: Date }) {
  // The server prints the date (it cannot know the reader's clock); the client prints the relative text.
  if (!updatedAt) return null;
  const text = relativeOrNull(updatedAt, now ?? new Date());
  // Live's row (a flex row, so the line's margins stay inside it) around the "Updated N ago" line.
  return (
    <div className="dp-updated-row">
      <div className="dp-updated" data-visual-region="pageFooter">
        <p className="dp-updated__line" data-visual="updated" data-visual-mask="updatedAgo">
          <span className="dp-updated__icon" aria-hidden="true" />
          Updated <time dateTime={updatedAt}>{text ?? updatedAt.slice(0, 10)}</time>
        </p>
      </div>
    </div>
  );
}

export function Pagination({ pager }: { pager: Pager }) {
  if (!pager.prev && !pager.next) return null;
  return (
    <nav
      className="dp-pagination"
      aria-label={PAGINATION_LABEL}
      data-visual="pagination"
      data-visual-region="pageFooter"
    >
      {pager.prev && (
        <a
          data-visual="pageLink"
          className="dp-pagination__link dp-pagination__link--prev"
          href={pager.prev.path}
          aria-label={`Previous Page: ${pager.prev.title}`}
        >
          <span className="dp-pagination__icon" aria-hidden="true" />
          <span className="dp-pagination__text">{pager.prev.title}</span>
        </a>
      )}
      {pager.next && (
        <a
          data-visual={pager.prev ? undefined : 'pageLink'}
          className="dp-pagination__link dp-pagination__link--next"
          href={pager.next.path}
          aria-label={`Next Page: ${pager.next.title}`}
        >
          <span className="dp-pagination__text">{pager.next.title}</span>
          <span className="dp-pagination__icon" aria-hidden="true" />
        </a>
      )}
    </nav>
  );
}

export interface PageFooterProps {
  updatedAt: string | null;
  pager: Pager;
  /** W2's feedback widget ("Did this page help you?"). */
  feedback?: ReactNode;
  /** W11's Discord button for placement docs_page_end (D-7). */
  discord?: ReactNode;
  now?: Date;
}

export function PageFooter({ updatedAt, pager, feedback, discord, now }: PageFooterProps) {
  return (
    <footer className="dp-docs-footer">
      <UpdatedAt updatedAt={updatedAt} now={now} />
      {/* Live's 1px rule between "Updated" and the pagination ("NextStepsDivider"). */}
      {updatedAt && <hr className="dp-docs-footer__divider" />}
      <Pagination pager={pager} />
      <div className="dp-docs-footer__feedback" data-slot="feedback">
        {feedback}
      </div>
      <div className="dp-docs-footer__discord" data-slot="discord" data-discord-placement={DISCORD_PLACEMENT}>
        {discord}
      </div>
    </footer>
  );
}
