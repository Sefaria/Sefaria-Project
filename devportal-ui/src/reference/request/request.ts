// One description of the request a page's form makes, used both by the code samples (as a HAR request) and by
// Try It (as a URL under the API origin). PLAN §2.12: the origin is a constant, every path parameter is encoded
// with encodeURIComponent, and no value can move the URL outside `<origin>/api/`.
import type { OperationSpec } from '../../contracts';
import { bodyValue, type EndpointForm, type FormValues } from '../model/fields';
import { acceptType } from '../model/responses';

export interface HeaderEntry {
  name: string;
  value: string;
}

/** The HAR 1.2 request subset @readme/httpsnippet reads. */
export interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HeaderEntry[];
  queryString: HeaderEntry[];
  cookies: HeaderEntry[];
  headersSize: number;
  bodySize: number;
  postData?: { mimeType: string; text: string };
}

export interface RequestDescription {
  method: string;
  /** Path with the path parameters filled in (encoded), or `{name}` where a value is empty. */
  path: string;
  query: HeaderEntry[];
  headers: HeaderEntry[];
  body: { mimeType: string; text: string } | null;
}

/** Thrown when the parameters would make a URL outside `<origin>/api/`; Try It then sends nothing. */
export class UnsafeRequestUrlError extends Error {
  override name = 'UnsafeRequestUrlError';
}

const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/** Fills the path template, encoding each value with encodeURIComponent; an empty value keeps `{name}`. */
export function fillPath(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (placeholder: string, name: string) => {
    const value = values[name] ?? '';
    return value === '' ? placeholder : encodeURIComponent(value);
  });
}

export function describeRequest(op: OperationSpec, form: EndpointForm, values: FormValues): RequestDescription {
  const pathValues: Record<string, string> = {};
  for (const f of form.path) pathValues[f.name] = values[f.key] ?? '';
  const query = form.query.map((f) => ({ name: f.name, value: values[f.key] ?? '' })).filter((q) => q.value !== '');
  const headers: HeaderEntry[] = [{ name: 'accept', value: acceptType(op) }];
  const body = bodyValue(form, values);
  let bodyEntry: RequestDescription['body'] = null;
  if (form.bodyContentType !== null) {
    headers.push({ name: 'content-type', value: form.bodyContentType });
    if (body !== undefined) bodyEntry = { mimeType: form.bodyContentType, text: JSON.stringify(body) };
  }
  for (const f of form.header) {
    const value = values[f.key] ?? '';
    if (value !== '') headers.push({ name: f.name, value });
  }
  return { method: op.method.toUpperCase(), path: fillPath(op.path, pathValues), query, headers, body: bodyEntry };
}

/** The HAR request the code samples are generated from. `server` is the spec's `servers[0].url`. */
export function toHar(request: RequestDescription, server: string): HarRequest {
  const har: HarRequest = {
    method: request.method,
    url: `${server}${request.path}`,
    httpVersion: 'HTTP/1.1',
    headers: request.headers,
    queryString: request.query,
    cookies: [],
    headersSize: -1,
    bodySize: -1,
  };
  if (request.body !== null) har.postData = { mimeType: request.body.mimeType, text: request.body.text };
  return har;
}

/**
 * The URL Try It fetches: `origin` (the payload's apiOrigin constant) + the filled path + the query string, every
 * name and value encoded with encodeURIComponent. Throws UnsafeRequestUrlError unless the result is under
 * `<origin>/api/` (a value cannot add a path segment, but a whole-segment `.`/`..` would be resolved away).
 */
export function tryItUrl(origin: string, request: RequestDescription): string {
  if (!request.path.startsWith('/api/')) throw new UnsafeRequestUrlError(`path ${request.path} is not under /api/`);
  // An empty value leaves `{name}` in the path; encode the braces so the URL is well formed.
  const path = request.path.replace(/[{}]/g, (c) => encodeURIComponent(c));
  if (path.split('/').some((segment) => DOT_SEGMENT.test(segment))) {
    throw new UnsafeRequestUrlError('a path parameter cannot be "." or ".."');
  }
  const query = request.query.map((q) => `${encodeURIComponent(q.name)}=${encodeURIComponent(q.value)}`).join('&');
  const url = `${origin}${path}${query === '' ? '' : `?${query}`}`;
  const parsed = new URL(url);
  if (parsed.origin !== new URL(origin).origin || !parsed.pathname.startsWith('/api/')) {
    throw new UnsafeRequestUrlError('the request URL left the API origin');
  }
  return url;
}
