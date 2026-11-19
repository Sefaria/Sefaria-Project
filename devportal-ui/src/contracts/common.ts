// Contract C3, shared definitions. Mirrors devportal/contracts/schemas/common.schema.json.
// JSON keys are camelCase everywhere in C3; the Python side maps model fields to them.

/** Version of the C3 shapes. Bumped only by the Integrator, together with every schema. */
export type ContractVersion = 1;

/** The three URL sections; also `Page.section`. */
export type Section = 'docs' | 'reference' | 'page';

/** Sections that have a sidebar tree. */
export type NavSection = 'docs' | 'reference';

/** `Page.kind` (PLAN §2.3.3). */
export type PageKind = 'category' | 'page' | 'link' | 'tag_group' | 'endpoint' | 'api_config';

/** HTTP methods as the OpenAPI document spells them (lowercase). The UI upper-cases them. */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** A path on the developers host, starting with a single `/`. */
export type PortalPath = string;

/** ISO 8601 date-time with a time zone, e.g. `2026-10-25T08:51:39Z`. */
export type DateTimeString = string;

/** One entry of a table of contents, built from H2 and H3 (PLAN §2.6). `id` is the heading's id. */
export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/** A previous/next link in the page footer. */
export interface PagerLink {
  title: string;
  path: PortalPath;
}

export interface Pager {
  prev: PagerLink | null;
  next: PagerLink | null;
}

/** `PageRevision.metadata` (front matter `metadata`). Empty strings mean "use the page's own". */
export interface PageMetadata {
  title: string;
  description: string;
  robots: 'index' | 'noindex';
}

/** One entry of front matter `next.pages`. */
export interface NextPageRef {
  type: 'basic' | 'endpoint' | 'link';
  slug: string;
  title: string;
}

/** `PageRevision.next` (front matter `next`). */
export interface NextPages {
  description: string;
  pages: NextPageRef[];
}

/** A staff user as the editor shows them. */
export interface UserRef {
  id: number;
  name: string;
}

/**
 * Every non-2xx JSON response of a `/_portal/` endpoint. `code` is machine-readable:
 * `invalid_request`, `not_authenticated`, `forbidden`, `not_found`, `revision_conflict`, `tree_conflict`,
 * `invalid_move`, `rate_limited`, `unsupported_media_type`, `file_too_large`, `server_error`.
 * `fields` maps a request field to its messages, for `invalid_request`.
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}
