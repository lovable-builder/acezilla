import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface Workspace { id: string; name: string; currency: string }
export const WS_COOKIE = "az_ws";

/** Workspaces visible to the signed-in user (RLS does the filtering) and the active one. Cached per request so the layout and page share one set of queries. */
export const getWorkspaceContext = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("workspace").select("id,name,currency").order("created_at");
  const workspaces = (data ?? []) as Workspace[];
  const saved = (await cookies()).get(WS_COOKIE)?.value;
  const current = workspaces.find((w) => w.id === saved) ?? workspaces[0] ?? null;
  return { supabase, workspaces, current };
});

/**
 * The line in the sidebar. One fresh source must not hide a stale one, so it counts sources that are out of date.
 * WooCommerce is left out of the count: it reports when an order happens, so a quiet store is not a broken one.
 */
export async function getSyncLabel(workspaceId: string, ago: (iso: string) => string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("connection").select("platform,last_sync_at,status").eq("workspace_id", workspaceId);
  const pulled = (data ?? []).filter((c) => c.platform !== "woocommerce");
  const times = pulled.map((c) => c.last_sync_at as string | null).filter((t): t is string => !!t);
  if (!times.length) return "No data synced";
  const limit = Date.now() - 36 * 3600000;
  const old = pulled.filter((c) => c.status === "needs_reauth" || c.status === "error" || !c.last_sync_at || new Date(c.last_sync_at as string).getTime() < limit).length;
  return old > 0 ? `${old} of ${pulled.length} sources need attention` : `Synced ${ago(times.sort().at(-1)!)}`;
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
