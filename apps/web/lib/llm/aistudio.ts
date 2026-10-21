import "server-only";
import { aiStudioUrl, buildGenerateBody, errorFromStatus, LlmError, parseGenerateResponse, validateOrFail, type GenerateJsonRequest, type LlmProvider } from "@acezilla/llm";

/** Google AI Studio Gemini API with a plain API key. Kept as a fallback behind LLM_PROVIDER=aistudio. */
export const aiStudioProvider: LlmProvider = {
  name: "aistudio",
  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<T> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new LlmError("config", "GEMINI_API_KEY is not set.");
    const url = aiStudioUrl(process.env.GEMINI_MODEL || "gemini-flash-latest");
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(buildGenerateBody(req)), signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      throw new LlmError(e instanceof Error && e.name === "TimeoutError" ? "timeout" : "unavailable", e instanceof Error && e.name === "TimeoutError" ? "AI Studio: the request timed out." : "AI Studio: could not reach the service.");
    }
    if (!res.ok) throw errorFromStatus(res.status, "AI Studio");
    const json = await res.json().catch(() => null);
    return validateOrFail(parseGenerateResponse(json, "AI Studio"), req.validate, "AI Studio");
  },
};
