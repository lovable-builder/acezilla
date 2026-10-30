import "server-only";
import { LlmError } from "@acezilla/llm";
import { createAdminClient } from "@/lib/supabase/admin";

/** Daily limits per workspace and feature. They bound cost and abuse; raise them when billing exists. */
export const AI_LIMITS = { copilot: 40, summary: 6, builder: 20, pricing: 15 } as const;

/** Counts one use against today's limit. Returns false when the limit is reached. */
export async function takeAiQuota(workspaceId: string, kind: keyof typeof AI_LIMITS): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("ai_usage_bump", { p_ws: workspaceId, p_kind: kind, p_limit: AI_LIMITS[kind] });
  if (error) { console.warn("[ai] quota check failed:", error.message); return false; }    // fail closed: no counting, no model call
  return data === true;
}

/** What the person sees for each kind of failure. Details go to the server log, never to the page. */
export function friendlyAiError(e: unknown): string {
  if (!(e instanceof LlmError)) { console.warn("[ai] unexpected error"); return "Something went wrong. Please try again."; }
  console.warn(`[ai] ${e.kind}${e.status ? ` ${e.status}` : ""}: ${e.message}`);
  switch (e.kind) {
    case "billing": return "The AI is temporarily unavailable. Nothing was lost, and your numbers are unaffected. Try again later.";
    case "quota": return "The AI service is busy. Try again in a minute.";
    case "blocked": return "The AI declined this request. Try rephrasing it.";
    case "invalid_output": return "The AI's answer could not be verified, so it was not shown. Try again.";
    case "timeout": case "unavailable": return "The AI service did not respond. Try again in a moment.";
    default: return "The AI is temporarily unavailable. Try again later.";
  }
}
