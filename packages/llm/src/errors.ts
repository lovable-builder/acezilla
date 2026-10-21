import { LlmError, type LlmErrorKind } from "./types";

const MAP: Record<number, [LlmErrorKind, string]> = {
  400: ["bad_request", "The AI service refused the request (HTTP 400). The model ID, schema or request body is not accepted."],
  401: ["auth", "The AI service rejected the credential (HTTP 401). The key or service account is invalid or expired."],
  402: ["billing", "The AI service reports a billing problem (HTTP 402): no credit or payment method on the project."],
  403: ["iam", "Permission denied (HTTP 403). The service account lacks the Vertex AI user role, or the API is not enabled for the project."],
  404: ["not_found", "Not found (HTTP 404). Usually the wrong region (GOOGLE_VERTEX_LOCATION) or model ID (GEMINI_MODEL) for this project."],
  429: ["quota", "Rate or quota limit reached (HTTP 429). Try again later or raise the quota."],
};

/** A specific, actionable error for an HTTP status. The response body is never included, so nothing sensitive can leak through it. */
export function errorFromStatus(status: number, backend: string): LlmError {
  const hit = MAP[status];
  if (hit) return new LlmError(hit[0], `${backend}: ${hit[1]}`, status);
  if (status >= 500) return new LlmError("unavailable", `${backend}: the AI service is unavailable (HTTP ${status}).`, status);
  return new LlmError("bad_request", `${backend}: unexpected answer (HTTP ${status}).`, status);
}
