"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext, WS_COOKIE } from "@/lib/workspace";
import { revokeAtPlatform } from "@/lib/sync";

const MAX_WORKSPACES_PER_ORG = 10;
const back = (qs: string) => redirect(`/workspace?${qs}`);

/** Owners and admins of the active workspace's organization. Throws otherwise. */
async function requireOrgAdmin() {
  const { supabase, current } = await getWorkspaceContext();
  if (!current) throw new Error("No workspace");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data: ws } = await supabase.from("workspace").select("org_id").eq("id", current.id).single();
  const { data: m } = await supabase.from("org_member").select("role").eq("org_id", ws?.org_id).eq("user_id", auth.user.id).maybeSingle();
  if (!m || !["owner", "admin"].includes(m.role as string)) throw new Error("Only owners and admins can change workspaces");
  return { workspace: current, orgId: ws!.org_id as string };
}

const cleanName = (v: FormDataEntryValue | null) => {
  const n = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 60) throw new Error("Use a name between 2 and 60 characters");
  return n;
};
const cleanCurrency = (v: FormDataEntryValue | null) => {
  const c = String(v ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new Error("Choose a currency");
  try { new Intl.NumberFormat("en-US", { style: "currency", currency: c }); } catch { throw new Error(`${c} is not a currency we can display`); }
  return c;
};
const cleanCountry = (v: FormDataEntryValue | null) => {
  const c = String(v ?? "PL").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) throw new Error("Choose a country");
  return c;
};
const fail = (e: unknown) => back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong")}`);

/** Renames the active workspace and sets its currency. */
export async function updateWorkspace(formData: FormData) {
  let notice: string;
  try {
    const { workspace } = await requireOrgAdmin();
    const name = cleanName(formData.get("name")), currency = cleanCurrency(formData.get("currency")), country = cleanCountry(formData.get("country"));
    const { error } = await createAdminClient().from("workspace").update({ name, currency, country }).eq("id", workspace.id);
    if (error) throw new Error(error.message);
    notice = "Saved.";
  } catch (e) { return fail(e); }
  revalidatePath("/", "layout");
  back(`notice=${encodeURIComponent(notice)}`);
}

/** Creates another workspace in the same organization (a second store or a client) and switches to it. */
export async function createWorkspace(formData: FormData) {
  let id: string;
  try {
    const { orgId } = await requireOrgAdmin();
    const name = cleanName(formData.get("name")), currency = cleanCurrency(formData.get("currency"));
    const admin = createAdminClient();
    const { count } = await admin.from("workspace").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if ((count ?? 0) >= MAX_WORKSPACES_PER_ORG) throw new Error(`You can have up to ${MAX_WORKSPACES_PER_ORG} workspaces`);
    const { data, error } = await admin.from("workspace").insert({ org_id: orgId, name, currency }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Could not create the workspace");
    id = data.id as string;
  } catch (e) { return fail(e); }
  (await cookies()).set(WS_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
  revalidatePath("/", "layout");
  redirect("/connections?notice=" + encodeURIComponent("New workspace created. Connect its accounts below."));
}

const FAMILY: Record<string, string> = { meta: "meta", google: "google", ga4: "google", merchant: "google", searchconsole: "google", allegro: "allegro" };

/** Removes every file stored for a workspace, however deep the folders go. */
async function removeFiles(admin: ReturnType<typeof createAdminClient>, prefix: string, depth = 0): Promise<void> {
  const { data } = await admin.storage.from("creatives").list(prefix, { limit: 1000 });
  const files: string[] = [];
  for (const f of data ?? []) {
    if (f.id) files.push(`${prefix}/${f.name}`);
    else if (depth < 4) await removeFiles(admin, `${prefix}/${f.name}`, depth + 1);
  }
  if (files.length) await admin.storage.from("creatives").remove(files);
}

/**
 * Permanently deletes the active workspace and everything in it: connections, imported data, plans, competitor notes and files.
 * It asks the platforms to revoke access only when no other workspace in the organization uses the same login family, because
 * revoking a shared Google or Meta login would sign the other workspaces out. The last workspace can never be deleted.
 */
export async function deleteWorkspace(formData: FormData) {
  let notice: string;
  try {
    const { workspace, orgId } = await requireOrgAdmin();
    const typed = String(formData.get("confirm_name") ?? "").trim().toLowerCase();
    if (typed !== workspace.name.trim().toLowerCase()) throw new Error("Type the workspace name exactly to confirm.");
    const admin = createAdminClient();
    const { data: siblings } = await admin.from("workspace").select("id").eq("org_id", orgId);
    const others = (siblings ?? []).map((w) => w.id as string).filter((id) => id !== workspace.id);
    if (others.length === 0) throw new Error("This is your only workspace. Create another one first, then delete this one.");

    const { data: mine } = await admin.from("connection").select("platform,token_enc").eq("workspace_id", workspace.id);
    const { data: theirs } = await admin.from("connection").select("platform").in("workspace_id", others);
    const stillUsed = new Set((theirs ?? []).map((c) => FAMILY[c.platform as string]).filter(Boolean));
    for (const c of mine ?? []) {
      const fam = FAMILY[c.platform as string];
      if (fam && !stillUsed.has(fam)) await revokeAtPlatform(c.platform as string, c.token_enc as string | null);
    }
    await removeFiles(admin, workspace.id).catch(() => undefined);
    await admin.from("order").delete().eq("workspace_id", workspace.id);
    const { error } = await admin.from("workspace").delete().eq("id", workspace.id);
    if (error) throw new Error(error.message);
    (await cookies()).set(WS_COOKIE, others[0]!, { path: "/", httpOnly: true, sameSite: "lax" });
    notice = `Deleted "${workspace.name}" and everything in it.`;
  } catch (e) { return fail(e); }
  revalidatePath("/", "layout");
  back(`notice=${encodeURIComponent(notice)}`);
}
