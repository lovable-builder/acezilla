import Link from "next/link";
import { buildAttribution, buildDashboard, buildOfferProfit, shiftDate, type DailyRow, type FeeRow, type LineRow, type OrderRow } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PeriodBar } from "@/components/dash/period-bar";
import { int, money, PLATFORM, x } from "@/lib/format";
import { parsePeriod, periodQs, todayIso, windowStart } from "@/lib/period";
import { saveOfferCost, saveVatRate } from "./actions";

export const metadata = { title: "Attribution · acezilla" };
export const dynamic = "force-dynamic";
const PAGE = 1000;
const pct = (n: number | null, d = 0) => (n === null ? "—" : `${(n * 100).toFixed(d)}%`);
const label = (p: string) => PLATFORM[p]?.label ?? p.replace(/^./, (c) => c.toUpperCase());

export default async function Attribution({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; notice?: string; error?: string }> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const qs = periodQs(period);
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>No workspace found for this account.</Card>;
  const cur = current.currency;

  // Ad data (what the platforms say)
  const rows: DailyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from("campaign_daily").select("*").eq("workspace_id", current.id).order("date", { ascending: false }).range(from, from + PAGE - 1);
    for (const r of data ?? []) rows.push({ campaignId: r.campaign_id, campaignName: r.campaign_name, platform: r.platform, status: r.status, date: r.date, spend: Number(r.spend), impressions: Number(r.impressions), clicks: Number(r.clicks), conversions: Number(r.conversions), revenue: Number(r.revenue) });
    if ((data?.length ?? 0) < PAGE) break;
  }
  const d = rows.length ? buildDashboard(rows, { windowDays: period.windowDays, endDate: period.endDate }) : null;
  const endDate = d?.endDate ?? period.endDate ?? todayIso();
  const start = windowStart(endDate, period.windowDays);

  // Store orders (what really sold)
  const orders: OrderRow[] = [];
  for (let from = 0; from < 30 * PAGE; from += PAGE) {
    const { data } = await supabase.from("order").select("created_at,revenue,utm,click_ids,customer_id").eq("workspace_id", current.id).gte("created_at", `${start}T00:00:00Z`).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    for (const r of data ?? []) if ((r.created_at as string).slice(0, 10) <= endDate) orders.push({ createdAt: r.created_at as string, revenue: Number(r.revenue), customerId: (r.customer_id as string | null) ?? null, utm: (r.utm as Record<string, string> | null) ?? null, clickIds: (r.click_ids as Record<string, string> | null) ?? null });
    if ((data?.length ?? 0) < PAGE) break;
  }
  const attr = buildAttribution({ platforms: d?.platforms ?? [], campaigns: d?.campaigns ?? [], orders, nonReporting: ["allegro"] });
  const totalSales = orders.reduce((s, o) => s + o.revenue, 0);

  // Allegro offers (profit per offer)
  const { data: allegroConn } = await supabase.from("connection").select("id").eq("workspace_id", current.id).eq("platform", "allegro").maybeSingle();
  let profit: ReturnType<typeof buildOfferProfit> | null = null;
  if (allegroConn) {
    const [{ data: lines }, { data: fees }, { data: costs }, { data: setting }, { data: snaps }] = await Promise.all([
      supabase.from("order_line").select("offer_id,name,qty,unit_price,bought_at").eq("workspace_id", current.id).eq("platform", "allegro").gte("bought_at", `${start}T00:00:00Z`).limit(20000),
      supabase.from("marketplace_fee").select("category,offer_id,amount,occurred_at").eq("workspace_id", current.id).eq("platform", "allegro").gte("occurred_at", `${start}T00:00:00Z`).limit(20000),
      supabase.from("offer_cost").select("offer_id,unit_cost").eq("workspace_id", current.id).eq("platform", "allegro"),
      supabase.from("marketplace_setting").select("vat_rate").eq("workspace_id", current.id).maybeSingle(),
      supabase.from("offer_stats_snapshots").select("offer_id,name").eq("workspace_id", current.id).eq("platform", "allegro").gte("day", shiftDate(todayIso(), -7)),
    ]);
    profit = buildOfferProfit({
      from: start, to: endDate, vatRate: Number(setting?.vat_rate ?? 0),
      lines: (lines ?? []).map((l) => ({ offerId: l.offer_id as string, name: (l.name as string | null) ?? null, qty: l.qty as number, unitPrice: Number(l.unit_price), boughtAt: l.bought_at as string })) as LineRow[],
      fees: (fees ?? []).map((f) => ({ category: f.category as FeeRow["category"], offerId: (f.offer_id as string | null) ?? null, amount: Number(f.amount), occurredAt: f.occurred_at as string })),
      costs: new Map((costs ?? []).map((c) => [c.offer_id as string, Number(c.unit_cost)])),
      names: new Map((snaps ?? []).filter((s) => s.name).map((s) => [s.offer_id as string, s.name as string])),
    });
  }

  const noData = orders.length === 0 && !d && !profit;
  return (
    <>
      <PeriodBar path="/attribution" active={period.days} custom={period.custom} />
      <div>
        <div className="eyebrow">Analyze · {start} to {endDate}</div>
        <h1 className="page">What your ads really earned</h1>
        <p className="sub">Ad platforms report their own results. This page checks them against the orders in your store, and shows what each Allegro offer earns after fees, ads and the cost of the goods.</p>
      </div>
      {sp.notice && <Card style={{ color: "var(--pos)" }}>{sp.notice}</Card>}
      {sp.error && <Card style={{ color: "var(--neg)" }}>{sp.error}</Card>}
      {noData && <Card>Nothing to analyse yet. Connect an ad account or your store on <Link href="/connections" style={{ color: "var(--accent-ink)" }}>Connections</Link>.</Card>}

      {attr.channels.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">01</span>Channels: platform says vs store earned</h2>
          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t tabnum" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Channel</th><th>Ad spend</th><th>Platform revenue</th><th>Platform ROAS</th><th>Store revenue</th><th>Store ROAS</th><th>Over-claim</th></tr></thead>
              <tbody>{attr.channels.map((c) => (
                <tr key={c.platform}>
                  <td style={{ textAlign: "left" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 8, background: PLATFORM[c.platform]?.color }} />{label(c.platform)}</td>
                  <td>{money(c.spend, cur)}</td>
                  <td>{c.platformRoas === null ? <span style={{ color: "var(--ink3)" }} title="This platform does not report revenue per ad">not reported</span> : money(c.platformRevenue, cur)}</td>
                  <td style={{ color: "var(--ink3)" }}>{x(c.platformRoas)}</td>
                  <td>{money(c.storeRevenue, cur)} <span style={{ color: "var(--ink3)" }}>· {int(c.storeOrders)} orders</span></td>
                  <td style={{ fontWeight: 600 }}>{x(c.storeRoas)}</td>
                  <td style={{ color: c.overclaim !== null && c.overclaim > 0.25 ? "var(--neg)" : "var(--ink3)" }}>{pct(c.overclaim)}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Store revenue counts only orders whose marketing source (UTM tag or ad click ID) points at that channel. Over-claim is the share of what the platform says it earned that no tagged store order confirms.</p>
        </section>
      )}

      {orders.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">02</span>Where store revenue comes from</h2>
          <div className="kpis">
            <div className="kpi"><span className="eyebrow">Store revenue</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{money(totalSales, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{int(orders.length)} orders</span></div>
            <div className="kpi"><span className="eyebrow">With no marketing source</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600, color: attr.untagged.share >= 0.5 ? "var(--warn)" : "var(--ink)" }}>{pct(attr.untagged.share)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{money(attr.untagged.revenue, cur)}</span></div>
            <div className="kpi"><span className="eyebrow">Repeat customers</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{pct(attr.customers.repeatShare)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>of {int(attr.customers.orders)} orders with a customer</span></div>
          </div>
          {attr.otherSources.length > 0 && (
            <Card style={{ overflowX: "auto", padding: 0 }}>
              <table className="t tabnum" style={{ margin: 0 }}>
                <thead><tr><th style={{ textAlign: "left" }}>Other tagged sources</th><th>Orders</th><th>Revenue</th></tr></thead>
                <tbody>{attr.otherSources.slice(0, 8).map((s) => <tr key={s.source}><td style={{ textAlign: "left", textTransform: "capitalize" }}>{s.source}</td><td>{int(s.orders)}</td><td>{money(s.revenue, cur)}</td></tr>)}</tbody>
              </table>
            </Card>
          )}
          {attr.unmatched.length > 0 && (
            <Card>
              <b>Order tags that match no campaign</b>
              <p className="sub" style={{ fontSize: 13, margin: "4px 0 8px" }}>Orders carry these campaign names, but no ad campaign has the same name. Use the exact campaign name (or its ID) in <span className="mono">utm_campaign</span> so the revenue is credited.</p>
              <table className="t tabnum" style={{ margin: 0 }}>
                <tbody>{attr.unmatched.slice(0, 6).map((u) => <tr key={`${u.source}|${u.campaign}`}><td style={{ textAlign: "left" }}>{u.campaign} <span style={{ color: "var(--ink3)" }}>· {u.source}</span></td><td>{int(u.orders)} orders</td><td>{money(u.revenue, cur)}</td></tr>)}</tbody>
              </table>
            </Card>
          )}
        </section>
      )}

      {profit && (
        <section id="offers" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">03</span>Allegro offers: profit per offer</h2>
          <div className="kpis">
            <div className="kpi"><span className="eyebrow">Net sales</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{money(profit.totals.revenue, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{int(profit.totals.units)} units</span></div>
            <div className="kpi"><span className="eyebrow">Allegro fees</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{money(profit.totals.fees, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{pct(profit.totals.revenue > 0 ? profit.totals.fees / profit.totals.revenue : null, 1)} of sales</span></div>
            <div className="kpi"><span className="eyebrow">Ads</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{money(profit.totals.ads, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{pct(profit.totals.revenue > 0 ? profit.totals.ads / profit.totals.revenue : null, 1)} of sales</span></div>
            <div className="kpi"><span className="eyebrow">Profit{profit.missingCosts > 0 ? " (so far)" : ""}</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600, color: profit.totals.profit < 0 ? "var(--neg)" : "var(--ink)" }}>{money(profit.totals.profit, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>after {money(profit.totals.goodsCost, cur)} goods cost</span></div>
          </div>
          {profit.missingCosts > 0 && <Card style={{ borderColor: "var(--warn)" }}>{profit.missingCosts} offer{profit.missingCosts === 1 ? " has" : "s have"} no cost of goods yet, so {profit.missingCosts === 1 ? "its" : "their"} profit is not final. Enter what one unit costs you (without VAT) in the table below.</Card>}

          <form action={saveVatRate} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="qs" value={qs} />
            <label className="eyebrow" htmlFor="vat">Allegro amounts include VAT of</label>
            <select id="vat" name="vat" className="field" defaultValue={String(profit.vatRate)} style={{ padding: "5px 8px" }}>
              <option value="0">0% (not VAT registered)</option><option value="0.23">23%</option><option value="0.08">8%</option><option value="0.05">5%</option>
            </select>
            <Button variant="outline" size="sm">Save</Button>
          </form>

          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t tabnum" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Offer</th><th>Units</th><th>Net sales</th><th>Fees</th><th>Ads</th><th>ACoS</th><th>Cost per unit</th><th>Profit</th><th>Break-even ACoS</th></tr></thead>
              <tbody>
                {profit.offers.map((o) => (
                  <tr key={o.offerId}>
                    <td style={{ textAlign: "left", maxWidth: 260, overflowWrap: "anywhere" }}>{o.name}{o.status === "loss" && <span className="seo-chip seo-chip-missing" style={{ marginLeft: 8 }}>Losing money</span>}{o.status === "thin" && <span className="seo-chip seo-chip-attention" style={{ marginLeft: 8 }}>Thin margin</span>}</td>
                    <td>{int(o.units)}</td><td>{money(o.revenue, cur)}</td><td>{money(o.fees, cur)}</td><td>{money(o.ads, cur)}</td>
                    <td>{pct(o.acos, 1)}</td>
                    <td>
                      <form action={saveOfferCost} style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <input type="hidden" name="qs" value={qs} /><input type="hidden" name="offerId" value={o.offerId} />
                        <input name="unitCost" className="field" inputMode="decimal" defaultValue={o.unitCost ?? ""} placeholder="cost" aria-label={`Cost per unit for ${o.name}`} style={{ width: 80, padding: "4px 8px" }} />
                        <Button variant="ghost" size="sm">Save</Button>
                      </form>
                    </td>
                    <td style={{ fontWeight: 600, color: o.profit === null ? "var(--ink3)" : o.profit < 0 ? "var(--neg)" : "var(--ink)" }} title={o.profit === null ? `Before goods cost: ${money(o.profitBeforeCost, cur)}` : undefined}>{o.profit === null ? "needs cost" : money(o.profit, cur)}</td>
                    <td style={{ color: "var(--ink3)" }}>{pct(o.breakEvenAcos, 1)}</td>
                  </tr>
                ))}
                {profit.offers.length === 0 && <tr><td colSpan={9} style={{ textAlign: "left" }}>No sales or ad costs in this period. Run Sync now on the Allegro connection to import offer detail.</td></tr>}
                {profit.accountLevel.total !== 0 && <tr><td style={{ textAlign: "left", color: "var(--ink3)" }}>Account-level costs (subscription and charges not tied to an offer)</td><td /><td /><td>{money(profit.accountLevel.total, cur)}</td><td /><td /><td /><td /><td /></tr>}
              </tbody>
            </table>
          </Card>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Profit = net sales − Allegro fees − ads − cost of goods. ACoS is ad cost as a share of net sales; break-even ACoS is the highest it could be before the offer stops making money. Charges Allegro does not tie to an offer stay in the account-level line and are counted in the totals. If offer detail is empty, open Connections → Allegro and click Sync now once.</p>
        </section>
      )}
    </>
  );
}
