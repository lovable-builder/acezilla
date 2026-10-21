import { LlmError } from "./types";

export interface ServiceAccountKey { client_email: string; private_key: string; project_id?: string; [k: string]: unknown }

/**
 * Decodes the base64 service account JSON from the environment. Error messages never contain any part of the value,
 * so a failure cannot leak it into logs. `expectedEmail`, when given, must match the key's own email.
 */
export function decodeServiceAccountKey(b64: string | undefined, expectedEmail?: string): ServiceAccountKey {
  if (!b64) throw new LlmError("config", "GOOGLE_SERVICE_ACCOUNT_KEY is not set.");
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8")); }
  catch { throw new LlmError("config", "GOOGLE_SERVICE_ACCOUNT_KEY is not valid base64-encoded JSON."); }
  const k = parsed as Partial<ServiceAccountKey> | null;
  if (!k || typeof k.client_email !== "string" || typeof k.private_key !== "string" || !k.private_key.includes("PRIVATE KEY"))
    throw new LlmError("config", "GOOGLE_SERVICE_ACCOUNT_KEY does not look like a service account key (client_email and private_key are required).");
  if (expectedEmail && k.client_email !== expectedEmail) throw new LlmError("config", "GOOGLE_SERVICE_ACCOUNT_KEY belongs to a different service account than GOOGLE_SERVICE_ACCOUNT_EMAIL.");
  return k as ServiceAccountKey;
}
