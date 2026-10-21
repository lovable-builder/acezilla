"use server";
import { buildCopilotPrompt, cleanQuestion, COPILOT_MAX_TOKENS, COPILOT_SCHEMA, COPILOT_SYSTEM, parseCopilotResponse, sanitizeHistory, type CopilotAnswer } from "@acezilla/models";
import type { JsonSchema } from "@acezilla/llm";
import { buildWorkspaceBrief } from "@/lib/ai-brief";
import { AI_LIMITS, friendlyAiError, takeAiQuota } from "@/lib/ai-guard";
import { getLlm } from "@/lib/llm";
import { getWorkspaceContext } from "@/lib/workspace";

export type AskResult = { ok: true; answer: CopilotAnswer } | { ok: false; error: string };

/** Answers one question from a fixed snapshot of the workspace. Read-only: the model has no tools and changes nothing. */
export async function askCopilot(input: { question: unknown; history: unknown; days: unknown }): Promise<AskResult> {
  const question = cleanQuestion(input.question);
  if (!question) return { ok: false, error: "Type a question first." };
  const days = [7, 30, 90].includes(Number(input.days)) ? Number(input.days) : 30;
  const { supabase, current } = await getWorkspaceContext();
  const { data: auth } = await supabase.auth.getUser();
  if (!current || !auth.user) return { ok: false, error: "Sign in again to continue." };
  if (!(await takeAiQuota(current.id, "copilot"))) return { ok: false, error: `You have used today's ${AI_LIMITS.copilot} questions for this workspace. It resets tomorrow.` };
  try {
    const { brief, numbers } = await buildWorkspaceBrief(supabase, current, days);
    const answer = await getLlm().generateJson({
      system: COPILOT_SYSTEM, user: buildCopilotPrompt(question, sanitizeHistory(input.history), brief), schema: COPILOT_SCHEMA as unknown as JsonSchema,
      maxOutputTokens: COPILOT_MAX_TOKENS, temperature: 0.2, validate: (raw) => parseCopilotResponse(raw, numbers),
    });
    return { ok: true, answer };
  } catch (e) { return { ok: false, error: friendlyAiError(e) }; }
}
