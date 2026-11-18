import { useEffect, useState, type ReactNode } from 'react';
import { useLoaderData, useLocation } from 'react-router';
import type { DocPayload, EndpointPayload, PagePayload } from '../contracts';
import { NotFoundPage, PortalFrame, PortalHeader } from '../shell';
import { AdoptedHtml } from '../ui';

/** The id of the sidebar column; the mobile sub-nav button controls it. */
export const SIDEBAR_ID = 'dp-sidebar';

/**
 * What the workstreams plug into the page (wired in `routes.tsx`). Each slot renders part of one kind
 * of page from its payload; a missing slot renders nothing (or the default noted).
 */
export interface PageSlots {
  /** The sidebar of docs and endpoint pages (`src/shell/Sidebar`). Without it there is no sub-nav row. */
  sidebar?: (data: DocPayload | EndpointPayload) => ReactNode;
  /** The right rail of docs pages: Copy Page and the table of contents. */
  docsRail?: (data: DocPayload) => ReactNode;
  /** The article of docs and custom pages. Default: the title and the adopted body. */
  docArticle?: (data: DocPayload) => ReactNode;
  /** The article of endpoint pages (`src/reference`). Default: the title. */
  endpointArticle?: (data: EndpointPayload) => ReactNode;
  /** The playground column of endpoint pages (`src/reference`). */
  playground?: (data: EndpointPayload) => ReactNode;
  /** The homepage body (`src/home`). Default: the adopted body. */
  home?: (data: Extract<PagePayload, { kind: 'home' }>) => ReactNode;
  /** The gallery (`src/gallery`) and the editor (`src/editor`). */
  gallery?: (data: Extract<PagePayload, { kind: 'gallery' }>) => ReactNode;
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

  if (data.kind === 'redirect') return null;

  const activeTab = data.header.activeTab;
  const sidebar = (data.kind === 'doc' || data.kind === 'endpoint') && data.nav ? slots.sidebar?.(data) : undefined;
  const hasSidebar = sidebar !== undefined && sidebar !== null;
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
      body = (
        <PortalFrame layout="plain">
          <NotFoundPage suggestions={data.suggestions} />
        </PortalFrame>
      );
      break;
    case 'doc':
      body = (
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
    case 'endpoint':
      body = (
        <PortalFrame
          layout="reference"
          sidebar={sidebar}
          sidebarOpen={sidebarOpen}
          sidebarId={SIDEBAR_ID}
          rail={slots.playground?.(data)}
        >
          {slots.endpointArticle ? slots.endpointArticle(data) : <h1 className="dp-page-title">{data.page.title}</h1>}
        </PortalFrame>
      );
      break;
    case 'home':
      body = slots.home ? (
        slots.home(data)
      ) : (
        <main className="dp-rm-app" id="content">
          <AdoptedHtml adoptKey="body" html={data.bodyHtml} />
        </main>
      );
      break;
    case 'gallery':
      body = slots.gallery?.(data) ?? null;
      break;
    case 'editor':
      body = slots.editor?.(data) ?? null;
      break;
  }

  return (
    <div className="dp-app" data-kind={data.kind}>
      <PortalHeader activeTab={activeTab} subnav={subnav} />
      {body}
    </div>
  );
}
