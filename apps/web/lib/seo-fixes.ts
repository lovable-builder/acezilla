import "server-only";
import { buildFixPrompt, FIX_SYSTEM, planFixTargets, validateFixes, type DraftedFix, type PageData } from "@acezilla/seo";

/** Google Gemini API (generateContent). The model is configurable; the alias follows Google's current Flash model. */
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const endpoint = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

export type FixResult = { ok: true; fixes: DraftedFix[]; planned: number } | { ok: false; reason: string };

/**
 * Drafts copy-ready fixes for the issues the audit found. The audit itself is deterministic; the model only writes the
 * wording. Page text is untrusted, so what comes back is re-validated in code and anything off-spec is dropped.
 * Never throws: with no key or any API failure the audit still completes, just without drafts.
 */
export async function draftFixes(pages: PageData[], fetchImpl: typeof fetch = fetch): Promise<FixResult> {
  const targets = planFixTargets(pages);
  if (targets.length === 0) return { ok: true, fixes: [], planned: 0 };
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "GEMINI_API_KEY is not set" };
  try {
    const res = await fetchImpl(endpoint(MODEL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: FIX_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: buildFixPrompt(targets) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 4000 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return { ok: false, reason: `Gemini API ${res.status}` };
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
    if (body.promptFeedback?.blockReason) return { ok: false, reason: "Gemini declined to draft fixes for this site" };
    const c = body.candidates?.[0];
    const text = c?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text || c?.finishReason === "MAX_TOKENS") return { ok: false, reason: "No usable output" };
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { ok: false, reason: "Output was not valid JSON" }; }
    return { ok: true, fixes: validateFixes(targets, raw), planned: targets.length };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "Gemini timed out" : "Drafting failed" };
  }
}
