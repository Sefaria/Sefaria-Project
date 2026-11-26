// Contract C3, the page payload. Mirrors devportal/contracts/schemas/page-payload.schema.json.
// Embedded in every HTML page as <script type="application/json" id="dp-data"> (json_script) and
// returned by GET /_portal/page.json?path=<path> (always HTTP 200, whatever the kind) (PLAN §2.5).
import type {
  ContractVersion,
  DateTimeString,
  HttpMethod,
  NavSection,
  Pager,
  PortalPath,
  Section,
  TocEntry,
} from './common';
import type { SidebarTree } from './nav';

/** Header tab shown as active. `contact` is "Get in Touch" (`/page/contact-us`). */
export type HeaderTab = 'home' | 'docs' | 'reference' | 'gallery' | 'contact';

/** Site-wide settings the browser needs. Same on every page of one deploy. */
export interface SiteConfig {
  /** `DEVPORTAL_API_ORIGIN`, e.g. `https://www.sefaria.org`. Try It calls only this origin (PLAN §2.12). */
  apiOrigin: string;
  /** `DEVPORTAL_GA4`: analytics section → GA4 measurement id. Empty means analytics is off (PLAN §2.13). */
  ga4: Record<string, string>;
  /** Which `ga4` entry this page reports to: `default`, or `gallery` on `/powered-by`. */
  analyticsSection: string;
  /** `DEVPORTAL_DEMO_API_KEY`, or null while it is empty (the default). */
  demoApiKey: string | null;
  /** `/_portal/search-docs.<sha>.json` for the current generation (PLAN §2.9). */
  searchDocsUrl: PortalPath;
  /** Absolute URL of this host's MCP server, `<origin>/mcp`. */
  mcpUrl: string;
  /** `PortalState.generation`. */
  generation: number;
}

/** Meta data of a rendered page. */
export interface PageMeta {
  /** `<meta name="description">`. */
  description: string;
  robots: 'index' | 'noindex';
  canonicalUrl: string;
  /** The page's `.md` URL (absolute), or null when the page has none. */
  markdownUrl: string | null;
}

/**
 * The sidebar of a docs or reference page. `tree` is always present in the data island. In a
 * `/_portal/page.json` response it is null when the request's `nav=<generation>` parameter equals
 * `generation`: the client then keeps the tree it has.
 */
export interface PageNav {
  section: NavSection;
  generation: number;
  /** `/_portal/nav/<section>.json`. */
  url: PortalPath;
  tree: SidebarTree | null;
}

interface PayloadBase {
  contractVersion: ContractVersion;
  /** The path this payload answers, without query or fragment. */
  path: PortalPath;
}

interface RenderedPayloadBase extends PayloadBase {
  /** `document.title`, exactly: nothing appended (PLAN §2.13). */
  title: string;
  meta: PageMeta;
  header: { activeTab: HeaderTab | null };
  site: SiteConfig;
}

/** `/`. The body is the homepage template's HTML, which the client adopts. */
export interface HomePayload extends RenderedPayloadBase {
  kind: 'home';
  bodyHtml: string;
}

/** A Markdown page: a docs page, a hand-written reference page, or a custom page (`/page/<slug>`). */
export interface DocPayload extends RenderedPayloadBase {
  kind: 'doc';
  section: Section;
  slug: string;
  pageId: number;
  /** `fullscreen` comes from the revision; custom pages may use it. */
  layout: 'standard' | 'fullscreen';
  page: {
    title: string;
    excerpt: string;
    /** Sanitized HTML from the Python renderer (PLAN §2.6). */
    bodyHtml: string;
    toc: TocEntry[];
    /** `Page.content_updated_at`, for "Updated N ago". */
    updatedAt: DateTimeString | null;
    deprecated: boolean;
  };
  /** Null for custom pages, which have no sidebar. */
  nav: PageNav | null;
  pager: Pager;
}

/** An endpoint page (`/reference/<operationId>`). */
export interface EndpointPayload extends RenderedPayloadBase {
  kind: 'endpoint';
  section: 'reference';
  slug: string;
  pageId: number;
  operation: {
    operationId: string;
    method: HttpMethod;
    /** Path template, e.g. `/api/v3/texts/{tref}`. */
    path: string;
    tags: string[];
    deprecated: boolean;
    /** The per-operation spec file (`operation-spec.schema.json`), under `/static/bundles/devportal/spec/`. */
    specUrl: string;
    specSha: string;
  };
  page: {
    /** `title_override` or the spec title (PLAN §2.7). */
    title: string;
    sidebarLabel: string;
    /** The overlay's description, or the spec's, rendered and sanitized. */
    descriptionHtml: string;
    /** The overlay's free Markdown, rendered; empty string when there is none. */
    bodyHtml: string;
    updatedAt: DateTimeString | null;
    /** `Page.spec_updated_at`. */
    specUpdatedAt: DateTimeString | null;
  };
  nav: PageNav;
  pager: Pager;
}

/** Any unknown path. The page itself answers HTTP 404 (PLAN §2.4, I-14). */
export interface NotFoundPayload extends RenderedPayloadBase {
  kind: 'notfound';
  /** Up to three pages chosen by slug similarity. */
  suggestions: { title: string; path: PortalPath }[];
}

/** A path that redirects (tag groups, `/docs`, the `Redirect` table, trailing slashes). */
export interface RedirectPayload extends PayloadBase {
  kind: 'redirect';
  status: 301 | 302;
  /** Target path on this host, or an absolute URL. */
  location: string;
}

/** The gallery (`/powered-by…`). Its own React app renders the content (PLAN §2.14). */
export interface GalleryPayload extends RenderedPayloadBase {
  kind: 'gallery';
  view: 'index' | 'project' | 'charts';
  projectId: number | null;
}

/** The staff editor shell (`/editor`, `/editor/<section>/<slug>`). */
export interface EditorPayload extends RenderedPayloadBase {
  kind: 'editor';
  section: Section | null;
  slug: string | null;
  /** `/_portal/csrf`. */
  csrfUrl: PortalPath;
}

export type PagePayload =
  HomePayload | DocPayload | EndpointPayload | NotFoundPayload | RedirectPayload | GalleryPayload | EditorPayload;

export type PagePayloadKind = PagePayload['kind'];
