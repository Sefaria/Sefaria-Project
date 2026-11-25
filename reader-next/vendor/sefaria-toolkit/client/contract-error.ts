/** One structured response-contract mismatch. */
export interface ContractIssue {
  /** JSON Pointer into the received response value. */
  readonly instancePath: string;
  /** JSON Pointer identifying the generated schema location. */
  readonly schemaPath: string;
  /** Validator keyword or synthetic contract failure category. */
  readonly keyword: string;
  /** Human-readable diagnostic supplied by the validator. */
  readonly message?: string;
}

/** Complete context retained by {@link SefariaContractError}. */
export interface SefariaContractErrorOptions {
  /** Generated OpenAPI operation identifier. */
  readonly operationId: string;
  /** HTTP method from the generated operation contract. */
  readonly method: string;
  /** Generated operation path template. */
  readonly path: string;
  /** Received HTTP status code. */
  readonly status: number;
  /** Structured validation failures. */
  readonly issues: readonly ContractIssue[];
  /** Original response, preserved for headers and transport metadata. */
  readonly response: Response;
}

/** Error thrown when a Sefaria response violates its generated contract. */
export class SefariaContractError extends Error {
  /** Generated OpenAPI operation identifier. */
  readonly operationId: string;
  /** HTTP method from the generated operation contract. */
  readonly method: string;
  /** Generated operation path template. */
  readonly path: string;
  /** Received HTTP status code. */
  readonly status: number;
  /** Structured validation failures. */
  readonly issues: readonly ContractIssue[];
  /** Original response, preserved for headers and transport metadata. */
  readonly response: Response;

  constructor(options: SefariaContractErrorOptions) {
    const summary = options.issues
      .map(
        (issue) =>
          `${issue.instancePath || "/"} ${issue.keyword}${
            issue.message ? `: ${issue.message}` : ""
          }`,
      )
      .join("; ");
    super(
      `Sefaria response contract mismatch for ${options.operationId} (${options.method} ${options.path}, HTTP ${options.status}): ${summary}`,
    );
    this.name = "SefariaContractError";
    this.operationId = options.operationId;
    this.method = options.method;
    this.path = options.path;
    this.status = options.status;
    this.issues = options.issues;
    this.response = options.response;
  }
}
