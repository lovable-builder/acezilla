import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOfferProfit, type DailyRow, type FeeRow, type LineRow, type OrderRow } from "@acezilla/models";
import { shiftDate } from "@acezilla/models";

const PAGE = 1000;
export const todayUtc = () => new Date().toISOString().slice(0, 10);

/** All daily ad rows for a workspace. The caller's session decides what it may read (row-level security). */
export async function loadAdRows(supabase: SupabaseClient, workspaceId: string): Promise<DailyRow[]> {
  const rows: DailyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from("campaign_daily").select("*").eq("workspace_id", workspaceId).order("date", { ascending: false }).range(from, from + PAGE - 1);
    for (const r of data ?? []) rows.push({ campaignId: r.campaign_id, campaignName: r.campaign_name, platform: r.platform, status: r.status, date: r.date, spend: Number(r.spend), impressions: Number(r.impressions), clicks: Number(r.clicks), conversions: Number(r.conversions), revenue: Number(r.revenue) });
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

/** Store orders created on or after `sinceDate` (YYYY-MM-DD) and, optionally, on or before `endDate`. */
export async function loadOrders(supabase: SupabaseClient, workspaceId: string, sinceDate: string, endDate?: string): Promise<OrderRow[]> {
  const out: OrderRow[] = [];
  for (let from = 0; from < 30 * PAGE; from += PAGE) {
    const { data } = await supabase.from("order").select("created_at,revenue,utm,click_ids,customer_id").eq("workspace_id", workspaceId).gte("created_at", `${sinceDate}T00:00:00Z`).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    for (const r of data ?? []) if (!endDate || (r.created_at as string).slice(0, 10) <= endDate) out.push({ createdAt: r.created_at as string, revenue: Number(r.revenue), customerId: (r.customer_id as string | null) ?? null, utm: (r.utm as Record<string, string> | null) ?? null, clickIds: (r.click_ids as Record<string, string> | null) ?? null });
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

/** Per-offer profit for Allegro over a period, or null when Allegro is not connected. */
export async function loadOfferProfit(supabase: SupabaseClient, workspaceId: string, start: string, end: string) {
  const { data: conn } = await supabase.from("connection").select("id").eq("workspace_id", workspaceId).eq("platform", "allegro").maybeSingle();
  if (!conn) return null;
  const [{ data: lines }, { data: fees }, { data: costs }, { data: setting }, { data: snaps }, { data: reports }] = await Promise.all([
    supabase.from("order_line").select("offer_id,name,qty,unit_price,bought_at").eq("workspace_id", workspaceId).eq("platform", "allegro").gte("bought_at", `${start}T00:00:00Z`).limit(20000),
    supabase.from("marketplace_fee").select("category,offer_id,amount,occurred_at").eq("workspace_id", workspaceId).eq("platform", "allegro").gte("occurred_at", `${start}T00:00:00Z`).limit(20000),
    supabase.from("offer_cost").select("offer_id,unit_cost").eq("workspace_id", workspaceId).eq("platform", "allegro"),
    supabase.from("marketplace_setting").select("vat_rate").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("offer_stats_snapshots").select("offer_id,name").eq("workspace_id", workspaceId).eq("platform", "allegro").gte("day", shiftDate(todayUtc(), -7)),
    supabase.from("offer_ad_report").select("offer_id,offer_name,date_from,date_to,cost_gross").eq("workspace_id", workspaceId).eq("platform", "allegro").lte("date_from", end).gte("date_to", start).limit(5000),
  ]);
  // An uploaded Ads report covers a date range with one total per offer. Spread evenly over its days, take the days inside this period.
  const dayMs = 86_400_000, dn = (d: string) => Date.parse(`${d}T00:00:00Z`) / dayMs;
  const reportFees: FeeRow[] = [];
  const reportNames = new Map<string, string>();
  for (const r of reports ?? []) {
    const f = r.date_from as string, t = r.date_to as string, n = dn(t) - dn(f) + 1;
    const lo = f > start ? f : start, hi = t < end ? t : end;
    const overlap = dn(hi) - dn(lo) + 1;
    if (overlap <= 0 || n <= 0) continue;
    reportFees.push({ category: "ads", offerId: r.offer_id as string, amount: Number(r.cost_gross) * (overlap / n), occurredAt: `${hi}T12:00:00Z`, imported: true });
    if (r.offer_name) reportNames.set(r.offer_id as string, r.offer_name as string);
  }
  return buildOfferProfit({
    from: start, to: end, vatRate: Number(setting?.vat_rate ?? 0),
    lines: (lines ?? []).map((l) => ({ offerId: l.offer_id as string, name: (l.name as string | null) ?? null, qty: l.qty as number, unitPrice: Number(l.unit_price), boughtAt: l.bought_at as string })) as LineRow[],
    fees: [...(fees ?? []).map((f) => ({ category: f.category as FeeRow["category"], offerId: (f.offer_id as string | null) ?? null, amount: Number(f.amount), occurredAt: f.occurred_at as string })), ...reportFees],
    costs: new Map((costs ?? []).map((c) => [c.offer_id as string, Number(c.unit_cost)])),
    names: new Map([...reportNames, ...(snaps ?? []).filter((s) => s.name).map((s) => [s.offer_id as string, s.name as string] as [string, string])]),
  });
}

/** Uploaded Ads reports, one entry per upload. */
export async function loadAdImports(supabase: SupabaseClient, workspaceId: string) {
  const { data } = await supabase.from("offer_ad_report").select("batch_id,date_from,date_to,cost_gross,created_at").eq("workspace_id", workspaceId).eq("platform", "allegro").limit(5000);
  const m = new Map<string, { batchId: string; from: string; to: string; offers: number; cost: number; createdAt: string }>();
  for (const r of data ?? []) {
    const k = r.batch_id as string;
    const b = m.get(k) ?? { batchId: k, from: r.date_from as string, to: r.date_to as string, offers: 0, cost: 0, createdAt: r.created_at as string };
    b.offers += 1; b.cost += Number(r.cost_gross); m.set(k, b);
  }
  return [...m.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
