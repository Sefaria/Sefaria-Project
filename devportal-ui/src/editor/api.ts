// The editor API client (contract C3, devportal/views/editor_api.py). Every request is same-origin with the session
// cookie and, for unsafe methods, the CSRF token from GET /_portal/csrf (PLAN §2.3.5). A 409 becomes a
// `ConflictError` carrying the newest revision or tree generation; other errors an `ApiError`.
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
  EditorPublishResponse,
  EditorRevisions,
  EditorTree,
  EditorUploadResponse,
  ErrorResponse,
  Section,
} from '../contracts';

export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]>;

  constructor(status: number, body: Partial<ErrorResponse> | null) {
    super(body?.error?.message ?? `The server answered ${status}.`);
    this.status = status;
    this.code = body?.error?.code ?? 'server_error';
    this.fields = body?.error?.fields ?? {};
  }
}

export class ConflictError extends Error {
  override name = 'ConflictError';
  readonly conflict: EditorConflictResponse;

  constructor(conflict: EditorConflictResponse) {
    super(conflict.error.message);
    this.conflict = conflict;
  }
}

export interface EditorApiOptions {
  apiBase?: string;
  csrfUrl?: string;
  fetch?: typeof fetch;
}

export class EditorApi {
  private token: Promise<string> | null = null;
  private readonly base: string;
  private readonly csrfUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: EditorApiOptions = {}) {
    this.base = options.apiBase ?? '/_portal/editor';
    this.csrfUrl = options.csrfUrl ?? '/_portal/csrf';
    this.fetchFn = options.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  private csrf(): Promise<string> {
    this.token ??= this.fetchFn(this.csrfUrl, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json() as Promise<{ csrfToken: string }>)
      .then((d) => d.csrfToken)
      .catch((error: unknown) => {
        this.token = null;
        throw error;
      });
    return this.token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (method !== 'GET') headers['X-CSRFToken'] = await this.csrf();
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await this.fetchFn(this.base + path, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data: unknown = await response.json().catch(() => null);
    if (response.status === 409 && data && typeof data === 'object' && 'generation' in data) {
      throw new ConflictError(data as EditorConflictResponse);
    }
    if (!response.ok) throw new ApiError(response.status, data as Partial<ErrorResponse> | null);
    return data as T;
  }

  tree(section: Section): Promise<EditorTree> {
    return this.request('GET', `/tree/${section}`);
  }
  page(id: number): Promise<EditorPage> {
    return this.request('GET', `/pages/${id}`);
  }
  create(body: EditorPageCreateRequest): Promise<EditorPage> {
    return this.request('POST', '/pages', body);
  }
  settings(id: number, body: EditorPageSettingsRequest): Promise<EditorPage> {
    return this.request('PATCH', `/pages/${id}`, body);
  }
  remove(id: number): Promise<EditorTree> {
    return this.request('DELETE', `/pages/${id}`);
  }
  saveDraft(id: number, body: EditorDraftSaveRequest): Promise<EditorDraftSaveResponse> {
    return this.request('PUT', `/pages/${id}/draft`, body);
  }
  publish(id: number, revision: number): Promise<EditorPublishResponse> {
    return this.request('POST', `/pages/${id}/publish`, { revision });
  }
  revisions(id: number): Promise<EditorRevisions> {
    return this.request('GET', `/pages/${id}/revisions`);
  }
  restore(id: number, number: number, baseRevision: number | null): Promise<EditorDraftSaveResponse> {
    return this.request('POST', `/pages/${id}/revisions/${number}/restore`, { baseRevision });
  }
  move(id: number, body: EditorMoveRequest): Promise<EditorTree> {
    return this.request('POST', `/pages/${id}/move`, body);
  }
  preview(body: EditorPreviewRequest): Promise<EditorPreviewResponse> {
    return this.request('POST', '/preview', body);
  }
  upload(file: File): Promise<EditorUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.request('POST', '/uploads', form);
  }
}
