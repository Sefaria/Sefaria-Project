import type { ZodIssue, ZodType } from "zod";

import {
  responseContracts,
  type GeneratedResponseContract,
} from "./generated/response-contracts.gen.js";
import { SefariaContractError, type ContractIssue } from "./contract-error.js";

export type { GeneratedResponseContract } from "./generated/response-contracts.gen.js";

/** Identifies one documented operation response by method, path, and status. */
export interface ResponseSelector {
  /** HTTP method; matching is case-insensitive. */
  readonly method: string;
  /** Generated OpenAPI path template rather than a concrete request URL. */
  readonly path: string;
  /** HTTP response status code. */
  readonly status: number;
}

/** Non-throwing validation result for externally supplied response-shaped JSON. */
export type ValidationResult =
  | {
      readonly valid: true;
      readonly issues: readonly [];
    }
  | {
      readonly valid: false;
      readonly issues: readonly ContractIssue[];
    };

/** Resolves the runtime schema used for one generated response contract. */
export type ResponseValidatorLookup = (
  contract: GeneratedResponseContract,
) => ZodType | undefined;

/** Response metadata consumed by the public client's validation interceptor. */
export interface ResponseValidationContext {
  /** HTTP method used for generated operation lookup. */
  readonly method: string;
  /** Generated OpenAPI path template used for operation lookup. */
  readonly path: string;
  /** Original response to validate without consuming its body. */
  readonly response: Response;
}

function normalizeMethod(method: string): string {
  return method.toUpperCase();
}

function findOperationContract(
  selector: Omit<ResponseSelector, "status">,
): GeneratedResponseContract | undefined {
  const method = normalizeMethod(selector.method);
  return responseContracts.find(
    (entry) => entry.method === method && entry.path === selector.path,
  );
}

/** Returns the generated contract matching an exact method, path, and status. */
export function getResponseContract(
  selector: ResponseSelector,
): GeneratedResponseContract | undefined {
  const method = normalizeMethod(selector.method);
  return responseContracts.find(
    (entry) =>
      entry.method === method &&
      entry.path === selector.path &&
      entry.status === selector.status,
  );
}

/** Returns the Zod schema attached to a generated response contract. */
export function getResponseValidator(
  contract: GeneratedResponseContract,
): ZodType | undefined {
  return contract.schema;
}

function encodePointerSegment(segment: PropertyKey): string {
  return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

function issuesFromZod(
  errors: readonly ZodIssue[],
  schemaPath: string,
): ContractIssue[] {
  return errors.map((error) => ({
    instancePath:
      error.path.length === 0
        ? ""
        : `/${error.path.map(encodePointerSegment).join("/")}`,
    schemaPath,
    keyword: error.code,
    message: error.message,
  }));
}

function syntheticIssue(
  keyword: string,
  schemaPath: string,
  message: string,
): ContractIssue {
  return {
    instancePath: "",
    schemaPath,
    keyword,
    message,
  };
}

/** Validates externally supplied JSON without throwing or requiring a Response. */
export function validateExternalResponse(
  selector: ResponseSelector,
  value: unknown,
  lookup: ResponseValidatorLookup = getResponseValidator,
): ValidationResult {
  const contract = getResponseContract(selector);
  if (contract === undefined) {
    return {
      valid: false,
      issues: [
        syntheticIssue(
          "undocumented-status",
          "",
          `No documented response schema for ${normalizeMethod(
            selector.method,
          )} ${selector.path} status ${selector.status}.`,
        ),
      ],
    };
  }
  if (contract.bodyType !== "json") {
    return {
      valid: false,
      issues: [
        syntheticIssue(
          "unsupported-body-type",
          contract.schemaPath,
          `External JSON validation is not available for ${contract.bodyType} responses.`,
        ),
      ],
    };
  }
  const validator = lookup(contract);
  if (validator === undefined) {
    return {
      valid: false,
      issues: [
        syntheticIssue(
          "missing-validator",
          contract.schemaPath,
          `No generated validator named ${contract.validatorName}.`,
        ),
      ],
    };
  }
  const result = validator.safeParse(value);
  if (result.success) {
    return { valid: true, issues: [] };
  }
  return {
    valid: false,
    issues: issuesFromZod(result.error.issues, contract.schemaPath),
  };
}

function normalizedMediaType(contentType: string | null): string | undefined {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() || undefined;
}

function contractError(
  contract: GeneratedResponseContract,
  response: Response,
  issues: readonly ContractIssue[],
): SefariaContractError {
  return new SefariaContractError({
    operationId: contract.operationId,
    method: contract.method,
    path: contract.path,
    status: response.status,
    issues,
    response,
  });
}

/**
 * Validates a client response's status, content type, JSON syntax, and body.
 *
 * @throws {SefariaContractError} When the response violates its generated contract.
 */
export async function validateResponse(
  context: ResponseValidationContext,
  lookup: ResponseValidatorLookup = getResponseValidator,
): Promise<void> {
  const selector = {
    method: context.method,
    path: context.path,
    status: context.response.status,
  };
  const operation = findOperationContract(selector);
  if (operation === undefined) {
    throw new Error(
      `No generated operation metadata for ${normalizeMethod(
        context.method,
      )} ${context.path}.`,
    );
  }
  const contract = getResponseContract(selector);
  if (contract === undefined) {
    throw contractError(operation, context.response, [
      syntheticIssue(
        "undocumented-status",
        "",
        `HTTP ${context.response.status} is not documented for this operation.`,
      ),
    ]);
  }
  const mediaType = normalizedMediaType(
    context.response.headers.get("content-type"),
  );
  if (
    mediaType === undefined ||
    !contract.contentTypes.some(
      (documented) => normalizedMediaType(documented) === mediaType,
    )
  ) {
    throw contractError(contract, context.response, [
      syntheticIssue(
        "content-type",
        contract.schemaPath,
        `Expected ${contract.contentTypes.join(
          " or ",
        )}, received ${mediaType ?? "no content type"}.`,
      ),
    ]);
  }

  if (contract.bodyType === "blob") {
    return;
  }

  const validator = lookup(contract);
  if (validator === undefined) {
    throw contractError(contract, context.response, [
      syntheticIssue(
        "missing-validator",
        contract.schemaPath,
        `No generated validator named ${contract.validatorName}.`,
      ),
    ]);
  }

  const responseText = await context.response.clone().text();
  let value: unknown;
  try {
    value = JSON.parse(responseText) as unknown;
  } catch (error) {
    throw contractError(contract, context.response, [
      syntheticIssue(
        "invalid-json",
        contract.schemaPath,
        error instanceof Error
          ? error.message
          : "Response JSON parsing failed.",
      ),
    ]);
  }

  const result = validator.safeParse(value);
  if (!result.success) {
    throw contractError(
      contract,
      context.response,
      issuesFromZod(result.error.issues, contract.schemaPath),
    );
  }
}
