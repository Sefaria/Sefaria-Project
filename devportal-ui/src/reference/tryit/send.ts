// The only module that calls the API (PLAN §2.12, contract C10 `try_it`). No credentials, no cache, no referrer,
// CORS mode. The URL comes from request/request.ts `tryItUrl`, which keeps it under `<apiOrigin>/api/`.

/** The fetch options every Try It call uses, exactly as C10 lists them. */
export const TRY_IT_FETCH_OPTIONS = {
  credentials: 'omit',
  mode: 'cors',
  cache: 'no-store',
  referrerPolicy: 'no-referrer',
} as const satisfies RequestInit;

export interface TryItRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface TryItResponse {
  ok: true;
  status: number;
  statusText: string;
  /** Response headers the browser exposes (CORS-safelisted plus `Access-Control-Expose-Headers`). */
  headers: [string, string][];
  contentType: string;
  /** The body as text; it is only ever put into the DOM as text nodes. */
  bodyText: string;
}

export interface TryItFailure {
  ok: false;
  /** 0, as the `try_it_run` event reports a request that failed without a response. */
  status: 0;
  message: string;
}

export type TryItResult = TryItResponse | TryItFailure;

export async function sendTryIt(request: TryItRequest, fetchImpl: typeof fetch = fetch): Promise<TryItResult> {
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const headers: [string, string][] = [];
    response.headers.forEach((value, name) => headers.push([name, value]));
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers,
      contentType: response.headers.get('content-type') ?? '',
      bodyText: await response.text(),
    };
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Pretty-prints a JSON body as live's viewer does (two spaces); other bodies are shown unchanged. */
export function formatBody(bodyText: string, contentType: string): string {
  const looksJson = /json/i.test(contentType) || /^\s*[[{]/.test(bodyText);
  if (!looksJson) return bodyText;
  try {
    return JSON.stringify(JSON.parse(bodyText), null, 2);
  } catch {
    return bodyText;
  }
}
