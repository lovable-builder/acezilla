/** What can go wrong when asking a model for structured data. Each kind has a different fix, so they are never merged. */
export type LlmErrorKind =
  | "config"          // a setting is missing or malformed (no network call was made)
  | "auth"            // 401: the credential was rejected
  | "billing"         // 402: no credit or billing problem
  | "quota"           // 429: rate or quota limit
  | "iam"             // 403: missing permission, or the API is not enabled for the project
  | "not_found"       // 404: wrong region or model ID
  | "bad_request"     // 400: the request itself was refused
  | "unavailable"     // 5xx or network failure
  | "timeout"
  | "blocked"         // the model declined or a safety filter stopped it
  | "invalid_output"; // the answer did not match the declared schema: fail closed

export class LlmError extends Error {
  constructor(readonly kind: LlmErrorKind, message: string, readonly status?: number) { super(message); this.name = "LlmError"; }
}

/** The JSON-schema subset both Gemini endpoints accept. Anything else is ignored by the API, so it is not declared here. */
export interface JsonSchema {
  type: "object" | "array" | "string" | "integer" | "number" | "boolean";
  description?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema;
  enum?: string[]; maxItems?: number; minItems?: number; maximum?: number; minimum?: number; nullable?: boolean; propertyOrdering?: string[];
}

export interface GenerateJsonRequest<T> {
  /** Instructions. Written by us, never built from page text. */ system: string;
  /** The task and the untrusted data, already delimited. */ user: string;
  schema: JsonSchema; maxOutputTokens: number; temperature?: number;
  /** Strict check of the parsed JSON. Return null if it does not match: the call then fails closed. */ validate: (raw: unknown) => T | null;
}

/** One interface for every backend. Call sites never learn which one is live. */
export interface LlmProvider {
  readonly name: string;
  generateJson<T>(req: GenerateJsonRequest<T>): Promise<T>;
}
