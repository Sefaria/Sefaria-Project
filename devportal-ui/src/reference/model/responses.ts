// Responses and their examples as live presents them: sorted by status code ("default" last), the first one
// expanded on load, and the response panel's example menu ("200 - Esther 1.1").
import type { OperationResponse, OperationSpec } from '../../contracts';

function statusRank(status: string): number {
  if (status === 'default') return 1000;
  const n = Number(status.replace(/X/g, '0'));
  return Number.isFinite(n) ? n : 999;
}

/** Responses in live's order: by status code, `default` last; the C3 file keeps the spec's order. */
export function sortedResponses(op: OperationSpec): OperationResponse[] {
  return op.responses
    .map((r, i) => ({ r, i }))
    .sort((a, b) => statusRank(a.r.status) - statusRank(b.r.status) || a.i - b.i)
    .map(({ r }) => r);
}

export interface ResponseExample {
  /** Stable id within the page: `<status>:<media type>:<name>`. */
  id: string;
  status: string;
  mediaType: string;
  /** The example's name, or null for a bare `example` (the menu then shows only the status). */
  name: string | null;
  /** Text shown in the viewer: JSON pretty-printed with two spaces, strings as they are. */
  text: string;
}

export function exampleText(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? '';
}

/** Every response example, grouped as live's menu lists them (by media type, in response order). */
export function responseExamples(op: OperationSpec): ResponseExample[] {
  const out: ResponseExample[] = [];
  for (const response of sortedResponses(op)) {
    for (const [mediaType, media] of Object.entries(response.content)) {
      for (const [name, example] of Object.entries(media.examples ?? {})) {
        out.push({
          id: `${response.status}:${mediaType}:${name}`,
          status: response.status,
          mediaType,
          name,
          text: exampleText(example.value),
        });
      }
      // A bare `example`, else the schema's own `example` (live shows both as "200" with no name).
      const bare = media.example !== undefined ? media.example : (media.schema as { example?: unknown }).example;
      if (bare !== undefined && Object.keys(media.examples ?? {}).length === 0) {
        out.push({
          id: `${response.status}:${mediaType}:`,
          status: response.status,
          mediaType,
          name: null,
          text: exampleText(bare),
        });
      }
    }
  }
  return out;
}

/** The `accept` header live sends and shows in samples: the first response media type, else JSON. */
export function acceptType(op: OperationSpec): string {
  for (const response of sortedResponses(op)) {
    const first = Object.keys(response.content)[0];
    if (first !== undefined) return first;
  }
  return 'application/json';
}

/** Status-dot color family, as live's `HTTPStatus_<n>`: 1-5, or 0 for unknown/`default`. */
export function statusFamily(status: string | number): number {
  const n = Number(String(status).charAt(0));
  return n >= 1 && n <= 5 ? n : 0;
}
