import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A store or marketplace sells in `storeCurrency`; the workspace shows money in its own currency and does not convert.
 * If no other ad account exists yet there is nothing to mismatch, so the workspace adopts the store's currency.
 * Otherwise returns a warning to show the owner.
 */
export async function alignCurrency(admin: Admin, workspaceId: string, storeCurrency: string | null, exceptConnectionId?: string): Promise<string | null> {
  if (!storeCurrency) return null;
  const store = storeCurrency.toUpperCase();
  const { data: w } = await admin.from("workspace").select("currency").eq("id", workspaceId).single();
  const wsCur = (w?.currency as string | undefined)?.toUpperCase();
  if (!wsCur || wsCur === store) return null;
  let q = admin.from("ad_account").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (exceptConnectionId) q = q.neq("connection_id", exceptConnectionId);
  const { count } = await q;
  if (!count) { await admin.from("workspace").update({ currency: store }).eq("id", workspaceId); return null; }
  return `Your store sells in ${store} but this workspace uses ${wsCur}. Revenue is not converted, so ROAS would be off.`;
}
