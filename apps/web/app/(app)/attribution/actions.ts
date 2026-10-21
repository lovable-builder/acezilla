"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

/** Only the period parameters survive a round trip, so a form cannot send the user somewhere else. */
const safeQs = (v: FormDataEntryValue | null) => {
  const q = String(v ?? "");
  return /^(days=\d{1,3}|from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2})$/.test(q) ? q : "days=30";
};
const back = (qs: string, msg?: { notice?: string; error?: string }) => {
  revalidatePath("/attribution");
  redirect(`/attribution?${qs}${msg?.notice ? `&notice=${encodeURIComponent(msg.notice)}` : ""}${msg?.error ? `&error=${encodeURIComponent(msg.error)}` : ""}#offers`);
};

/** The seller's net cost of one unit of an offer's goods. An empty box removes it. */
export async function saveOfferCost(formData: FormData) {
  const qs = safeQs(formData.get("qs"));
  try {
    const { workspace } = await requireWriter();
    const offerId = String(formData.get("offerId") ?? "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(offerId)) throw new Error("Unknown offer");
    const raw = String(formData.get("unitCost") ?? "").trim().replace(",", ".");
    const admin = createAdminClient();
    if (raw === "") {
      await admin.from("offer_cost").delete().eq("workspace_id", workspace.id).eq("platform", "allegro").eq("offer_id", offerId);
    } else {
      const cost = Number(raw);
      if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000) throw new Error("Enter a cost of 0 or more");
      const { error } = await admin.from("offer_cost").upsert({ workspace_id: workspace.id, platform: "allegro", offer_id: offerId, unit_cost: cost, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,platform,offer_id" });
      if (error) throw new Error(error.message);
    }
  } catch (e) { return back(qs, { error: e instanceof Error ? e.message : "Could not save" }); }
  back(qs);
}

/** Sets whether Allegro amounts are treated as including VAT, and at what rate. */
export async function saveVatRate(formData: FormData) {
  const qs = safeQs(formData.get("qs"));
  try {
    const { workspace } = await requireWriter();
    const rate = Number(formData.get("vat"));
    if (![0, 0.05, 0.08, 0.23].includes(rate)) throw new Error("Choose one of the listed VAT rates");
    const { error } = await createAdminClient().from("marketplace_setting").upsert({ workspace_id: workspace.id, vat_rate: rate, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
    if (error) throw new Error(error.message);
  } catch (e) { return back(qs, { error: e instanceof Error ? e.message : "Could not save" }); }
  back(qs, { notice: "VAT setting saved." });
}
