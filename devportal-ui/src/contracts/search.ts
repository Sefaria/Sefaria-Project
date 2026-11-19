// Contract C3, the search documents (PLAN §2.9). Mirrors search-documents.schema.json.
// Built by devportal/services/search_index.py at publish time; served at /_portal/search-docs.<sha>.json.
import type { ContractVersion, HttpMethod, PortalPath, Section } from './common';

export interface SearchDocument {
  /** `page:<Page.id>` or `op:<operationId>`. Unique in the file. */
  id: string;
  /** Drives the modal's tabs: docs → Docs, reference → API Reference, page → Pages. */
  section: Section;
  kind: 'page' | 'endpoint';
  title: string;
  path: PortalPath;
  /** Set for endpoints only. */
  method: HttpMethod | null;
  excerpt: string;
  headings: string[];
  /** Plain text of the body. */
  body: string;
  /** Endpoints: parameter names and descriptions. Empty for pages. */
  params: { name: string; description: string }[];
  /** Endpoints: response status and description. Empty for pages. */
  responses: { status: string; description: string }[];
}

export interface SearchDocuments {
  contractVersion: ContractVersion;
  /** The `<sha>` in the file's URL. */
  sha: string;
  generation: number;
  documents: SearchDocument[];
}
