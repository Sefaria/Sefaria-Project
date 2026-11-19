import { useEffect, useState, type ReactNode } from 'react';
import { useLoaderData, useLocation } from 'react-router';
import type { DocPayload, EndpointPayload, PagePayload } from '../contracts';
import type { DocPageSlots } from '../docs';
import { NOT_FOUND_SECTION_LABEL, NOT_FOUND_SUBNAV_LABEL, NotFoundPage, PortalFrame, PortalHeader } from '../shell';
import { AdoptedHtml } from '../ui';
import { mountPagePlacements } from './placements';

/** The id of the sidebar column; the mobile sub-nav button controls it. */
export const SIDEBAR_ID = 'dp-sidebar';

/** What the docs layout needs from the page: the mobile sub-nav's sidebar panel (C6 `MobileSubnav`). */
export interface DocFrame {
  /** Id of the sidebar column, the sub-nav button's `aria-controls`. */
  sidebarId: string;
  /** The <=768px panel is open. */
  sidebarOpen: boolean;
}

/**
 * What the workstreams plug into the page (wired in `slots.tsx`). Each slot renders part of one kind
 * of page from its payload; a missing slot renders nothing (or the default noted).
 *
 * The gallery is not a slot: it is its own route tree under `/powered-by` (`routes.tsx`), because its pages
 * use their own routes (`projects/:slug`, `charts`) and its links navigate inside that tree.
 */
export interface PageSlots {
  /**
   * The sidebar of endpoint pages (and of docs pages without `docPage`). Its presence also turns on the
   * mobile sub-nav row. Wired: the docs sidebar tree (W7).
   */
  sidebar?: (data: DocPayload | EndpointPayload) => ReactNode;
  /**
   * The whole layout of docs and custom pages (sidebar, article, rail), rendered in `main.dp-main` as
   * page_doc.html renders it on the server, so React's takeover moves nothing (PLAN §2.5). Wired: W7's
   * `DocPage`. Without it: the frame with `docArticle` (default: the title and the adopted body).
   */
  docPage?: (data: DocPayload, frame: DocFrame) => ReactNode;
  /** Copy Page and feedback (W2) and the Discord button, placement docs_page_end (W11), inside `docPage`. */
  docExtras?: (data: DocPayload) => DocPageSlots;
  /** The right rail of docs pages, when `docPage` is not set. */
  docsRail?: (data: DocPayload) => ReactNode;
  /** The article of docs and custom pages, when `docPage` is not set. Default: the title and the adopted body. */
  docArticle?: (data: DocPayload) => ReactNode;
  /**
   * Wraps an endpoint page's frame (both columns), e.g. in W3's `EndpointProvider`. `fallback` is the frame
   * with only the title, for while the wrapper cannot render `frame` yet (its spec is loading).
   */
  endpointProvider?: (data: EndpointPayload, frame: ReactNode, fallback: ReactNode) => ReactNode;
  /** The article of endpoint pages (W3, `src/reference`). Default: the title. */
  endpointArticle?: (data: EndpointPayload) => ReactNode;
  /** The playground column of endpoint pages (W3, `src/reference`). */
  playground?: (data: EndpointPayload) => ReactNode;
  /**
   * After the playground (PortalFrame `pageEnd`): the page footer's copy that shows once the columns stack (live's
   * `Footer-mobile`). Rendered with the playground, so not in the spec-loading fallback.
   */
  endpointPageEnd?: (data: EndpointPayload) => ReactNode;
  /** The homepage body (W11, `src/home`), including its Discord placements. Default: the adopted body. */
  home?: (data: Extract<PagePayload, { kind: 'home' }>) => ReactNode;
  /** The staff editor (W13, `src/editor`). */
  editor?: (data: Extract<PagePayload, { kind: 'editor' }>) => ReactNode;
}

function DefaultDocArticle({ data }: { data: DocPayload }) {
  return (
    <>
      <h1 className="dp-page-title">{data.page.title}</h1>
      <AdoptedHtml adoptKey="body" html={data.page.bodyHtml} className="dp-article" />
    </>
  );
}

