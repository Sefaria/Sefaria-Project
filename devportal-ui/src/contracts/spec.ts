// Contract C3, the static spec files written by scripts/build-spec.ts (PLAN §2.7).
// Mirrors operation-spec.schema.json and operation-index.schema.json.
// Served as /static/bundles/devportal/spec/index.json and /static/bundles/devportal/spec/<operationId>.json.
import type { ContractVersion, HttpMethod } from './common';

/**
 * An OpenAPI 3.0 Schema Object with every `$ref` inlined. A reference that would recurse is replaced by
 * `{ "x-dp-circular": "<component name>" }`. Kept open: the spec's own keywords pass through unchanged.
 */
export type SchemaObject = { [keyword: string]: unknown };

/** OpenAPI Example Object. */
export interface ExampleObject {
  summary?: string;
  description?: string;
  value: unknown;
}

export interface MediaTypeObject {
  schema: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject>;
}

/** A parameter, merged from the path item and the operation (the operation wins on name and `in`). */
export interface OperationParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  /** Markdown, as authored; empty string when absent. */
  description: string;
  deprecated: boolean;
  schema: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject>;
}

export interface OperationRequestBody {
  required: boolean;
  description: string;
  content: Record<string, MediaTypeObject>;
}

export interface OperationResponse {
  /** `"200"`, `"404"`, `"default"`… in the spec's order. */
  status: string;
  description: string;
  /** Empty object when the response has no body. */
  content: Record<string, MediaTypeObject>;
}

export interface OperationSpec {
  contractVersion: ContractVersion;
  /** sha256 of `docs/openAPI.json` as built. */
  specSha: string;
  operationId: string;
  method: HttpMethod;
  /** Path template, e.g. `/api/v3/texts/{tref}`. */
  path: string;
  /** `servers[0].url` of the spec, e.g. `https://www.sefaria.org`. */
  server: string;
  tags: string[];
  /** `operation.summary`, falling back to the path item's `summary` (PLAN §2.7). */
  title: string;
  /** `operation.description` only; empty string when absent. Markdown. */
  description: string;
  deprecated: boolean;
  parameters: OperationParameter[];
  requestBody: OperationRequestBody | null;
  responses: OperationResponse[];
}

export interface OperationIndexEntry {
  operationId: string;
  method: HttpMethod;
  path: string;
  tags: string[];
  title: string;
  deprecated: boolean;
  /** File name of the operation's spec file, relative to the index. */
  file: string;
}

export interface OperationIndex {
  contractVersion: ContractVersion;
  specSha: string;
  operations: OperationIndexEntry[];
}
