// The end of an endpoint page (REFERENCE_SPEC §1.4 "Footer"; contract C6 "Page footer"): "Updated N ago", a rule,
// prev/next and the feedback widget. The first two are W7's (src/docs PageFooter, shared with docs pages); there is
// no Discord button here (D-7 is docs pages only). Goes in W3's `EndpointArticle footer`.
import type { Pager } from '../../contracts';
import { PageFooter } from '../../docs';
import { Feedback } from '../Feedback/Feedback';
import './endpointFooter.css';

export interface EndpointFooterProps {
  /** The page's path, for the feedback request. */
  path: string;
  updatedAt: string | null;
  pager: Pager;
  /** Fixes "now" for "Updated N ago" (tests). */
  now?: Date;
}

export function EndpointFooter({ path, updatedAt, pager, now }: EndpointFooterProps) {
  return (
    <div className="dp-endpoint-footer" data-visual-region="pageFooter">
      <PageFooter updatedAt={updatedAt} pager={pager} feedback={<Feedback path={path} />} now={now} />
    </div>
  );
}
