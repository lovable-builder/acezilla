"use server";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { normalizeStoreUrl, wooAuthUrl } from "@acezilla/connectors";
import { assertSafeUrl, UnsafeUrlError } from "@acezilla/seo";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE } from "@/lib/legal";
import { requireWriter } from "@/lib/workspace";

const hashNonce = (n: string) => createHash("sha256").update(n).digest("hex");

/** Step 1: check the address, remember a one-time token for this workspace, then send the owner to their own store's approval screen. */
export async function startWooConnect(formData: FormData) {
  let target: string;
  try {
    const { workspace, user } = await requireWriter();
    const storeUrl = normalizeStoreUrl(String(formData.get("store") ?? ""));
    try { await assertSafeUrl(storeUrl); } catch (e) { throw new Error(e instanceof UnsafeUrlError ? e.message : "That address cannot be used"); }
    const nonce = randomBytes(32).toString("hex");
    const admin = createAdminClient();
    await admin.from("connect_nonce").delete().eq("workspace_id", workspace.id).lt("created_at", new Date(Date.now() - 3600_000).toISOString());
    const { error } = await admin.from("connect_nonce").insert({ token_hash: hashNonce(nonce), workspace_id: workspace.id, platform: "woocommerce", store_url: storeUrl, created_by: user.id });
    if (error) throw new Error("Could not start the connection. Please try again.");
    target = wooAuthUrl({
      storeUrl, appName: "acezilla", userId: nonce,
      returnUrl: `${SITE}/connections?notice=${encodeURIComponent("Approved in WooCommerce. Your orders are importing now; refresh in a minute.")}`,
      callbackUrl: `${SITE}/api/connect/woocommerce/callback`,
    });
  } catch (e) {
    redirect(`/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not connect")}`);
  }
  redirect(target);
}
