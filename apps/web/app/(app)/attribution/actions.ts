"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext, requireWriter } from "@/lib/workspace";
import { AI_LIMITS, friendlyAiError, takeAiQuota } from "@/lib/ai-guard";
import { getLlm } from "@/lib/llm";
import { loadOfferProfit } from "@/lib/data";
import { parsePeriod, todayIso, windowStart } from "@/lib/period";
import { buildPricingModel, buildPricingPrompt, parsePricingResponse, PRICING_MAX_TOKENS, PRICING_SCHEMA, PRICING_SYSTEM, pricingScenarios, type PricingAdvice, type PricingScenarios } from "@acezilla/models";
import type { JsonSchema } from "@acezilla/llm";
import { isXlsx, MAX_REPORT_BYTES, parseAdsReport, xlsxToTsv } from "@acezilla/connectors";

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

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Reads an uploaded export: an Excel workbook (.xlsx) or text as UTF-8, falling back to Windows-1250 (what Polish spreadsheet exports often use). */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  if (isXlsx(new Uint8Array(buf))) return xlsxToTsv(new Uint8Array(buf));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1250").decode(buf); }
}

/**
 * Saves an Allegro Ads report (cost per clicked offer) for a date range. This is the exact source for ad cost per offer.
 * A new upload replaces earlier uploads that cover any of the same days, so nothing is counted twice.
 */
export async function importAdsReport(formData: FormData) {
  const qs = safeQs(formData.get("qs"));
  let notice: string;
  try {
    const { workspace } = await requireWriter();
    const from = String(formData.get("from") ?? ""), to = String(formData.get("to") ?? "");
    if (!ISO.test(from) || !ISO.test(to) || from > to) throw new Error("Choose the first and last day the report covers");
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw new Error("A report can cover at most 400 days");
    if (to > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new Error("The last day cannot be in the future");
    const file = formData.get("file");
    let text = String(formData.get("text") ?? "");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_REPORT_BYTES) throw new Error("The file is too large (limit 1 MB)");
      text = await readText(file);
    }
    if (!text.trim()) throw new Error("Choose a file or paste the table");
    const parsed = parseAdsReport(text);
    if (!parsed.ok) throw new Error(parsed.error);
    const admin = createAdminClient();
    const { data: old } = await admin.from("offer_ad_report").delete().eq("workspace_id", workspace.id).eq("platform", "allegro").lte("date_from", to).gte("date_to", from).select("batch_id");
    const replaced = new Set((old ?? []).map((r) => r.batch_id as string)).size;
    const batch = crypto.randomUUID();
    const { error } = await admin.from("offer_ad_report").insert(parsed.rows.map((r) => ({
      batch_id: batch, workspace_id: workspace.id, platform: "allegro", offer_id: r.offerId, offer_name: r.offerName, campaigns: r.campaigns.join(", ") || null,
      date_from: from, date_to: to, cost_gross: r.costGross, impressions: Math.round(r.impressions), clicks: Math.round(r.clicks), units: Math.round(r.units), sales_gross: r.salesGross,
    })));
    if (error) throw new Error(error.message);
    const total = parsed.rows.reduce((a, r) => a + r.costGross, 0);
    notice = `Read ${parsed.rowsRead} row${parsed.rowsRead === 1 ? "" : "s"}: imported ad costs for ${parsed.rows.length} offer${parsed.rows.length === 1 ? "" : "s"}, ${total.toFixed(2)} gross in total.${parsed.skipped ? ` ${parsed.skipped} row${parsed.skipped === 1 ? " was" : "s were"} skipped for having no valid offer number${parsed.skippedCost > 0 ? ` (${parsed.skippedCost.toFixed(2)} of cost). Compare this with your report total` : ""}.` : ""}${replaced ? ` Replaced ${replaced} earlier import${replaced === 1 ? "" : "s"} covering the same days.` : ""}`;
  } catch (e) { return back(qs, { error: e instanceof Error ? e.message : "Could not import the report" }); }
  back(qs, { notice });
}

export async function deleteAdsReport(formData: FormData) {
  const qs = safeQs(formData.get("qs"));
  try {
    const { workspace } = await requireWriter();
    const batch = String(formData.get("batch") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(batch)) throw new Error("Unknown import");
    await createAdminClient().from("offer_ad_report").delete().eq("workspace_id", workspace.id).eq("batch_id", batch);
  } catch (e) { return back(qs, { error: e instanceof Error ? e.message : "Could not remove the import" }); }
  back(qs, { notice: "Import removed. Ad costs go back to being shared equally." });
}

/**
 * Asks the AI how to fix an offer's profit. The figures are worked out here from the stored data, not taken from the browser; the
 * AI only chooses between them and explains. Nothing is changed anywhere: it is advice.
 */
export async function suggestPricing(input: { offerId: unknown; days?: unknown; from?: unknown; to?: unknown; elasticity?: unknown }): Promise<{ ok: true; advice: PricingAdvice; scenarios: PricingScenarios } | { ok: false; error: string }> {
  try {
    const { supabase, current } = await getWorkspaceContext();
    const { data: auth } = await supabase.auth.getUser();
    if (!current || !auth.user) return { ok: false, error: "Sign in again to continue." };
    const offerId = String(input.offerId ?? "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(offerId)) return { ok: false, error: "Unknown offer." };
    const period = parsePeriod({ days: input.days === undefined ? undefined : String(input.days), from: input.from === undefined ? undefined : String(input.from), to: input.to === undefined ? undefined : String(input.to) });
    const end = period.endDate ?? todayIso();
    const profit = await loadOfferProfit(supabase, current.id, windowStart(end, period.windowDays), end);
    const offer = profit?.offers.find((o) => o.offerId === offerId);
    const model = offer && profit ? buildPricingModel(offer, profit.vatRate) : null;
    if (!model) return { ok: false, error: "This offer needs sales in the period and a cost per unit before it can be priced." };
    const e = Number(input.elasticity);
    const scenarios = pricingScenarios(model, { currency: current.currency, elasticity: [0, 1, 2].includes(e) ? e : 0 });
    if (!(await takeAiQuota(current.id, "pricing"))) return { ok: false, error: `You have used today's ${AI_LIMITS.pricing} pricing suggestions for this workspace. It resets tomorrow.` };
    const advice = await getLlm().generateJson({
      system: PRICING_SYSTEM, user: buildPricingPrompt(scenarios), schema: PRICING_SCHEMA as unknown as JsonSchema,
      maxOutputTokens: PRICING_MAX_TOKENS, temperature: 0.2, validate: (raw) => parsePricingResponse(raw, scenarios),
    });
    return { ok: true, advice, scenarios };
  } catch (e) { return { ok: false, error: friendlyAiError(e) }; }
}
