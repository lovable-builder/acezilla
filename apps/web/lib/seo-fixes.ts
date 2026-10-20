import "server-only";
import { buildFixPrompt, FIX_SYSTEM, planFixTargets, validateFixes, type DraftedFix, type PageData } from "@acezilla/seo";

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

export type FixResult = { ok: true; fixes: DraftedFix[]; planned: number } | { ok: false; reason: string };

/**
 * Drafts copy-ready fixes for the issues the audit found. The audit itself is deterministic; the model only writes the
 * wording. Page text is untrusted, so what comes back is re-validated in code and anything off-spec is dropped.
 * Never throws: with no key or any API failure the audit still completes, just without drafts.
 */
export async function draftFixes(pages: PageData[], fetchImpl: typeof fetch = fetch): Promise<FixResult> {
  const targets = planFixTargets(pages);
  if (targets.length === 0) return { ok: true, fixes: [], planned: 0 };
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, reason: "DEEPSEEK_API_KEY is not set" };
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL, max_tokens: 4000, temperature: 0.3, response_format: { type: "json_object" },
        messages: [{ role: "system", content: FIX_SYSTEM }, { role: "user", content: buildFixPrompt(targets) }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return { ok: false, reason: `DeepSeek API ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const choice = body.choices?.[0];
    if (!choice?.message?.content || choice.finish_reason === "length") return { ok: false, reason: "No usable output" };
    let raw: unknown;
    try { raw = JSON.parse(choice.message.content); } catch { return { ok: false, reason: "Output was not valid JSON" }; }
    return { ok: true, fixes: validateFixes(targets, raw), planned: targets.length };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "DeepSeek timed out" : "Drafting failed" };
  }
}
