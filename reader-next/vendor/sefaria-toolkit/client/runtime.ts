/**
 * SEFARIA-READER EXTENSION: the client and SDK without the zod contracts (index.ts re-exports the generated zod schemas, whose
 * top-level construction cannot be tree-shaken, so importing it ships ~58 KB gzip of validators to every page). The app imports
 * from here; the validators load lazily only when a client is created with `validate: true` (development and tests).
 */
export { createSefariaClient, type SefariaClient, type SefariaCacheOptions, type SefariaClientOptions } from "./client.js";
export { SefariaContractError, type ContractIssue, type SefariaContractErrorOptions } from "./contract-error.js";
export type { Options } from "./generated/sdk.gen.js";
export { calendars, collections, index, lexicon, misc, ref, related, sheets, term, text, topic } from "./generated/namespaces.gen.js";
export type * from "./generated/contracts.gen.js";
