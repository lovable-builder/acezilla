"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertSafeUrl, UnsafeUrlError } from "@acezilla/seo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAudit, LIMITS, runAudit } from "@/lib/seo-runner";
import { requireWriter } from "@/lib/workspace";

const back = (qs: string) => redirect(`/seo?${qs}`);

/** "example.com", "https://example.com/page" and "www.example.com/" all become a clean origin. */
function normalizeSiteUrl(input: string): string {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) throw new UnsafeUrlError("Enter a website address like example.com");
  const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  return u.origin;
}

async function startAudit(siteId: string, workspaceId: string, trigger: "manual" | "weekly" = "manual") {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("seo_audit").select("*", { count: "exact", head: true }).eq("site_id", siteId).eq("trigger", "manual").gte("created_at", since);
  if ((count ?? 0) >= LIMITS.auditsPerSitePerDay) throw new Error(`You can run ${LIMITS.auditsPerSitePerDay} audits per site per day. Try again tomorrow.`);
  const { data: running } = await admin.from("seo_audit").select("id").eq("site_id", siteId).in("status", ["queued", "running"]).limit(1);
  if (running?.length) return running[0]!.id as string;          // already in progress: do not start a second one
  const auditId = await createAudit(admin, siteId, workspaceId, trigger);
  after(() => runAudit(admin, auditId));                          // runs after the response, within this route's maxDuration
  return auditId;
}

export async function addSite(formData: FormData) {
  let siteId: string;
  try {
    const { workspace } = await requireWriter();
    const origin = normalizeSiteUrl(String(formData.get("url") ?? ""));
    const u = await assertSafeUrl(origin);                        // refuses private, internal and non-web addresses before anything is stored
    const admin = createAdminClient();
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const { data: existing } = await admin.from("seo_site").select("id").eq("workspace_id", workspace.id).eq("host", host).maybeSingle();
    if (existing) siteId = existing.id as string;
    else {
      const { count } = await admin.from("seo_site").select("*", { count: "exact", head: true }).eq("workspace_id", workspace.id);
      if ((count ?? 0) >= LIMITS.sites) throw new Error(`You can add up to ${LIMITS.sites} websites for now.`);
      const { data, error } = await admin.from("seo_site").insert({ workspace_id: workspace.id, url: origin, host, name: host }).select("id").single();
      if (error) throw new Error(error.message);
      siteId = data.id as string;
    }
    await startAudit(siteId, workspace.id);
  } catch (e) {
    const msg = e instanceof TypeError ? "That doesn't look like a website address." : e instanceof Error ? e.message : "Could not add the website";
    return back(`error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/seo");
  redirect(`/seo/${siteId}`);
}

export async function rerunAudit(formData: FormData) {
  const siteId = String(formData.get("siteId"));
  try {
    const { supabase, workspace } = await requireWriter();
    const { data: site } = await supabase.from("seo_site").select("id").eq("id", siteId).eq("workspace_id", workspace.id).maybeSingle();   // RLS also enforces membership
    if (!site) throw new Error("Website not found");
    await startAudit(siteId, workspace.id);
  } catch (e) {
    return redirect(`/seo/${siteId}?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not start the audit")}`);
  }
  revalidatePath(`/seo/${siteId}`);
  redirect(`/seo/${siteId}`);
}

export async function setMonitoring(formData: FormData) {
  const siteId = String(formData.get("siteId"));
  const { supabase, workspace } = await requireWriter();
  const { data: site } = await supabase.from("seo_site").select("id").eq("id", siteId).eq("workspace_id", workspace.id).maybeSingle();
  if (site) await createAdminClient().from("seo_site").update({ monitoring: formData.get("monitoring") === "on" }).eq("id", siteId);
  revalidatePath(`/seo/${siteId}`);
}

export async function deleteSite(formData: FormData) {
  const siteId = String(formData.get("siteId"));
  if (formData.get("confirm") !== "yes") return redirect(`/seo/${siteId}?error=${encodeURIComponent("Tick the box to confirm")}`);
  const { supabase, workspace } = await requireWriter();
  const { data: site } = await supabase.from("seo_site").select("id").eq("id", siteId).eq("workspace_id", workspace.id).maybeSingle();
  if (site) await createAdminClient().from("seo_site").delete().eq("id", siteId);         // audits, pages, findings and fixes cascade
  revalidatePath("/seo");
  redirect("/seo?notice=Website+removed+with+all+its+audits");
}

/** Mark a drafted fix as done or dismissed. Uses the user's own session, so row-level security decides. */
export async function setFixStatus(formData: FormData) {
  const id = String(formData.get("fixId")), status = String(formData.get("status")), siteId = String(formData.get("siteId"));
  if (!["pending", "done", "dismissed"].includes(status)) return;
  const { supabase } = await requireWriter();
  await supabase.from("seo_fix").update({ status }).eq("id", id);
  revalidatePath(`/seo/${siteId}`);
}
