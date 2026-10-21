"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { newPairingCode } from "@acezilla/connectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

export type CodeState = { code?: string; error?: string; at?: number };

/** Creates a one-time pairing code (valid 15 minutes) for the store owner to paste into the plugin. Only its hash is kept. */
export async function createWooCode(_prev: CodeState, _form: FormData): Promise<CodeState> {
  try {
    const { workspace, user } = await requireWriter();
    const admin = createAdminClient();
    await admin.from("connect_nonce").delete().eq("workspace_id", workspace.id).eq("platform", "woocommerce");
    const code = newPairingCode();
    const { error } = await admin.from("connect_nonce").insert({ token_hash: createHash("sha256").update(code).digest("hex"), workspace_id: workspace.id, platform: "woocommerce", store_url: "pending", created_by: user.id });
    if (error) throw new Error("Could not create a code. Please try again.");
    return { code, at: Date.now() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create a code" };
  }
}

/** Makes the workspace use the store's currency, so revenue and ad spend are compared in the same unit. */
export async function setWorkspaceCurrency(formData: FormData) {
  let qs: string;
  try {
    const code = String(formData.get("currency") ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new Error("Not a valid currency code");
    try { new Intl.NumberFormat("en-US", { style: "currency", currency: code }); } catch { throw new Error(`${code} is not a currency we can display`); }
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { error } = await admin.from("workspace").update({ currency: code }).eq("id", workspace.id);
    if (error) throw new Error(error.message);
    await admin.from("connection").update({ last_error: null }).eq("workspace_id", workspace.id).eq("platform", "woocommerce").like("last_error", "Your store sells in%");
    qs = `notice=${encodeURIComponent(`Workspace currency is now ${code}.`)}`;
  } catch (e) {
    qs = `error=${encodeURIComponent(e instanceof Error ? e.message : "Could not change the currency")}`;
  }
  revalidatePath("/", "layout");
  redirect(`/connections/woocommerce?${qs}`);
}
