"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { listMerchantAccounts, registerMerchantDeveloper } from "@acezilla/connectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { merchantAccessToken, pullMerchant } from "@/lib/merchant";
import { requireWriter } from "@/lib/workspace";

const fail = (m: string) => redirect(`/connections/merchant?error=${encodeURIComponent(m)}`);
const RANGES = [90, 365];

/** Saves the chosen accounts, then reads their products and traffic. Read-only: only account lists and report searches are called. */
export async function saveAndSyncMerchant(formData: FormData) {
  const ids = formData.getAll("account").map(String);
  const asked = Number(formData.get("range"));
  const days = RANGES.includes(asked) ? asked : 90;
  if (ids.length === 0) return fail("Pick at least one Merchant Center account");
  let result: string;
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { data: conn } = await admin.from("connection").select("id,workspace_id,token_enc").eq("workspace_id", workspace.id).eq("platform", "merchant").maybeSingle();
    if (!conn?.token_enc) return fail("Google Merchant Center is not connected");
    const accessToken = await merchantAccessToken(conn.token_enc as string);
    const chosen = (await listMerchantAccounts({ accessToken })).filter((a) => ids.includes(a.id));
    if (chosen.length === 0) return fail("Those accounts are no longer available");
    const { error } = await admin.from("merchant_account").upsert(
      chosen.map((a) => ({ workspace_id: workspace.id, connection_id: conn.id, external_id: a.id, name: a.name })), { onConflict: "workspace_id,external_id" });
    if (error) return fail(error.message);
    // Unticked accounts stop syncing and their imported data goes with them.
    const { count: removed } = await admin.from("merchant_account").delete({ count: "exact" })
      .eq("connection_id", conn.id).not("external_id", "in", `(${chosen.map((a) => `"${a.id}"`).join(",")})`);
    const r = await pullMerchant(admin, conn as { id: string; workspace_id: string }, accessToken, days);
    await admin.from("connection").update({ status: "active", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", conn.id);
    result = `Read ${r.products} products and ${r.rows} days of Shopping traffic from ${r.accounts} Merchant Center ${r.accounts === 1 ? "account" : "accounts"}${removed ? `. Removed ${removed} unselected.` : ""}`;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Merchant Center sync failed");
  }
  revalidatePath("/", "layout");
  redirect(`/connections?notice=${encodeURIComponent(result)}`);
}

/**
 * The one-time developer registration Google requires before the Merchant API answers. Runs only when a person presses the button.
 * It links acezilla's Google Cloud project to the Merchant Center account and names a developer contact. It changes no products or feeds.
 */
export async function registerDeveloper(formData: FormData) {
  const accountId = String(formData.get("account_id") ?? "").replace(/\s+/g, "");
  const email = String(formData.get("email") ?? "").trim();
  if (!/^\d+$/.test(accountId)) return fail("Enter the Merchant Center account ID. It is a number, shown at the top right of Merchant Center.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter an email address for the developer contact");
  let notice: string;
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { data: conn } = await admin.from("connection").select("token_enc").eq("workspace_id", workspace.id).eq("platform", "merchant").maybeSingle();
    if (!conn?.token_enc) return fail("Google Merchant Center is not connected");
    await registerMerchantDeveloper({ accessToken: await merchantAccessToken(conn.token_enc as string) }, accountId, email);
    notice = `Registered. Google needs up to 5 minutes. If ${email} is not already a Merchant Center user, accept the invitation Google emailed to it (valid for 14 days), then reload this page.`;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Registration failed");
  }
  redirect(`/connections/merchant?notice=${encodeURIComponent(notice)}`);
}
