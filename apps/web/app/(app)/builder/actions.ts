"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildBuilderPrompt, BUILDER_MAX_TOKENS, BUILDER_SCHEMA, builderSystem, cleanBuilderInput, parseBuilderResponse } from "@acezilla/models";
import type { JsonSchema } from "@acezilla/llm";
import { AI_LIMITS, friendlyAiError, takeAiQuota } from "@/lib/ai-guard";
import { getLlm } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

const back = (qs: string) => redirect(`/builder?${qs}`);

/** Drafts a campaign plan and saves it as a draft. Suggest-only: nothing is sent to any ad platform. */
export async function createDraft(formData: FormData) {
  let id: string;
  try {
    const { workspace, user } = await requireWriter();
    const parsed = cleanBuilderInput(Object.fromEntries(formData.entries()));
    if (!parsed.ok) return back(`error=${encodeURIComponent(parsed.error)}`);
    const input = parsed.value;
    if (!(await takeAiQuota(workspace.id, "builder"))) return back(`error=${encodeURIComponent(`You have used today's ${AI_LIMITS.builder} drafts for this workspace. It resets tomorrow.`)}`);
    const output = await getLlm().generateJson({
      system: builderSystem(input.platform), user: buildBuilderPrompt(input), schema: BUILDER_SCHEMA as unknown as JsonSchema,
      maxOutputTokens: BUILDER_MAX_TOKENS, temperature: 0.7, validate: (raw) => parseBuilderResponse(input.platform, raw),
    });
    const { data, error } = await createAdminClient().from("campaign_draft").insert({ workspace_id: workspace.id, created_by: user.id, platform: input.platform, title: output.campaignName, brief: input, output }).select("id").single();
    if (error || !data) throw new Error("Could not save the draft");
    id = data.id as string;
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return back(`error=${encodeURIComponent(friendlyAiError(e))}`);
  }
  revalidatePath("/builder");
  back(`draft=${id}`);
}

/** Records that a person reviewed and approved the draft. It still goes nowhere by itself: they copy it into the ad platform. */
export async function approveDraft(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  try {
    const { workspace, user } = await requireWriter();
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Unknown draft");
    await createAdminClient().from("campaign_draft").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspace.id);
  } catch (e) { return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Could not approve")}`); }
  revalidatePath("/builder");
  back(`draft=${id}`);
}

export async function deleteDraft(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  try {
    const { workspace } = await requireWriter();
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Unknown draft");
    await createAdminClient().from("campaign_draft").delete().eq("id", id).eq("workspace_id", workspace.id);
  } catch (e) { return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete")}`); }
  revalidatePath("/builder");
  back("notice=Draft+deleted");
}
