// The lanes' components, plugged into the page (PLAN §2.5, §4.2). Shared file, owned by the Integrator.
// Docs (W7) are wired here; the slots still to come from other lanes are typed in `PageSlots` and left
// empty: `endpointArticle` and `playground` (W3, src/reference), `home` and the Discord button (W11,
// src/home and src/discord), `editor` (W13, src/editor), Copy Page and feedback (W2).
import type { DocPayload, EndpointPayload, PagePayload } from '../contracts';
import { DocPage, DocsSidebarTree } from '../docs';
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

// ------------------------------------------------------------------------- docs (W7)

/** The sidebar tree of a docs or endpoint page, in the shell's sidebar frame. */
export function renderSidebar(data: DocPayload | EndpointPayload) {
  const tree = data.nav?.tree;
  if (!tree) return null;
  return (
    <nav className="dp-sidebar" aria-label="Secondary navigation">
      <DocsSidebarTree tree={tree} activePath={data.path} />
    </nav>
  );
}

/** The whole docs layout (sidebar, article, rail), the same DOM page_doc.html renders on the server. */
export function renderDocPage(data: DocPayload, frame: DocFrame, slots: PageSlots) {
  return (
    <DocPage
      data={data}
      adopt={serverBodyFor(data)}
      slots={slots.docExtras?.(data)}
      sidebarId={frame.sidebarId}
      sidebarOpen={frame.sidebarOpen}
    />
  );
}

/** The slots every page gets. */
export function createPageSlots(): PageSlots {
  const slots: PageSlots = {
    sidebar: renderSidebar,
    docPage: (data, frame) => renderDocPage(data, frame, slots),
    // Extension points, filled by their lanes:
    // docExtras: (data) => ({ copyPage, feedback, discord }),  W2 (Copy Page, feedback), W11 (Discord)
    // endpointArticle, playground: W3 (src/reference)
    // home: W11 (src/home)
    // editor: W13 (src/editor)
  };
  return slots;
}
