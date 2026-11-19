/**
 * Shared types and helpers for the developer portal page objects (contract C7,
 * devportal/contracts/C7_page_objects.md). The portal is English only and lives on its own
 * host, MODULE_URLS.EN.DEVELOPERS.
 */
import { Page } from '@playwright/test';
import { MODULE_URLS } from '../../constants';

/** Thrown by a page-object method whose feature has not landed yet. */
export function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}

/** Absolute URL of a path on the developers host (tests must not rely on baseURL). */
export function developersUrl(path = '/'): string {
  const base = MODULE_URLS.EN.DEVELOPERS;
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The three content sections of the portal (and of the editor's page tree). */
export type PortalSection = 'docs' | 'reference' | 'custom_pages';

/** Header tabs and links, as live names them (SITE_ATLAS "Header"). */
export type HeaderLink = 'Home' | 'Docs' | 'API Reference' | 'GitHub' | 'Donate' | 'Get in Touch';

/** The six "Join the Discord" placements; the values are C8's `placement` parameter. */
export type DiscordPlacement =
  'home_hero' | 'home_community' | 'sidebar_footer' | 'docs_page_end' | 'reference_request_panel' | 'contact_page';

/** Parameter groups on an endpoint page; anchors are `#<group>-params-<name>`. */
export type ParamSection = 'path' | 'query' | 'body';

/** The five language buttons shown on the request card. */
export type CodeLanguage = 'Shell' | 'Node' | 'Ruby' | 'PHP' | 'Python';

/** Copy Page menu entries, in live's order (brief §4.5). */
export type CopyPageAction =
  | 'Copy Markdown'
  | 'View as Markdown'
  | 'Open in ChatGPT'
  | 'Open in Claude'
  | 'Connect to Cursor'
  | 'Connect to VS Code'
  | 'Copy MCP Config'
  | 'Copy MCP Command';

export type SearchTab = 'All' | 'Docs' | 'API Reference' | 'Pages';

/** Gallery filter sections (OR within a facet, AND across facets; Category is single-choice). */
export type GalleryFacet = 'Category' | 'Topics' | 'Language' | 'Sefaria resources' | 'Built with';

/** Gallery sort labels (powered-by src/lib/sort.ts). */
export type GallerySort = 'Newest' | 'A–Z';

export type GalleryView = 'grid' | 'list';

export type EditorMode = 'view' | 'edit';

/** Blocks the editor's "/" menu inserts (PLAN §2.6 constructs plus the standard blocks). */
export type EditorBlock =
  | 'Callout'
  | 'Image'
  | 'Table'
  | 'Embed'
  | 'HTML Block'
  | 'Code Block'
  | 'Heading'
  | 'Bulleted List'
  | 'Numbered List'
  | 'Quote'
  | 'Divider';

/** Fields of the editor's page settings panel (PLAN §2.11). */
export type PageSettingField =
  | 'pageType'
  | 'visibility'
  | 'subtitle'
  | 'seoTitle'
  | 'seoDescription'
  | 'nextPages'
  | 'linkUrl'
  | 'linkOpensInNewTab'
  | 'slug';

/** Overlay fields of an endpoint page; never written back to openAPI.json. */
export type OverlayField = 'sidebarLabel' | 'title' | 'description' | 'markdown';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LinkInfo {
  name: string;
  href: string;
  opensInNewTab: boolean;
}

export interface SidebarItem {
  name: string;
  href: string;
  depth: number;
  method: HttpMethod | null;
  deprecated: boolean;
  external: boolean;
  active: boolean;
}

export interface ParameterInfo {
  name: string;
  type: string;
  required: boolean;
  /** "Defaults to X" text, or null. */
  defaultText: string | null;
  placeholder: string | null;
  value: string;
  isEnum: boolean;
  /** The parameter's anchor id, e.g. `query-params-version`. */
  anchor: string;
}

export interface ResponseStatus {
  code: string;
  description: string;
  /** Computed background colour of the status dot. */
  dotColor: string;
}

export interface RecentRequestRow {
  method: HttpMethod;
  path: string;
  status: number;
  /** e.g. "Less than a minute ago". */
  when: string;
  selected: boolean;
}

export interface SearchResult {
  title: string;
  path: string;
  section: SearchTab;
  method: HttpMethod | null;
  snippet: string;
  /** Text inside the snippet's highlight marks. */
  highlighted: string[];
}

export interface GalleryCard {
  id: string;
  title: string;
  href: string;
  knownIssuesBadge: boolean;
}

export interface EditorTreeItem {
  title: string;
  slug: string;
  depth: number;
  kind: 'page' | 'link' | 'endpoint' | 'group';
  hidden: boolean;
}

export interface RevisionRow {
  number: number;
  author: string;
  when: string;
  published: boolean;
}

/** A request the page made, as captured by a page.route interceptor. */
export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Live list of requests an interceptor has captured so far. */
export interface RequestCapture {
  readonly requests: CapturedRequest[];
}

/** A GA4 event read from an intercepted `**\/g/collect*` request. */
export interface Ga4Event {
  name: string;
  params: Record<string, string>;
}

export interface Ga4Capture {
  readonly events: Ga4Event[];
}

/** The result of a plain HTTP request to the developers host (no browser rendering). */
export interface HttpResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** A recorded upstream response used to fulfil Try It calls (PLAN §6.1.2). */
export interface RecordedResponse {
  status: number;
  headers?: Record<string, string>;
  body: string;
  /** Hold the response this long, to make the loading state observable. */
  delayMs?: number;
}

/** MCP methods the suite may send. `tools/call` is deliberately absent (rule: never on live). */
export type McpMethod = 'initialize' | 'notifications/initialized' | 'ping' | 'tools/list';

/**
 * Route `pattern`, fulfil every matching request with `response` instead of letting it reach
 * the server, and record it. GET and HEAD pass through unless `includeReads` is set. This is
 * how suites keep writes (editor saves, feedback, Formstack) off the shared database.
 */
export async function interceptRequests(
  page: Page,
  pattern: string | RegExp,
  response: { status: number; contentType?: string; body: string },
  options: { includeReads?: boolean } = {}
): Promise<RequestCapture> {
  const capture: { requests: CapturedRequest[] } = { requests: [] };
  await page.route(pattern, async (route) => {
    const request = route.request();
    if (!options.includeReads && (request.method() === 'GET' || request.method() === 'HEAD')) {
      return route.continue();
    }
    capture.requests.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: request.postData(),
    });
    await route.fulfill(response);
  });
  return capture;
}
