"use server";
import { revalidatePath } from "next/cache";
import { GOALS, NODES, STAGES } from "@acezilla/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

type Result = { ok: true } | { ok: false; error: string };
const NODE_IDS = new Set(NODES.map((n) => n.id as string));
const STEP = /^(b:[a-z_]+:\d{1,2}|w:\d{4}-W\d{2}:[a-z]{1,20})$/;
/** A member who can only view gets a plain message, not the one meant for connecting accounts. */
const friendly = (e: unknown, fallback: string) => (e instanceof Error ? (/permission/i.test(e.message) ? "You have view-only access, so this change is not saved." : e.message) : fallback);
const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(n)));

export interface PlanInput { goal: string; stage: string; margin: number | null; cushion: number; aov: number | null; budget: number; nodes: string[]; shares: Record<string, number> }

/** The plan is only notes and numbers inside acezilla. Nothing is created or changed in any ad platform. */
export async function savePlan(input: PlanInput): Promise<Result> {
  try {
    const { workspace } = await requireWriter();
    const goal = GOALS.some((g) => g.id === input.goal) ? input.goal : "sales";
    const stage = STAGES.some((s) => s.id === input.stage) ? input.stage : "growing";
    const margin = input.margin === null ? null : clamp(input.margin, 0.01, 0.95);
    const nodes = [...new Set(input.nodes)].filter((n) => NODE_IDS.has(n));
    const shares: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.shares ?? {})) if (NODE_IDS.has(k) && Number.isFinite(Number(v))) shares[k] = Math.round(clamp(v, 0, 100));
    const { error } = await createAdminClient().from("strategy_plan").upsert({
      workspace_id: workspace.id, goal, stage, margin, cushion: clamp(input.cushion, 0, 1), aov: input.aov && input.aov > 0 ? clamp(input.aov, 0.01, 1e7) : null,
      budget: clamp(input.budget || 0, 0, 1e9), nodes, shares, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) { return { ok: false, error: friendly(e, "Could not save the plan") }; }
}

/** Ticks a build step or a weekly task on or off. */
export async function setStep(key: string, done: boolean): Promise<Result> {
  try {
    if (!STEP.test(key)) throw new Error("Unknown step");
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { error } = done
      ? await admin.from("strategy_step").upsert({ workspace_id: workspace.id, key, done_at: new Date().toISOString() })
      : await admin.from("strategy_step").delete().eq("workspace_id", workspace.id).eq("key", key);
    if (error) throw new Error(error.message);
    revalidatePath("/strategy");
    return { ok: true };
  } catch (e) { return { ok: false, error: friendly(e, "Could not save") }; }
}
