import { errorFromStatus } from "./errors";
import { LlmError, type GenerateJsonRequest } from "./types";

/** The request body is identical for AI Studio and Vertex AI. There is deliberately no `tools` field: output is data only. */
export function buildGenerateBody(req: Pick<GenerateJsonRequest<unknown>, "system" | "user" | "schema" | "maxOutputTokens" | "temperature">) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: req.schema, maxOutputTokens: req.maxOutputTokens, temperature: req.temperature ?? 0.2 },
  };
}

const LOCATION = /^[a-z]+(-[a-z0-9]+)*$/;
const MODEL = /^[A-Za-z0-9._-]{1,80}$/;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/** Vertex AI generateContent URL. `global` and the US/EU multi-regions use their own hostnames; other locations prefix the host. */
export function vertexUrl(o: { project: string; location: string; model: string }): string {
  if (!PROJECT.test(o.project)) throw new LlmError("config", "GOOGLE_PROJECT_ID is missing or not a valid project ID.");
  if (!LOCATION.test(o.location)) throw new LlmError("config", "GOOGLE_VERTEX_LOCATION is missing or malformed (for example global, us, eu or europe-west4).");
  if (!MODEL.test(o.model)) throw new LlmError("config", "GEMINI_MODEL is malformed.");
  const host = o.location === "global" ? "aiplatform.googleapis.com" : o.location === "us" || o.location === "eu" ? `aiplatform.${o.location}.rep.googleapis.com` : `${o.location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${o.project}/locations/${o.location}/publishers/google/models/${o.model}:generateContent`;
}

export function aiStudioUrl(model: string): string {
  if (!MODEL.test(model)) throw new LlmError("config", "GEMINI_MODEL is malformed.");
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/** Pulls the JSON text out of a generateContent response. Refusals, filters and truncation are errors, never partial data. */
export function parseGenerateResponse(body: unknown, backend: string): unknown {
  const b = body as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } } | null;
  if (b?.promptFeedback?.blockReason) throw new LlmError("blocked", `${backend}: the model declined this request (${b.promptFeedback.blockReason}).`);
  const c = b?.candidates?.[0];
  if (!c) throw new LlmError("invalid_output", `${backend}: the answer contained no result.`);
  if (c.finishReason && c.finishReason !== "STOP") throw new LlmError(c.finishReason === "MAX_TOKENS" ? "invalid_output" : "blocked", `${backend}: the answer was cut short or filtered (${c.finishReason}).`);
  const text = c.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new LlmError("invalid_output", `${backend}: the answer was empty.`);
  try { return JSON.parse(text); } catch { throw new LlmError("invalid_output", `${backend}: the answer was not valid JSON.`); }
}

/** Runs the caller's strict validator. A mismatch fails closed. */
export function validateOrFail<T>(raw: unknown, validate: (r: unknown) => T | null, backend: string): T {
  const v = validate(raw);
  if (v === null) throw new LlmError("invalid_output", `${backend}: the answer did not match the expected format.`);
  return v;
}

export { errorFromStatus };
