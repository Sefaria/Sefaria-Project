import type { PagePayload } from '../contracts';

/** Id of the `<script type="application/json">` element Django writes with `json_script` (PLAN §2.5). */
export const DATA_ELEMENT_ID = 'dp-data';
/** Id of the element the bundle mounts on with `createRoot` (PLAN §2.5). */
export const ROOT_ELEMENT_ID = 'dp-root';

export class PageDataError extends Error {
  override name = 'PageDataError';
}

/**
 * Reads the page payload (contract C3, `page-payload.schema.json`) from the data island.
 * Returns null when the page has no island. Throws `PageDataError` when the island is not a payload.
 */
export function readPageData(doc: Document): PagePayload | null {
  const element = doc.getElementById(DATA_ELEMENT_ID);
  if (element === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(element.textContent ?? '');
  } catch (error) {
    throw new PageDataError(`#${DATA_ELEMENT_ID} does not contain JSON`, { cause: error });
  }
  if (!isPayloadLike(parsed)) {
    throw new PageDataError(`#${DATA_ELEMENT_ID} is not a page payload`);
  }
  return parsed;
}

function isPayloadLike(value: unknown): value is PagePayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.contractVersion === 1 && typeof record.kind === 'string' && typeof record.path === 'string';
}
