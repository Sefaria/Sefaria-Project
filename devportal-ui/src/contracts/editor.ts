// Contract C3, the editor API (PLAN §2.11). Mirrors the editor-*.schema.json files.
// Every route is staff-only (401 not_authenticated, 403 forbidden) and needs the CSRF token (PLAN §2.3.5).
// Errors are ErrorResponse, except 409, which is EditorConflictResponse.
//
//   GET    /_portal/editor/tree/<section>                    → EditorTree
//   POST   /_portal/editor/pages                             EditorPageCreateRequest → 201 EditorPage
//   GET    /_portal/editor/pages/<id>                        → EditorPage
//   PATCH  /_portal/editor/pages/<id>                        EditorPageSettingsRequest → EditorPage
//   PUT    /_portal/editor/pages/<id>/draft                  EditorDraftSaveRequest → EditorDraftSaveResponse | 409
//   POST   /_portal/editor/pages/<id>/publish                EditorPublishRequest → EditorPublishResponse | 409
//   GET    /_portal/editor/pages/<id>/revisions              → EditorRevisions
//   POST   /_portal/editor/pages/<id>/revisions/<n>/restore  EditorRestoreRequest → EditorDraftSaveResponse | 409
//   POST   /_portal/editor/pages/<id>/move                   EditorMoveRequest → EditorTree | 409 | 422 invalid_move
//   POST   /_portal/editor/preview                           EditorPreviewRequest → EditorPreviewResponse
//   POST   /_portal/editor/uploads                           multipart/form-data, part "file" → 201 EditorUploadResponse
//                                                            (200 when the same bytes were uploaded before)
import type {
  ContractVersion,
  DateTimeString,
  HttpMethod,
  NextPages,
  PageKind,
  PageMetadata,
  PortalPath,
  Section,
  TocEntry,
  UserRef,
} from './common';

/** The endpoint overlay of a revision (PLAN §2.3.3). Null on pages that are not endpoints. */
export interface EndpointOverlay {
  sidebarLabel: string | null;
  titleOverride: string | null;
  /** Replaces the spec's description when set. */
  descriptionOverrideMd: string | null;
}

/** The versioned content of a page: `PageRevision` without its bookkeeping and cached renderings. */
export interface RevisionContent {
  title: string;
  excerpt: string;
  /** Markdown in the C4 dialect. For endpoints, the free Markdown shown after the description. */
  bodyMd: string;
  hidden: boolean;
  deprecated: boolean;
  metadata: PageMetadata;
  next: NextPages;
  /** `link` pages only. */
  linkUrl: string | null;
  linkNewTab: boolean;
  fullscreen: boolean;
  /** The three hidden ReadMe stubs: `getting-started`, `authentication`, `my-requests`. */
  apiConfig: string | null;
  endpoint: EndpointOverlay | null;
}

export type RevisionSource = 'import' | 'editor' | 'restore';

export interface RevisionSummary {
  number: number;
  source: RevisionSource;
  /** Null for imported revisions. */
  author: UserRef | null;
  createdAt: DateTimeString;
  title: string;
  isPublished: boolean;
  isDraft: boolean;
}

/** A `Page` row as the editor sees it. */
export interface EditorPageSummary {
  id: number;
  section: Section;
  kind: PageKind;
  /** Null for categories. */
  slug: string | null;
  parentId: number | null;
  position: number;
  operationId: string | null;
  /** Public path; null for categories. */
  path: PortalPath | null;
  publishedRevision: number | null;
  draftRevision: number | null;
  contentUpdatedAt: DateTimeString | null;
}

/** What the spec says about an endpoint page, shown read-only. */
export interface EditorSpecInfo {
  method: HttpMethod;
  path: string;
  title: string;
  description: string;
  tags: string[];
  deprecated: boolean;
}

/** GET /_portal/editor/pages/<id>: the page and the newest revision's content (the draft when there is one). */
export interface EditorPage {
  contractVersion: ContractVersion;
  page: EditorPageSummary;
  /** The revision `content` comes from; null for a page created but never saved. */
  revision: RevisionSummary | null;
  content: RevisionContent;
  /** Endpoints only. */
  spec: EditorSpecInfo | null;
}

