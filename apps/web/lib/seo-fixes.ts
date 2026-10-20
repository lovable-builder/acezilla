import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildFixPrompt, FIX_SYSTEM, planFixTargets, validateFixes, type DraftedFix, type PageData } from "@acezilla/seo";

const MODEL = "claude-opus-5-5";
const Output = z.object({ fixes: z.array(z.object({ id: z.number(), proposed: z.string(), rationale: z.string() })) });

export type FixResult = { ok: true; fixes: DraftedFix[]; planned: number } | { ok: false; reason: string };

/**
 * Drafts copy-ready fixes for the issues the audit found. The audit itself is deterministic; the model only writes the
 * wording. Page text is untrusted, so what comes back is re-validated in code and anything off-spec is dropped.
 * Never throws: with no key or any API failure the audit still completes, just without drafts.
 */
export async function draftFixes(pages: PageData[], client?: Anthropic): Promise<FixResult> {
  const targets = planFixTargets(pages);
  if (targets.length === 0) return { ok: true, fixes: [], planned: 0 };
  if (!client && !process.env.ANTHROPIC_API_KEY) return { ok: false, reason: "ANTHROPIC_API_KEY is not set" };
  try {
    const api = client ?? new Anthropic({ maxRetries: 2, timeout: 90_000 });
    const res = await api.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: FIX_SYSTEM,
      messages: [{ role: "user", content: buildFixPrompt(targets) }],
      output_config: { effort: "low", format: zodOutputFormat(Output) },
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "The model declined to draft fixes for this site" };
    if (!res.parsed_output) return { ok: false, reason: `No usable output (${res.stop_reason})` };
    return { ok: true, fixes: validateFixes(targets, res.parsed_output), planned: targets.length };
  } catch (e) {
    return { ok: false, reason: e instanceof Anthropic.APIError ? `Claude API ${e.status ?? "error"}` : "Drafting failed" };
  }
}
