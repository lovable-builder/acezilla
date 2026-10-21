"use server";
import { createHash } from "node:crypto";
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
