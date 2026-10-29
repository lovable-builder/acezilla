import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetGuide, buildPricingModel, channelDefaults, CHANNELS, reportStats, shiftDate, toGross, type AdReportRow, type DailyRow, type SalesChannel, type ChannelFees } from "@acezilla/models";
import { loadAdRows, loadOfferProfit, loadUnitCosts, loadVatRate, todayUtc } from "@/lib/data";
import type { AdPlatform, ForecastDefaults, ForecastProduct, PlatformStats } from "@/components/forecaster/types";

const PLATFORMS: { id: AdPlatform; label: string }[] = [{ id: "meta", label: "Meta" }, { id: "tiktok", label: "TikTok" }, { id: "google", label: "Google" }, { id: "allegro", label: "Allegro Ads" }];
const DAYS = 90;

/** Cost per click, conversion rate and week-to-week wobble from the last 90 days of one platform. Conversions are as the platform reports them. */
export function platformStats(rows: DailyRow[], platform: { id: AdPlatform; label: string }, end: string): PlatformStats {
  const from = shiftDate(end, -(DAYS - 1)), mine = rows.filter((r) => r.platform === platform.id && r.date >= from && r.date <= end);
  const spend = mine.reduce((s, r) => s + r.spend, 0), clicks = mine.reduce((s, r) => s + r.clicks, 0), conv = mine.reduce((s, r) => s + r.conversions, 0);
  const weekly: number[] = [];
  for (let w = 0; w < Math.floor(DAYS / 7); w++) {
    const to = shiftDate(end, -7 * w), start = shiftDate(to, -6);
    const wk = mine.filter((r) => r.date >= start && r.date <= to), c = wk.reduce((s, r) => s + r.clicks, 0), sp = wk.reduce((s, r) => s + r.spend, 0);
    if (c >= 30 && sp > 0) weekly.push(sp / c);
  }
  let spread: number | null = null;
  if (weekly.length >= 4) { const m = weekly.reduce((s, v) => s + v, 0) / weekly.length; spread = Math.sqrt(weekly.reduce((s, v) => s + (v - m) ** 2, 0) / weekly.length) / m; }
  return { ...platform, source: "sync" as const, spend, clicks, days: new Set(mine.map((r) => r.date)).size, cpc: clicks >= 30 ? spend / clicks : null, cvr: clicks >= 30 ? conv / clicks : null, cpcSpread: spread };
}

/** Allegro Ads: cost per click and orders per click from the uploaded Ads report, cost without VAT. The report is one total per offer, so there is no week-to-week wobble to measure. */
export function allegroStats(platform: { id: AdPlatform; label: string }, rows: AdReportRow[], start: string, end: string): PlatformStats {
  const t = reportStats(rows, start, end);
  return { ...platform, source: "report", spend: t.spend, clicks: Math.round(t.clicks), days: t.days, cpc: t.clicks >= 30 ? t.spend / t.clicks : null, cvr: t.clicks >= 30 ? t.orders / t.clicks : null, cpcSpread: null };
}

export async function loadForecastDefaults(supabase: SupabaseClient, workspaceId: string, currency: string): Promise<ForecastDefaults> {
  const end = todayUtc(), start = shiftDate(end, -(DAYS - 1));
  const [rows, vatRate, profit, wooRes, wooCosts, reportRes] = await Promise.all([
    loadAdRows(supabase, workspaceId), loadVatRate(supabase, workspaceId), loadOfferProfit(supabase, workspaceId, start, end),
    supabase.from("store_product").select("external_id,name,price").eq("workspace_id", workspaceId).eq("platform", "woocommerce").eq("status", "publish").not("price", "is", null).order("name").limit(2000),
    loadUnitCosts(supabase, workspaceId, "woocommerce"),
    supabase.from("offer_ad_report").select("date_from,date_to,cost_gross,clicks,units").eq("workspace_id", workspaceId).eq("platform", "allegro").lte("date_from", end).gte("date_to", start).limit(5000),
  ]);
  const lastDate = rows.reduce((m, r) => (r.date > m ? r.date : m), "0000-00-00");
  const vat = profit?.vatRate ?? vatRate;
  const platforms = PLATFORMS.map((p) => (p.id === "allegro" ? allegroStats(p, (reportRes.data ?? []).map((r) => ({ from: r.date_from as string, to: r.date_to as string, cost: Number(r.cost_gross) / (1 + vat), clicks: Number(r.clicks), units: Number(r.units) })), start, end) : platformStats(rows.filter((r) => r.platform !== "allegro"), p, lastDate > "0000-00-00" ? lastDate : end)));

  const products: ForecastProduct[] = [];
  const fees = Object.fromEntries(CHANNELS.map((c) => [c, channelDefaults(c, currency)])) as Record<SalesChannel, ChannelFees>;
  const observed = Object.fromEntries(CHANNELS.map((c) => [c, [] as string[]])) as Record<SalesChannel, string[]>;
  const models = profit ? profit.offers.map((o) => buildPricingModel(o, profit.vatRate)).filter((m): m is NonNullable<typeof m> => m !== null) : [];
  for (const m of models) products.push({ id: `allegro:${m.offerId}`, channel: "allegro", name: m.name, price: toGross(m.price, m.vatRate), unitCost: m.unitCost, commissionRate: m.commissionRate, shipping: m.feesPerUnit });
  if (models.length) {
    // Averages weighted by sales, so one odd offer does not set the rate.
    const rev = models.reduce((s, m) => s + m.units * m.price, 0), units = models.reduce((s, m) => s + m.units, 0);
    fees.allegro = { ...fees.allegro, commissionRate: Math.round((models.reduce((s, m) => s + m.commissionRate * m.units * m.price, 0) / rev) * 1000) / 1000, shippingPerOrder: Math.round((models.reduce((s, m) => s + m.feesPerUnit * m.units, 0) / units) * 100) / 100 };
    observed.allegro = ["commission", "shipping and other fees"];
  }
  for (const p of wooRes.data ?? []) products.push({ id: `woocommerce:${p.external_id}`, channel: "woocommerce", name: p.name as string, price: Number(p.price), unitCost: wooCosts.get(p.external_id as string) ?? null, commissionRate: null, shipping: null });

  const guide = (p: Exclude<AdPlatform, "allegro">) => budgetGuide(p === "tiktok" ? "tiktok" : p === "google" ? "google" : "meta", "sales", currency)?.recommended ?? null;
  return { currency, vatRate: vat, platforms, products, fees, observed, dailyBudget: { meta: guide("meta"), tiktok: guide("tiktok"), google: guide("google"), allegro: null } };
}
