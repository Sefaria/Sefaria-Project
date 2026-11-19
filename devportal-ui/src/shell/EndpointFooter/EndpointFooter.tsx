// The end of an endpoint page (REFERENCE_SPEC §1.4 "Footer"; contract C6 "Page footer"): "Updated N ago", the rule,
// prev/next and the feedback widget. The first two are W7's (src/docs PageFooter, shared with docs pages); there is
// no Discord button here (D-7 is docs pages only).
//
// Live renders it twice and shows one by width (`Footer-desktop`, `Footer-mobile`): at the end of the article while
// the playground is beside it, and after the playground once the columns stack (≤1065px). `placement` picks the copy:
// 'article' goes in W3's `EndpointArticle footer`, 'stacked' in the frame after the playground (PortalFrame
// `pageEnd`). Which one shows is CSS (src/app/endpoint.css), so the server markup (endpoint_footer.html) is the same.
import type { Pager } from '../../contracts';
import { PageFooter } from '../../docs';
import { Feedback } from '../Feedback/Feedback';

export type EndpointFooterPlacement = 'article' | 'stacked';

export interface EndpointFooterProps {
  /** The page's path, for the feedback request. */
  path: string;
  updatedAt: string | null;
  pager: Pager;
  /** Which of live's two copies: in the article (side-by-side columns) or after the playground (stacked). */
  placement?: EndpointFooterPlacement;
  /** Fixes "now" for "Updated N ago" (tests). */
  now?: Date;
}

export function EndpointFooter({ path, updatedAt, pager, placement = 'article', now }: EndpointFooterProps) {
  return (
    <div className={`dp-endpoint-footer dp-endpoint-footer--${placement}`}>
      <PageFooter updatedAt={updatedAt} pager={pager} feedback={<Feedback path={path} />} now={now} />
    </div>
  );
}
