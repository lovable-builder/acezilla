"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeAtPlatform, syncConnection, type ConnRow } from "@/lib/sync";
import { requireWriter } from "@/lib/workspace";

const PLATFORMS = ["meta", "google"];
const go = (qs: string) => redirect(`/connections?${qs}`);

async function load(platform: string) {
  if (!PLATFORMS.includes(platform)) throw new Error("Unknown platform");
  const { workspace } = await requireWriter();
  const admin = createAdminClient();
  const { data } = await admin.from("connection").select("id,workspace_id,platform,token_enc").eq("workspace_id", workspace.id).eq("platform", platform).maybeSingle();
  if (!data) throw new Error("Not connected");
  return { admin, conn: data as ConnRow };
}

/** Pulls the last ~5 weeks again for the accounts already selected. */
export async function syncNow(formData: FormData) {
  let qs: string;
  try {
    const { admin, conn } = await load(String(formData.get("platform")));
    const r = await syncConnection(admin, conn);
    qs = r.ok ? `notice=${encodeURIComponent(`Synced ${r.rows} daily rows from ${conn.platform === "meta" ? "Meta" : "Google Ads"}`)}` : `error=${encodeURIComponent(r.error)}`;
  } catch (e) {
    qs = `error=${encodeURIComponent(e instanceof Error ? e.message : "Sync failed")}`;
  }
  revalidatePath("/", "layout");
  go(qs);
}

/** Removes the stored login and every account and metric imported through it. Requires the confirm box. */
export async function disconnect(formData: FormData) {
  let qs: string;
  try {
    if (formData.get("confirm") !== "yes") throw new Error("Tick the box to confirm");
    const { admin, conn } = await load(String(formData.get("platform")));
    await revokeAtPlatform(conn.platform, conn.token_enc);
    // ad_account -> campaign -> ad_group -> ad -> insight_daily all cascade.
    const { error: e1 } = await admin.from("ad_account").delete().eq("connection_id", conn.id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await admin.from("connection").delete().eq("id", conn.id);
    if (e2) throw new Error(e2.message);
    qs = `notice=${encodeURIComponent(`${conn.platform === "meta" ? "Meta" : "Google Ads"} disconnected. The stored login and imported data were deleted.`)}`;
  } catch (e) {
    qs = `error=${encodeURIComponent(e instanceof Error ? e.message : "Could not disconnect")}`;
  }
  revalidatePath("/", "layout");
  go(qs);
}
