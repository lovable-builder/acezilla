import { test } from "node:test";
import assert from "node:assert/strict";
import { aiStudioUrl, buildGenerateBody, decodeServiceAccountKey, errorFromStatus, LlmError, parseGenerateResponse, validateOrFail, vertexUrl, type JsonSchema } from "./index";

const schema: JsonSchema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
const cand = (text: string, finishReason = "STOP") => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });
const kind = (fn: () => unknown) => { try { fn(); return "none"; } catch (e) { return e instanceof LlmError ? e.kind : "other"; } };

test("each HTTP status maps to its own specific error, and the body is never included", () => {
  const cases: [number, string][] = [[402, "billing"], [429, "quota"], [403, "iam"], [404, "not_found"], [401, "auth"], [400, "bad_request"], [500, "unavailable"], [503, "unavailable"], [418, "bad_request"]];
  for (const [status, k] of cases) { const e = errorFromStatus(status, "Vertex AI"); assert.equal(e.kind, k, String(status)); assert.equal(e.status, status); }
  assert.match(errorFromStatus(404, "Vertex AI").message, /region|model/i);
  assert.match(errorFromStatus(403, "Vertex AI").message, /role|enabled/i);
  assert.match(errorFromStatus(402, "Vertex AI").message, /billing|credit/i);
  assert.equal(new Set(cases.slice(0, 6).map(([s]) => errorFromStatus(s, "x").message)).size, 6, "no two statuses share a message");
});

test("Vertex URLs: global has no host prefix, multi-regions use rep hosts, regions prefix the host", () => {
  const base = { project: "acezilla", model: "gemini-3.1-flash-lite" };
  assert.equal(vertexUrl({ ...base, location: "global" }), "https://aiplatform.googleapis.com/v1/projects/acezilla/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent");
  assert.equal(vertexUrl({ ...base, location: "europe-west4" }), "https://europe-west4-aiplatform.googleapis.com/v1/projects/acezilla/locations/europe-west4/publishers/google/models/gemini-3.1-flash-lite:generateContent");
  assert.match(vertexUrl({ ...base, location: "eu" }), /^https:\/\/aiplatform\.eu\.rep\.googleapis\.com\//);
  assert.match(vertexUrl({ ...base, location: "us" }), /^https:\/\/aiplatform\.us\.rep\.googleapis\.com\//);
  for (const bad of [{ location: "" }, { location: "evil.com/x" }, { location: "a b" }, { location: "GLOBAL" }]) assert.equal(kind(() => vertexUrl({ ...base, ...bad })), "config", JSON.stringify(bad));
  assert.equal(kind(() => vertexUrl({ project: "x/../y", model: "m", location: "global" })), "config");
  assert.equal(kind(() => vertexUrl({ project: "acezilla", model: "m/../../x", location: "global" })), "config");
  assert.equal(aiStudioUrl("gemini-flash-latest"), "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
});

test("the request declares JSON output with a schema, caps output, and offers the model no tools", () => {
  const b = buildGenerateBody({ system: "S", user: "U", schema, maxOutputTokens: 500 });
  assert.equal(b.generationConfig.responseMimeType, "application/json"); assert.deepEqual(b.generationConfig.responseSchema, schema); assert.equal(b.generationConfig.maxOutputTokens, 500);
  assert.equal(b.systemInstruction.parts[0]!.text, "S"); assert.equal(b.contents[0]!.parts[0]!.text, "U");
  const keys = Object.keys(b); assert.ok(!keys.some((k) => /tool|function|grounding|code/i.test(k)), keys.join());
});

test("responses: valid JSON passes; refusals, filters, truncation, empty and malformed answers all fail", () => {
  assert.deepEqual(parseGenerateResponse(cand('{"a":"x"}'), "T"), { a: "x" });
  assert.equal(kind(() => parseGenerateResponse({ promptFeedback: { blockReason: "SAFETY" } }, "T")), "blocked");
  assert.equal(kind(() => parseGenerateResponse(cand('{"a":"x"}', "SAFETY"), "T")), "blocked");
  assert.equal(kind(() => parseGenerateResponse(cand('{"a":"x', "MAX_TOKENS"), "T")), "invalid_output");
  assert.equal(kind(() => parseGenerateResponse(cand("not json"), "T")), "invalid_output");
  assert.equal(kind(() => parseGenerateResponse(cand(""), "T")), "invalid_output");
  assert.equal(kind(() => parseGenerateResponse({}, "T")), "invalid_output");
  assert.equal(kind(() => parseGenerateResponse(null, "T")), "invalid_output");
});

test("a schema mismatch fails closed instead of returning partial data", () => {
  const strict = (r: unknown) => (r && typeof r === "object" && typeof (r as { a?: unknown }).a === "string" ? (r as { a: string }) : null);
  assert.deepEqual(validateOrFail({ a: "ok" }, strict, "T"), { a: "ok" });
  assert.equal(kind(() => validateOrFail({ a: 5 }, strict, "T")), "invalid_output");
  assert.equal(kind(() => validateOrFail(null, strict, "T")), "invalid_output");
});

// Obviously fake values only: no real credential belongs in a test.
const fakeKey = (over: Record<string, unknown> = {}) => Buffer.from(JSON.stringify({ type: "service_account", client_email: "sa@example.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nFAKE-NOT-A-KEY\n-----END PRIVATE KEY-----\n", ...over })).toString("base64");

test("service account key decoding checks its shape and never puts the value in an error message", () => {
  const k = decodeServiceAccountKey(fakeKey(), "sa@example.iam.gserviceaccount.com");
  assert.equal(k.client_email, "sa@example.iam.gserviceaccount.com");
  const bads: [string | undefined, string?][] = [[undefined], [""], ["!!!not-base64-json"], [Buffer.from("[]").toString("base64")], [fakeKey({ private_key: "nope" })], [fakeKey({ client_email: 5 })], [fakeKey(), "other@example.com"]];
  for (const [v, email] of bads) {
    let msg = ""; try { decodeServiceAccountKey(v, email); } catch (e) { assert.ok(e instanceof LlmError && e.kind === "config"); msg = (e as Error).message; }
    assert.ok(msg, `expected a config error for ${String(v).slice(0, 10)}`);
    assert.ok(!msg.includes("FAKE-NOT-A-KEY") && !msg.includes("BEGIN PRIVATE") && !(v && v.length > 20 && msg.includes(v)), "no part of the credential in the message");
  }
});
