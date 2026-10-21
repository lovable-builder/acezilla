import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAttribution, buildDashboard, buildInsights, buildStoreSales, collectNumbers, shiftDate, storeRoas, untrustedLabel } from "@acezilla/models";
import { loadAdRows, loadOfferProfit, loadOrders, todayUtc } from "@/lib/data";

const r2 = (n: number) => Math.round(n * 100) / 100;
const label = (v: unknown, max = 70) => untrustedLabel(v, max);

/**
 * A fixed snapshot of what the signed-in user can see in one workspace, for the model to answer from. It is built with the
 * user's own session, so row-level security decides what is in it. Names that come from outside are shortened and cleaned.
 * The model never queries anything itself.
 */
export async function buildWorkspaceBrief(supabase: SupabaseClient, ws: { id: string; name: string; currency: string }, windowDays: number) {
  const rows = await loadAdRows(supabase, ws.id);
  const d = rows.length ? buildDashboard(rows, { windowDays }) : null;
  const end = d?.endDate ?? todayUtc();
  const start = shiftDate(end, -(windowDays - 1));
  const orders = await loadOrders(supabase, ws.id, shiftDate(end, -(2 * windowDays)), end);
  const store = orders.length ? buildStoreSales(orders, { windowDays, endDate: end }) : null;
  const inWindow = orders.filter((o) => o.createdAt.slice(0, 10) >= start);
  const attr = buildAttribution({ platforms: d?.platforms ?? [], campaigns: d?.campaigns ?? [], orders: inWindow, nonReporting: ["allegro"] });
  const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} ${ws.currency}`;
  const insights = d ? buildInsights(d, store, { money: fmt, nonReporting: ["allegro"] }, 6) : [];
  const profit = await loadOfferProfit(supabase, ws.id, start, end);

  const [{ data: conns }, { data: sites }] = await Promise.all([
    supabase.from("connection").select("platform,status,last_sync_at").eq("workspace_id", ws.id),
    supabase.from("seo_site").select("id,host").eq("workspace_id", ws.id).limit(5),
  ]);
  const seo = [];
  for (const s of sites ?? []) {
    const { data: a } = await supabase.from("seo_audit").select("id,scores,finished_at").eq("site_id", s.id).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!a) continue;
    const { data: f } = await supabase.from("seo_finding").select("signal,status,weight").eq("audit_id", a.id).in("status", ["missing", "attention"]).order("weight", { ascending: false }).limit(3);
    seo.push({ site: label(s.host, 60), scores: a.scores, auditedOn: String(a.finished_at).slice(0, 10), topIssues: (f ?? []).map((x) => `${label(x.signal, 60)} (${x.status})`) });
  }

  const brief = {
    workspace: { name: label(ws.name, 60), currency: ws.currency },
    period: { from: start, to: end, days: windowDays, note: "Changes compare with the same number of days before." },
    ads: d ? {
      spend: r2(d.kpis.spend.value), spendChange: d.kpis.spend.deltaPct === null ? null : r2(d.kpis.spend.deltaPct),
      platformReportedRevenue: r2(d.kpis.revenue.value), platformReportedRoas: r2(d.kpis.roas.value), conversions: Math.round(d.kpis.conversions.value),
      platforms: d.platforms.map((p) => ({ platform: label(p.platform, 20), spend: r2(p.spend), platformReportedRevenue: r2(p.revenue), roas: p.roas === null ? null : r2(p.roas) })),
      topCampaigns: d.campaigns.slice(0, 12).map((c) => ({ name: label(c.name), platform: label(c.platform, 20), spend: r2(c.spend), conversions: Math.round(c.conversions), platformRoas: c.roas === null ? null : r2(c.roas), storeRoas: (() => { const m = attr.campaigns.get(c.campaignId); return m?.modeledRoas == null ? null : r2(m.modeledRoas); })() })),
      anomalies: d.anomalies.slice(0, 5).map((a) => label(a.title, 120)),
      note: "Allegro ads report spend only (no revenue or conversions), so platform ROAS excludes their results.",
    } : "no ad data in this workspace",
    store: store ? {
      revenue: r2(store.revenue.value), revenueChange: store.revenue.deltaPct === null ? null : r2(store.revenue.deltaPct), orders: store.orders.value, averageOrder: r2(store.aov.value),
      storeRoas: d && d.kpis.spend.value > 0 ? (() => { const v = storeRoas(store.revenue.value, d.kpis.spend.value); return v === null ? null : r2(v); })() : null,
      sources: store.sources.slice(0, 6).map((s) => ({ source: label(s.source, 30), orders: s.orders, revenue: r2(s.revenue), share: r2(s.share) })),
      shareOfOrdersWithAMarketingSource: store.taggedShare === null ? null : r2(store.taggedShare),
    } : "no store orders in this period",
    channels: attr.channels.slice(0, 6).map((c) => ({ platform: label(c.platform, 20), spend: r2(c.spend), platformRoas: c.platformRoas === null ? null : r2(c.platformRoas), storeRevenue: r2(c.storeRevenue), storeRoas: c.storeRoas === null ? null : r2(c.storeRoas), overclaimShare: c.overclaim === null ? null : r2(c.overclaim) })),
    repeatCustomerShare: attr.customers.repeatShare === null ? null : r2(attr.customers.repeatShare),
    allegroOffers: profit ? {
      vatRate: profit.vatRate, netSales: profit.totals.revenue, fees: profit.totals.fees, ads: profit.totals.ads, goodsCost: profit.totals.goodsCost, profit: profit.totals.profit, offersWithoutCost: profit.missingCosts,
      topOffers: profit.offers.slice(0, 10).map((o) => ({ name: label(o.name), units: o.units, netSales: o.revenue, fees: o.fees, ads: o.ads, acos: o.acos === null ? null : r2(o.acos), profit: o.profit, status: o.status })),
      note: "profit is null when the cost of goods for that offer has not been entered.",
    } : undefined,
    insights: insights.map((i) => ({ title: label(i.title, 140), detail: label(i.detail, 260) })),
    seo,
    connections: (conns ?? []).map((c) => ({ platform: label(c.platform, 20), status: label(c.status, 20), lastSync: c.last_sync_at ? String(c.last_sync_at).slice(0, 10) : null })),
  };
  return { brief, numbers: collectNumbers(brief) };
}
