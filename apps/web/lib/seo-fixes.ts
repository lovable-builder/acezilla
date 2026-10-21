import "server-only";
import { FIX_MAX_OUTPUT_TOKENS, FIX_RESPONSE_SCHEMA, FIX_SYSTEM, buildFixPrompt, parseFixResponse, planFixTargets, type DraftedFix, type FlaggedInstruction, type PageData } from "@acezilla/seo";
import type { JsonSchema } from "@acezilla/llm";
import { getLlm, LlmError } from "@/lib/llm";

export type FixResult =
  | { ok: true; fixes: DraftedFix[]; planned: number; /** Instructions found inside the page text. Reported as findings; never followed. */ flagged: FlaggedInstruction[] }
  | { ok: false; reason: string; kind: string };

/**
 * Drafts copy-ready fixes for the issues the audit found. The audit itself is deterministic; the model only writes the
 * wording. Page text is untrusted data: it is delimited, the model has no tools, and the answer is schema-checked and then
 * validated card by card before anything is shown. Never throws: any failure leaves the audit complete, without drafts.
 */
export async function draftFixes(pages: PageData[]): Promise<FixResult> {
  const targets = planFixTargets(pages);
  if (targets.length === 0) return { ok: true, fixes: [], planned: 0, flagged: [] };
  try {
    const r = await getLlm().generateJson({
      system: FIX_SYSTEM, user: buildFixPrompt(targets), schema: FIX_RESPONSE_SCHEMA as unknown as JsonSchema,
      maxOutputTokens: FIX_MAX_OUTPUT_TOKENS, temperature: 0.2,
      validate: (raw) => parseFixResponse(targets, raw),
    });
    return { ok: true, fixes: r.fixes, planned: targets.length, flagged: r.flagged };
  } catch (e) {
    return e instanceof LlmError ? { ok: false, kind: e.kind, reason: e.message } : { ok: false, kind: "other", reason: "Drafting failed" };
  }
}
