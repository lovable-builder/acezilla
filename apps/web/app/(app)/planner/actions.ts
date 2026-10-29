"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

const PLATFORMS = ["meta", "google", "tiktok"];
const back = (qs = "") => redirect(`/planner${qs}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A planned flight is only a plan inside acezilla. Nothing is created in any ad platform. */
export async function addFlight(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const startsOn = String(formData.get("starts_on") ?? ""), endsOn = String(formData.get("ends_on") ?? "");
  const budget = Number(formData.get("budget"));
  const platforms = formData.getAll("platform").map(String).filter((p) => PLATFORMS.includes(p));
  if (!name) return back("?error=Give+the+flight+a+name");
  if (!DATE.test(startsOn) || !DATE.test(endsOn) || endsOn < startsOn) return back("?error=Pick+a+start+date+and+an+end+date+after+it");
  if (!(budget >= 0) || !Number.isFinite(budget)) return back("?error=Enter+the+flight+budget");
  if (platforms.length === 0) return back("?error=Pick+at+least+one+platform");
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { data: plan } = await admin.from("plan").select("id").eq("workspace_id", workspace.id).order("created_at").limit(1).maybeSingle();
    let planId = plan?.id as string | undefined;
    if (!planId) {
      const { data, error } = await admin.from("plan").insert({ workspace_id: workspace.id, name: "Plan" }).select("id").single();
      if (error) throw new Error(error.message);
      planId = data.id as string;
    }
    const { error } = await admin.from("flight").insert({ plan_id: planId, workspace_id: workspace.id, name, starts_on: startsOn, ends_on: endsOn, platforms, budget });
    if (error) throw new Error(error.message);
  } catch (e) {
    return back(`?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not save the flight")}`);
  }
  revalidatePath("/planner");
  back();
}

export async function deleteFlight(formData: FormData) {
  try {
    const { workspace } = await requireWriter();
    const { error } = await createAdminClient().from("flight").delete().eq("id", String(formData.get("id"))).eq("workspace_id", workspace.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    return back(`?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete the flight")}`);
  }
  revalidatePath("/planner");
  back();
}
