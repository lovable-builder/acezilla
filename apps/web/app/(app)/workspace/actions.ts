"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext, WS_COOKIE } from "@/lib/workspace";

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
const fail = (e: unknown) => back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong")}`);

/** Renames the active workspace and sets its currency. */
export async function updateWorkspace(formData: FormData) {
  let notice: string;
  try {
    const { workspace } = await requireOrgAdmin();
    const name = cleanName(formData.get("name")), currency = cleanCurrency(formData.get("currency"));
    const { error } = await createAdminClient().from("workspace").update({ name, currency }).eq("id", workspace.id);
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
