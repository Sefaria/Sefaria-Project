import { RefIndex } from "./ref-index";

let instance: RefIndex | undefined;

/**
 * The process-wide ref index. In the browser it persists to IndexedDB; on the server it is memory-only
 * (book metadata and ref spellings are public data, so sharing it across requests is safe and saves API calls).
 */
export function getRefIndex(): RefIndex {
  instance ??= new RefIndex();
  return instance;
}
