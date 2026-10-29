"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { listGa4Properties } from "@acezilla/connectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { ga4AccessToken, pullGa4 } from "@/lib/ga4";
import { requireWriter } from "@/lib/workspace";

const fail = (m: string) => redirect(`/connections/ga4?error=${encodeURIComponent(m)}`);
const RANGES = [90, 365, 730];

/** Saves the chosen properties, then pulls the chosen history. Read-only: only Analytics report calls are used. */
export async function saveAndSyncGa4(formData: FormData) {
  const ids = formData.getAll("property").map(String);
  const asked = Number(formData.get("range"));
  const days = RANGES.includes(asked) ? asked : 365;
  if (ids.length === 0) return fail("Pick at least one property");
  let result: string;
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { data: conn } = await admin.from("connection").select("id,workspace_id,token_enc").eq("workspace_id", workspace.id).eq("platform", "ga4").maybeSingle();
    if (!conn?.token_enc) return fail("Google Analytics is not connected");
    const accessToken = await ga4AccessToken(admin, conn.token_enc as string);
    const chosen = (await listGa4Properties({ accessToken })).filter((p) => ids.includes(p.id));
    if (chosen.length === 0) return fail("Those properties are no longer available");
    const { error } = await admin.from("analytics_property").upsert(
      chosen.map((p) => ({ workspace_id: workspace.id, connection_id: conn.id, external_id: p.id, name: p.name })), { onConflict: "workspace_id,external_id" });
    if (error) return fail(error.message);
    // Unticked properties stop syncing and their imported data goes with them.
    const { count: removed } = await admin.from("analytics_property").delete({ count: "exact" })
      .eq("connection_id", conn.id).not("external_id", "in", `(${chosen.map((p) => `"${p.id}"`).join(",")})`);
    const r = await pullGa4(admin, conn as { id: string; workspace_id: string }, accessToken, days);
    await admin.from("connection").update({ status: "active", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", conn.id);
    result = `Synced ${r.rows} daily traffic rows from ${r.properties} Google Analytics ${r.properties === 1 ? "property" : "properties"}${removed ? `. Removed ${removed} unselected.` : ""}`;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Google Analytics sync failed");
  }
  revalidatePath("/", "layout");
  redirect(`/connections?notice=${encodeURIComponent(result)}`);
}
