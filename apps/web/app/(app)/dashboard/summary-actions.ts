"use server";
import { revalidatePath } from "next/cache";
import { buildWorkspaceBrief } from "@/lib/ai-brief";
import { friendlyAiError, takeAiQuota } from "@/lib/ai-guard";
import { getLlm } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/workspace";
import { parseSummaryResponse, SUMMARY_MAX_TOKENS, SUMMARY_SCHEMA, SUMMARY_SYSTEM, dataBlock } from "@acezilla/models";
import type { JsonSchema } from "@acezilla/llm";

/** Writes (or rewrites) today's weekly summary and stores it, so viewing the Command center never costs a model call. */
export async function generateWeeklySummary(): Promise<void> {
  const { supabase, current } = await getWorkspaceContext();
  const { data: auth } = await supabase.auth.getUser();
  if (!current || !auth.user) return;
  if (!(await takeAiQuota(current.id, "summary"))) { revalidatePath("/dashboard"); return; }
  try {
    const { brief, numbers } = await buildWorkspaceBrief(supabase, current, 7);
    const summary = await getLlm().generateJson({
      system: SUMMARY_SYSTEM, user: `Write the weekly summary.\n${dataBlock("workspace", brief)}`, schema: SUMMARY_SCHEMA as unknown as JsonSchema,
      maxOutputTokens: SUMMARY_MAX_TOKENS, temperature: 0.2, validate: (raw) => parseSummaryResponse(raw, numbers),
    });
    await createAdminClient().from("ai_summary").upsert({ workspace_id: current.id, kind: "weekly", day: new Date().toISOString().slice(0, 10), content: summary, created_at: new Date().toISOString() }, { onConflict: "workspace_id,kind,day" });
  } catch (e) {
    const msg = friendlyAiError(e);
    await createAdminClient().from("ai_summary").upsert({ workspace_id: current.id, kind: "weekly", day: new Date().toISOString().slice(0, 10), content: { error: msg }, created_at: new Date().toISOString() }, { onConflict: "workspace_id,kind,day" });
  }
  revalidatePath("/dashboard");
}

