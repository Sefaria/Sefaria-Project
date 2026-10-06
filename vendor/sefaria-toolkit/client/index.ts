export {
  createSefariaClient,
  type SefariaClient,
  type SefariaCacheOptions,
  type SefariaClientOptions,
} from "./client.js";
export {
  SefariaContractError,
  type ContractIssue,
  type SefariaContractErrorOptions,
} from "./contract-error.js";
export type { Options } from "./generated/sdk.gen.js";
export {
  calendars,
  collections,
  index,
  lexicon,
  misc,
  ref,
  related,
  sheets,
  term,
  text,
  topic,
} from "./generated/namespaces.gen.js";
export type * from "./generated/contracts.gen.js";
export * from "./generated/zod.gen.js";
export * from "./generated/response-validators.gen.js";
export {
  getResponseContract,
  getResponseValidator,
  validateExternalResponse,
  type GeneratedResponseContract,
  type ResponseSelector,
  type ResponseValidatorLookup,
  type ValidationResult,
} from "./validation.js";