/** Renders one page from its payload: the header and, under it, the frame for the payload's kind. */
export function PortalPage({ slots }: { slots: PageSlots }) {
  const data = useLoaderData() as PagePayload;
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(location.pathname);

  // A navigation closes the mobile sidebar panel (state adjusted during render, not in an effect).
  if (openedAt !== location.pathname) {
    setOpenedAt(location.pathname);
    setSidebarOpen(false);
  }

  const title = data.kind === 'redirect' ? null : data.title;
  useEffect(() => {
    if (title !== null) document.title = title;
  }, [title]);

  // After the page's own effects (DocBody adopts and enhances the body in its effect, which runs first).
  useEffect(() => {
    if (data.kind !== 'redirect') mountPagePlacements(data);
  }, [data]);

  if (data.kind === 'redirect') return null;

  const activeTab = data.header.activeTab;
  // With `docPage`, the docs layout draws its own sidebar column (from the payload's tree).
  const ownSidebar = data.kind === 'doc' && slots.docPage !== undefined;
  const sidebar =
    (data.kind === 'doc' || data.kind === 'endpoint') && data.nav && !ownSidebar ? slots.sidebar?.(data) : undefined;
  const hasSidebar = ownSidebar
    ? data.kind === 'doc' && Boolean(data.nav?.tree)
    : sidebar !== undefined && sidebar !== null;
  const subnav = hasSidebar
    ? {
        label: data.kind === 'doc' || data.kind === 'endpoint' ? data.page.title : '',
        expanded: sidebarOpen,
        onToggle: () => setSidebarOpen((open) => !open),
        controls: SIDEBAR_ID,
      }
    : null;

  let body: ReactNode;
  switch (data.kind) {
    case 'notfound':
      // The same markup as devportal/templates/devportal/404.html.
      body = (
        <main className="dp-main" id="dp-main">
          <NotFoundPage suggestions={data.suggestions} />
        </main>
      );
      break;
    case 'doc':
      body = slots.docPage ? (
        // Live's `main` is both the mapped element and the "article" region of docs pages (visual parity).
        <main className="dp-main" id="dp-main" data-visual="main" data-visual-region="article">
          {slots.docPage(data, { sidebarId: SIDEBAR_ID, sidebarOpen })}
        </main>
      ) : (
        <PortalFrame
          layout={data.nav === null ? 'plain' : 'docs'}
          sidebar={sidebar}
          sidebarOpen={sidebarOpen}
          sidebarId={SIDEBAR_ID}
          rail={slots.docsRail?.(data)}
        >
          {slots.docArticle ? slots.docArticle(data) : <DefaultDocArticle data={data} />}
        </PortalFrame>
      );
      break;
    case 'endpoint': {
      const title = <h1 className="dp-page-title">{data.page.title}</h1>;
      const frame = (rail: ReactNode, article: ReactNode, pageEnd?: ReactNode) => (
        <PortalFrame
          layout="reference"
          sidebar={sidebar}
          sidebarOpen={sidebarOpen}
          sidebarId={SIDEBAR_ID}
          rail={rail}
          pageEnd={pageEnd}
        >
          {article}
        </PortalFrame>
      );
      const full = frame(
        slots.playground?.(data),
        slots.endpointArticle ? slots.endpointArticle(data) : title,
        slots.endpointPageEnd?.(data)
      );
      body = slots.endpointProvider ? slots.endpointProvider(data, full, frame(null, title)) : full;
      break;
    }
    case 'home':
      body = slots.home ? (
        slots.home(data)
      ) : (
        <main className="dp-rm-app" id="content" tabIndex={-1}>
          <AdoptedHtml adoptKey="body" html={data.bodyHtml} />
        </main>
      );
      break;
    case 'gallery':
      // The `/powered-by` routes render the gallery; this route sees the kind only if the server and the
      // client disagree about a path, and then shows the header alone rather than a wrong page.
      body = null;
      break;
    case 'editor':
      body = slots.editor?.(data) ?? null;
      break;
  }

  // The 404 page's header at ≤768px, as live: "Page Not Found" and a "404 Not Found" sub-nav that opens nothing
  // (the server includes the same prerendered variant, header-subnav "notfound").
  const header =
    data.kind === 'notfound' ? (
      <PortalHeader
        activeTab={activeTab}
        sectionLabel={NOT_FOUND_SECTION_LABEL}
        subnav={{ label: NOT_FOUND_SUBNAV_LABEL, expanded: false, onToggle: () => {} }}
      />
    ) : (
      <PortalHeader activeTab={activeTab} subnav={subnav} />
    );

  return (
    <div className="dp-app" data-kind={data.kind}>
      {header}
      {body}
    </div>
  );
}
