"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeAtPlatform, syncConnection, type ConnRow } from "@/lib/sync";
import { requireWriter } from "@/lib/workspace";

const PLATFORMS = ["meta", "google", "tiktok", "ga4", "merchant", "searchconsole", "woocommerce", "allegro"];
const LABEL: Record<string, string> = { meta: "Meta", tiktok: "TikTok Ads", google: "Google Ads", ga4: "Google Analytics", merchant: "Google Merchant Center", searchconsole: "Google Search Console", woocommerce: "WooCommerce", allegro: "Allegro" };
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
    qs = r.ok ? `notice=${encodeURIComponent(conn.platform === "searchconsole" ? `Read ${r.rows} search words from ${LABEL[conn.platform]}` : `Synced ${r.rows} daily rows from ${LABEL[conn.platform]}`)}` : `error=${encodeURIComponent(r.error)}`;
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
    // Google Ads, Analytics, Search Console and Merchant Center can share one Google grant. Revoking it for one would log the others out,
    // so while another Google connection is still in use the grant is left in place (it can be removed in the person's Google account).
    const GOOGLE = ["google", "ga4", "merchant", "searchconsole"];
    let keptGoogleGrant = false;
    if (GOOGLE.includes(conn.platform)) {
      const { count } = await admin.from("connection").select("id", { count: "exact", head: true }).eq("workspace_id", conn.workspace_id).in("platform", GOOGLE).neq("id", conn.id);
      keptGoogleGrant = (count ?? 0) > 0;
    }
    if (!keptGoogleGrant) await revokeAtPlatform(conn.platform, conn.token_enc);
    if (conn.platform === "woocommerce") {
      const { error: eo } = await admin.from("order").delete().eq("workspace_id", conn.workspace_id).like("external_id", "woo:%");
      if (eo) throw new Error(eo.message);
      await admin.from("order_line").delete().eq("workspace_id", conn.workspace_id).eq("platform", "woocommerce");
      await admin.from("store_product").delete().eq("workspace_id", conn.workspace_id).eq("platform", "woocommerce");
    }
    if (conn.platform === "allegro") {
      const { error: eo } = await admin.from("order").delete().eq("workspace_id", conn.workspace_id).like("external_id", "allegro:%");
      if (eo) throw new Error(eo.message);
      for (const t of ["offer_stats_snapshots", "order_line", "marketplace_fee"]) await admin.from(t).delete().eq("workspace_id", conn.workspace_id).eq("platform", "allegro");
    }
    // ad_account -> campaign -> ad_group -> ad -> insight_daily all cascade.
    const { error: e1 } = await admin.from("ad_account").delete().eq("connection_id", conn.id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await admin.from("connection").delete().eq("id", conn.id);
    if (e2) throw new Error(e2.message);
    qs = `notice=${encodeURIComponent(`${LABEL[conn.platform]} disconnected. The stored login and imported data were deleted.${keptGoogleGrant ? " Google access was kept for your other Google connections; to remove it fully, use myaccount.google.com/permissions." : ""}${conn.platform === "woocommerce" ? " You can also deactivate the acezilla plugin in WordPress." : conn.platform === "allegro" ? " You can also remove acezilla under the connected apps in your Allegro account settings." : ""}`)}`;
  } catch (e) {
    qs = `error=${encodeURIComponent(e instanceof Error ? e.message : "Could not disconnect")}`;
  }
  revalidatePath("/", "layout");
  go(qs);
}
