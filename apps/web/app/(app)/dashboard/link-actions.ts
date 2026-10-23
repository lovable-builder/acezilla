"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Links an ad campaign to the product it sells, or removes the link. Only changes acezilla's own data, never the ad account. */
export async function linkCampaignProduct(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "");
  const choice = String(formData.get("product") ?? "");
  try {
    const { workspace } = await requireWriter();
    if (!UUID.test(campaignId)) throw new Error("Unknown campaign");
    const admin = createAdminClient();
    const { data: c } = await admin.from("campaign").select("id").eq("id", campaignId).eq("workspace_id", workspace.id).maybeSingle();
    if (!c) throw new Error("Unknown campaign");
    if (choice === "") {
      await admin.from("campaign_product").delete().eq("workspace_id", workspace.id).eq("campaign_id", campaignId);
    } else {
      const [channel, ...rest] = choice.split("|");
      const productId = rest.join("|");
      if (!["woocommerce", "allegro"].includes(channel ?? "") || !/^[A-Za-z0-9_-]{1,40}$/.test(productId)) throw new Error("Unknown product");
      const { error } = await admin.from("campaign_product").upsert({ workspace_id: workspace.id, campaign_id: campaignId, product_channel: channel, product_id: productId }, { onConflict: "workspace_id,campaign_id" });
      if (error) throw new Error(error.message);
    }
  } catch (e) { console.warn("[link]", e instanceof Error ? e.message : e); }
  revalidatePath("/dashboard");
  revalidatePath("/products");
}
