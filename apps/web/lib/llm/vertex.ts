import "server-only";
import { GoogleAuth } from "google-auth-library";
import { decodeServiceAccountKey, errorFromStatus, LlmError, parseGenerateResponse, validateOrFail, vertexUrl, buildGenerateBody, type GenerateJsonRequest, type LlmProvider } from "@acezilla/llm";

// Belt and braces on top of "server-only": this module holds a credential and must never run in a browser.
if (typeof window !== "undefined") throw new Error("lib/llm/vertex must not be imported from client code");

const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
let auth: GoogleAuth | null = null;

/** Built once per server instance from the environment. The decoded key lives only in memory and is never logged or written. */
function getAuth(): GoogleAuth {
  if (!auth) {
    const credentials = decodeServiceAccountKey(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || undefined);
    auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
  }
  return auth;
}

/**
 * Vertex AI (aiplatform.googleapis.com) with service-account auth. The model gets no tools: it can only return the
 * JSON we asked for, which is validated before anything uses it.
 */
export const vertexProvider: LlmProvider = {
  name: "vertex",
  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<T> {
    const url = vertexUrl({ project: process.env.GOOGLE_PROJECT_ID ?? "", location: process.env.GOOGLE_VERTEX_LOCATION ?? "", model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite" });
    let token: string | null | undefined;
    try { token = await getAuth().getAccessToken(); }
    catch (e) {
      if (e instanceof LlmError) throw e;
      throw new LlmError("auth", "Vertex AI: could not obtain a Google access token from the service account. Check GOOGLE_SERVICE_ACCOUNT_KEY.");   // no detail: it could echo credential parts
    }
    if (!token) throw new LlmError("auth", "Vertex AI: no access token was issued for the service account.");

    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(buildGenerateBody(req)), signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      throw new LlmError(e instanceof Error && e.name === "TimeoutError" ? "timeout" : "unavailable", e instanceof Error && e.name === "TimeoutError" ? "Vertex AI: the request timed out." : "Vertex AI: could not reach the service.");
    }
    if (!res.ok) throw errorFromStatus(res.status, "Vertex AI");
    const json = await res.json().catch(() => null);
    return validateOrFail(parseGenerateResponse(json, "Vertex AI"), req.validate, "Vertex AI");
  },
};
