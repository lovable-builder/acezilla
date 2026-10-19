import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface Workspace { id: string; name: string; currency: string }
export const WS_COOKIE = "az_ws";

/** Workspaces visible to the signed-in user (RLS does the filtering) and the active one. */
export async function getWorkspaceContext() {
  const supabase = await createClient();
  const { data } = await supabase.from("workspace").select("id,name,currency").order("created_at");
  const workspaces = (data ?? []) as Workspace[];
  const saved = (await cookies()).get(WS_COOKIE)?.value;
  const current = workspaces.find((w) => w.id === saved) ?? workspaces[0] ?? null;
  return { supabase, workspaces, current };
}

export async function getLastSync(workspaceId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("connection").select("last_sync_at").eq("workspace_id", workspaceId)
    .not("last_sync_at", "is", null).order("last_sync_at", { ascending: false }).limit(1);
  return (data?.[0]?.last_sync_at as string | undefined) ?? null;
}

/** Signed-in user who may change data in the active workspace (owner/admin/buyer). Throws otherwise. */
export async function requireWriter() {
  const { supabase, current } = await getWorkspaceContext();
  if (!current) throw new Error("No workspace");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data: ws } = await supabase.from("workspace").select("org_id").eq("id", current.id).single();
  const { data: m } = await supabase.from("org_member").select("role").eq("org_id", ws?.org_id).eq("user_id", auth.user.id).maybeSingle();
  if (!m || !["owner", "admin", "buyer"].includes(m.role as string)) throw new Error("You don't have permission to connect accounts");
  return { supabase, workspace: current, user: auth.user };
}