export interface EditorTreeNode {
  id: number;
  kind: PageKind;
  title: string;
  slug: string | null;
  hidden: boolean;
  deprecated: boolean;
  /** A draft newer than the published revision exists. */
  hasDraft: boolean;
  isPublished: boolean;
  method: HttpMethod | null;
  operationId: string | null;
  children: EditorTreeNode[];
}

/** GET /_portal/editor/tree/<section>; also the answer to a move. Includes hidden pages. */
export interface EditorTree {
  contractVersion: ContractVersion;
  section: Section;
  generation: number;
  nodes: EditorTreeNode[];
}

/** "+ New" and "+ add child". Endpoint pages are created only by devportal_sync_spec. */
export interface EditorPageCreateRequest {
  section: Section;
  kind: 'category' | 'page' | 'link';
  parentId: number | null;
  /** Null appends at the end. */
  position: number | null;
  title: string;
  /** Null derives the slug from the title. Categories have none. */
  slug: string | null;
}

/** Page settings that are not versioned. Changing `slug` creates a `Redirect` from the old path. */
export interface EditorPageSettingsRequest {
  slug: string;
}

export interface EditorDraftSaveRequest {
  /** Number of the newest revision the client loaded; null for a page that has none. 409 when it is stale. */
  baseRevision: number | null;
  content: RevisionContent;
}

export interface EditorDraftSaveResponse {
  contractVersion: ContractVersion;
  page: EditorPageSummary;
  revision: RevisionSummary;
}

/** 409. `latest` is the newest revision (revision_conflict); `generation` the current tree generation. */
export interface EditorConflictResponse {
  error: { code: 'revision_conflict' | 'tree_conflict'; message: string };
  latest: RevisionSummary | null;
  generation: number;
}

export interface EditorPublishRequest {
  /** The draft revision to publish; 409 when it is not the newest. */
  revision: number;
}

export interface EditorPublishResponse {
  contractVersion: ContractVersion;
  page: EditorPageSummary;
  revision: RevisionSummary;
  /** `PortalState.generation` after the publish. */
  generation: number;
  /** Public URL of the page (absolute). */
  url: string;
}

export interface EditorRevisions {
  contractVersion: ContractVersion;
  pageId: number;
  /** Newest first. */
  revisions: RevisionSummary[];
}

/** Restore copies revision <n> into a new draft; history is never rewritten. */
export interface EditorRestoreRequest {
  baseRevision: number | null;
}

export interface EditorPreviewRequest {
  section: Section;
  kind: PageKind;
  pageId: number | null;
  content: RevisionContent;
}

/** The server's rendering of unsaved content (View mode). */
export interface EditorPreviewResponse {
  contractVersion: ContractVersion;
  title: string;
  excerpt: string;
  bodyHtml: string;
  toc: TocEntry[];
  /** What the sanitizer removed, one human-readable entry per removal. */
  sanitizerRemovals: string[];
}

/**
 * The logical content of the multipart upload: the `file` part's name, declared type and size.
 * The server checks the type by decoding with Pillow; at most 5 MB.
 */
export interface EditorUploadRequest {
  file: {
    filename: string;
    contentType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    size: number;
  };
}

export interface MediaAssetRef {
  id: number;
  url: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  size: number;
  width: number;
  height: number;
  sha256: string;
}

export interface EditorUploadResponse {
  contractVersion: ContractVersion;
  asset: MediaAssetRef;
  /** False when the same bytes were already uploaded and the existing asset is returned. */
  created: boolean;
}

/** Validated on the server: same section, allowed parent kind, depth limit. */
export interface EditorMoveRequest {
  /** Null moves to the top level (categories, or custom pages). */
  parentId: number | null;
  position: number;
  /** The tree generation the client saw; 409 tree_conflict when stale. */
  baseGeneration: number;
}
