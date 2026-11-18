// Endpoint pages in the portal (PLAN §2.5): W3's reference UI in PortalFrame's two columns, sharing one
// <EndpointProvider>; W11's Discord button in the request panel; the page footer (Updated, prev/next and the
// feedback slot) at the end of the article; Try It reported to analytics with `track` (C8 `try_it_run`).
// The slots that use these are in slots.tsx; the spec files are held by endpointSpecs.ts.
import { useEffect, useState, type ReactNode } from 'react';
import type { EndpointPayload } from '../contracts';
import { DiscordButton } from '../discord';
import { Pagination, UpdatedAt } from '../docs';
import { EndpointArticle, EndpointPlayground, EndpointProvider } from '../reference';
import { loadedSpec, loadSpec, reportEndpointEvent } from './endpointSpecs';
import './endpoint.css';

export interface EndpointSpecGateProps {
  data: EndpointPayload;
  /** The page's frame (article and playground slots); rendered inside the provider once the spec is there. */
  children: ReactNode;
  /** Shown while the spec loads, or when it cannot be loaded. */
  fallback: ReactNode;
}

/** Wraps both columns in one <EndpointProvider>, keyed by operation so each endpoint starts fresh. */
export function EndpointSpecGate({ data, children, fallback }: EndpointSpecGateProps) {
  const spec = loadedSpec(data);
  const url = data.operation.specUrl;
  const [, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (spec !== null) return;
    let live = true;
    loadSpec(url).then(
      () => {
        if (live) setLoaded(url);
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [url, spec]);
  if (spec === null) return <>{fallback}</>;
  return (
    <EndpointProvider key={url} op={spec} apiOrigin={data.site.apiOrigin} onAnalyticsEvent={reportEndpointEvent}>
      {children}
    </EndpointProvider>
  );
}

/** The end of the endpoint article (live: Updated, prev/next, "Did this page help you?"); endpoint_footer.html. */
export function EndpointFooter({ data, feedback }: { data: EndpointPayload; feedback?: ReactNode }) {
  return (
    <footer className="dp-docs-footer" data-visual-region="pageFooter">
      <UpdatedAt updatedAt={data.page.updatedAt} />
      <Pagination pager={data.pager} />
      <div className="dp-docs-footer__feedback" data-slot="feedback">
        {feedback}
      </div>
    </footer>
  );
}

/** The article column (W3's `EndpointArticle`), titled from the payload (overlay title and description). */
export function EndpointArticleSlot({
  data,
  headerActions,
  footer,
}: {
  data: EndpointPayload;
  /** The shell's Copy Page (W2), at the right of the headline row as on live. */
  headerActions?: ReactNode;
  /** The shell's footer with "Updated", prev/next and the feedback widget (W2); a plain footer otherwise. */
  footer?: ReactNode;
}) {
  return (
    <EndpointArticle
      title={data.page.title}
      descriptionHtml={data.page.descriptionHtml}
      bodyHtml={data.page.bodyHtml}
      headerActions={headerActions}
      footer={footer ?? <EndpointFooter data={data} />}
    />
  );
}

/** The playground column (W3), with the Discord button of placement reference_request_panel (W11). */
export function EndpointPlaygroundSlot() {
  return <EndpointPlayground discordButton={<DiscordButton placement="reference_request_panel" />} />;
}
