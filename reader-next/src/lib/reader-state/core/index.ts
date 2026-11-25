/**
 * The reader state core: everything a reader needs to offer snapshots, streams, recordings and follow, with no React, router or app imports.
 * A host (src/lib/reader-state/sefaria) binds it to this reader.
 */
export * from "./types";
export { createSliceRegistry } from "./registry";
export { diff, fold, isEmptyChange } from "./diff";
export { FORBIDDEN_KEYS, cloneJson, isJsonSafe, jsonEqual } from "./json";
export {
  parseRecording,
  parseSnapshot,
  parseSnapshotChange,
  parseStreamMessage,
  recordingSchema,
  sliceValueSchema,
  snapshotChangeSchema,
  snapshotSchema,
  streamMessageSchema,
} from "./schema";
export { createReaderStateApi, defaultSchedule, sliceInFilter } from "./api";
export { createStreamReader, createStreamWriter } from "./stream";
export * from "./transports";
