// Contract C3: TypeScript types mirroring devportal/contracts/schemas/*.schema.json.
// Fixtures in devportal/contracts/fixtures/shapes/<name>/ must satisfy both the schema <name>.schema.json
// and ContractTypes[<name>]; src/contracts/contracts.test.ts checks this, and so does
// devportal/tests/pure/contracts_test.py on the Python side.
import type { ErrorResponse } from './common';
import type {
  EditorConflictResponse,
  EditorDraftSaveRequest,
  EditorDraftSaveResponse,
  EditorMoveRequest,
  EditorPage,
  EditorPageCreateRequest,
  EditorPageSettingsRequest,
  EditorPreviewRequest,
  EditorPreviewResponse,
  EditorPublishRequest,
  EditorPublishResponse,
  EditorRestoreRequest,
  EditorRevisions,
  EditorTree,
  EditorUploadRequest,
  EditorUploadResponse,
} from './editor';
import type { FeedbackRequest, FeedbackResponse } from './feedback';
import type { SidebarTree } from './nav';
import type { PagePayload } from './page';
import type { SearchDocuments } from './search';
import type { OperationIndex, OperationSpec } from './spec';

export type * from './common';
export type * from './editor';
export type * from './feedback';
export type * from './nav';
export type * from './page';
export type * from './search';
export type * from './spec';

/** Every C3 schema that has fixtures, by schema file name (without `.schema.json`). */
export const CONTRACT_NAMES = [
  'page-payload',
  'sidebar-tree',
  'operation-spec',
  'operation-index',
  'search-documents',
  'feedback-request',
  'feedback-response',
  'error-response',
  'editor-tree',
  'editor-page',
  'editor-page-create-request',
  'editor-page-settings-request',
  'editor-draft-save-request',
  'editor-draft-save-response',
  'editor-conflict-response',
  'editor-publish-request',
  'editor-publish-response',
  'editor-revisions',
  'editor-restore-request',
  'editor-preview-request',
  'editor-preview-response',
  'editor-upload-request',
  'editor-upload-response',
  'editor-move-request',
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

/** Schema name → the TypeScript type a fixture of that schema must satisfy. */
export interface ContractTypes {
  'page-payload': PagePayload;
  'sidebar-tree': SidebarTree;
  'operation-spec': OperationSpec;
  'operation-index': OperationIndex;
  'search-documents': SearchDocuments;
  'feedback-request': FeedbackRequest;
  'feedback-response': FeedbackResponse;
  'error-response': ErrorResponse;
  'editor-tree': EditorTree;
  'editor-page': EditorPage;
  'editor-page-create-request': EditorPageCreateRequest;
  'editor-page-settings-request': EditorPageSettingsRequest;
  'editor-draft-save-request': EditorDraftSaveRequest;
  'editor-draft-save-response': EditorDraftSaveResponse;
  'editor-conflict-response': EditorConflictResponse;
  'editor-publish-request': EditorPublishRequest;
  'editor-publish-response': EditorPublishResponse;
  'editor-revisions': EditorRevisions;
  'editor-restore-request': EditorRestoreRequest;
  'editor-preview-request': EditorPreviewRequest;
  'editor-preview-response': EditorPreviewResponse;
  'editor-upload-request': EditorUploadRequest;
  'editor-upload-response': EditorUploadResponse;
  'editor-move-request': EditorMoveRequest;
}

// Compile-time guard: CONTRACT_NAMES and ContractTypes list the same names.
type MissingType = Exclude<ContractName, keyof ContractTypes>;
type MissingName = Exclude<keyof ContractTypes, ContractName>;
export const CONTRACT_TYPES_COMPLETE: [MissingType, MissingName] extends [never, never] ? true : never = true;
