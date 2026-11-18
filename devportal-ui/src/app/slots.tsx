// The lanes' components, plugged into the page (PLAN §2.5, §4.2). Shared file, owned by the Integrator.
// Docs (W7) are wired here; the slots still to come from other lanes are typed in `PageSlots` and left
// empty: `endpointArticle` and `playground` (W3, src/reference), `home` and the Discord button (W11,
// src/home and src/discord), `editor` (W13, src/editor). The shell's sidebar, Copy Page and feedback (W2) are
// wired here too; the endpoint page's Copy Page and footer are ready in `endpointHeaderActions` and
// `endpointFooter` for whoever wires W3's EndpointArticle.
import type { DocPayload, EndpointPayload, PagePayload } from '../contracts';
import { SidebarFooterDiscord } from '../discord';
import { DocPage } from '../docs';
import { CopyPage, EndpointFooter, Feedback, Sidebar } from '../shell';
import type { DocFrame, PageSlots } from './PortalPage';

// ------------------------------------------------------------------------- server body adoption

/** The server-rendered body nodes, by the payload object they were rendered from (the data island's). */
const serverBodies = new WeakMap<PagePayload, Node[]>();

/**
 * Keeps the server-rendered article body's nodes (taken with `takeServerBody` before React replaces
 * #dp-root) for the payload they belong to. Only that payload object adopts them: a later visit to the same
 * path loads a new payload and renders its `bodyHtml`, so nodes the enhancers already changed are never
 * adopted twice. Keyed by object, not by a once-only "take", because StrictMode renders twice.
 */
export function registerServerBody(payload: PagePayload, nodes: Node[] | null): void {
  if (nodes !== null && nodes.length > 0) serverBodies.set(payload, nodes);
}

export function serverBodyFor(payload: PagePayload): Node[] | null {
  return serverBodies.get(payload) ?? null;
}

// ------------------------------------------------------------------------- sidebar (W2)

/**
 * The sidebar of a docs or endpoint page (W2's `Sidebar`, one component for both sections), with the Discord
 * button in its footer where live shows "Powered by ReadMe" (D-2, placement sidebar_footer).
 */
export function renderSidebar(data: DocPayload | EndpointPayload) {
  const tree = data.nav?.tree;
  if (!tree) return null;
  return <Sidebar tree={tree} activePath={data.path} footer={<SidebarFooterDiscord />} />;
}

// ------------------------------------------------------------------------- docs (W7, W2)

/**
 * The whole docs layout: the shell's sidebar column, then W7's DocPage (article and rail) drawn without its own
 * tree, so docs and reference pages share one sidebar. Same geometry as page_doc.html's server markup (the column
 * keeps `.dp-docs__sidebar`); custom pages have no tree and render DocPage alone.
 */
export function renderDocPage(data: DocPayload, frame: DocFrame, slots: PageSlots) {
  const tree = data.nav?.tree ?? null;
  const extras = slots.docExtras?.(data);
  if (tree === null || data.nav === null) {
    return <DocPage data={data} adopt={serverBodyFor(data)} slots={extras} />;
  }
  const withoutTree: DocPayload = { ...data, nav: { ...data.nav, tree: null } };
  return (
    <div className="dp-docs-frame">
      <div
        className="dp-docs__sidebar"
        data-slot="sidebar"
        id={frame.sidebarId}
        data-open={frame.sidebarOpen ? 'true' : undefined}
      >
        {slots.sidebar?.(data)}
      </div>
      <DocPage data={withoutTree} adopt={serverBodyFor(data)} slots={extras} />
    </div>
  );
}

// ------------------------------------------------------------------------- Copy Page and feedback (W2)

/** The Copy Page split button for a page with a `.md` URL (C3 `meta.markdownUrl`); none without one. */
export function renderCopyPage(data: DocPayload | EndpointPayload) {
  if (!data.meta.markdownUrl) return null;
  return <CopyPage markdownUrl={data.meta.markdownUrl} mcpUrl={data.site.mcpUrl} />;
}

/** Copy Page (top of the rail) and the feedback widget (page footer) of a docs or custom page. */
export function renderDocExtras(data: DocPayload) {
  return { copyPage: renderCopyPage(data), feedback: <Feedback path={data.path} /> };
}

/** For W3's `EndpointArticle headerActions`: Copy Page at the right of the headline row, as live. */
export function endpointHeaderActions(data: EndpointPayload) {
  return renderCopyPage(data);
}

/** For W3's `EndpointArticle footer`: "Updated N ago", prev/next and the feedback widget (no Discord, D-7). */
export function endpointFooter(data: EndpointPayload) {
  return <EndpointFooter path={data.path} updatedAt={data.page.updatedAt} pager={data.pager} />;
}

/** The slots every page gets. */
export function createPageSlots(): PageSlots {
  const slots: PageSlots = {
    sidebar: renderSidebar,
    docPage: (data, frame) => renderDocPage(data, frame, slots),
    docExtras: renderDocExtras,
    // Extension points, filled by their lanes:
    // docExtras: add `discord: <DocsPageEndDiscord />` (W11, placement docs_page_end)
    // endpointArticle, playground: W3 (src/reference)
    // home: W11 (src/home)
    // editor: W13 (src/editor)
  };
  return slots;
}
