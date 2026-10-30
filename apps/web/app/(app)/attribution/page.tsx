import Link from "next/link";
import { buildAttribution, buildDashboard } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Step, StepFlow } from "@/components/app/step-flow";
import { Term } from "@/components/app/term";
import { PairBars, ProfitBars } from "@/components/dash/bars";
import { PricingAdvisor } from "@/components/attribution/pricing-advisor";
import { buildPricingModel, buildStoreProductProfit } from "@acezilla/models";
import { adSpendByProduct } from "@/lib/campaign-products";
import { loadCampaignLinks, loadProducts, loadUnitCosts } from "@/lib/data";
import { shiftDate } from "@acezilla/models";
import { PeriodBar } from "@/components/dash/period-bar";
import { int, money, PLATFORM, x } from "@/lib/format";
import { parsePeriod, periodQs, todayIso, windowStart } from "@/lib/period";
import { loadAdImports, loadAdRows, loadAnalytics, loadOfferProfit, loadOrders } from "@/lib/data";
import { TrafficPanel } from "@/components/attribution/traffic-panel";
import { deleteAdsReport, importAdsReport, saveOfferCost, saveVatRate } from "./actions";

export const metadata = { title: "Attribution · acezilla" };
export const dynamic = "force-dynamic";
const pct = (n: number | null, d = 0) => (n === null ? "—" : `${(n * 100).toFixed(d)}%`);
const label = (p: string) => PLATFORM[p]?.label ?? p.replace(/^./, (c) => c.toUpperCase());

export default async function Attribution({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; store?: string; notice?: string; error?: string }> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const qs = periodQs(period);
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>No workspace found for this account.</Card>;
  const cur = current.currency;

  // Ad data (what the platforms say)
  const rows = await loadAdRows(supabase, current.id);
  const d = rows.length ? buildDashboard(rows, { windowDays: period.windowDays, endDate: period.endDate }) : null;
  const endDate = d?.endDate ?? period.endDate ?? todayIso();
  const start = windowStart(endDate, period.windowDays);

  // Store orders (what really sold)
  const orders = await loadOrders(supabase, current.id, start, endDate);
  const attr = buildAttribution({ platforms: d?.platforms ?? [], campaigns: d?.campaigns ?? [], orders, nonReporting: ["allegro"] });
  const totalSales = orders.reduce((s, o) => s + o.revenue, 0);

  // Website visits (Google Analytics), to set next to the clicks the ad platforms billed
  const analytics = await loadAnalytics(supabase, current.id, start, endDate);

  // Allegro offers (profit per offer)
  const profit = await loadOfferProfit(supabase, current.id, start, endDate);
  const adImports = profit ? await loadAdImports(supabase, current.id) : [];
  const pricingModels = profit ? profit.offers.map((o) => buildPricingModel(o, profit.vatRate)).filter((m): m is NonNullable<typeof m> => m !== null) : [];

  // Store detail: Allegro and WooCommerce today, TikTok Shop later. The cross-store sections above stay on every tab.
  const { data: wooConn } = await supabase.from("connection").select("id").eq("workspace_id", current.id).eq("platform", "woocommerce").maybeSingle();
  const hasAllegro = !!profit, hasWoo = !!wooConn;
  const tab: "allegro" | "woocommerce" | null = sp.store === "woocommerce" && hasWoo ? "woocommerce" : sp.store === "allegro" && hasAllegro ? "allegro" : hasAllegro ? "allegro" : hasWoo ? "woocommerce" : null;
  const wooData = tab === "woocommerce" ? await (async () => {
    const [{ rows: prod }, links, costs] = await Promise.all([loadProducts(supabase, current.id, start, endDate), loadCampaignLinks(supabase, current.id), loadUnitCosts(supabase, current.id, "woocommerce")]);
    return { ...buildStoreProductProfit({ rows: prod, channel: "woocommerce", costs, adSpend: adSpendByProduct(rows, prod, links, start, endDate) }), catalogEmpty: !prod.some((r) => r.channel === "woocommerce") };
  })() : null;
  const storeQs = (st: string) => `${qs}&store=${st}`;

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

      <StepFlow id="results">
      {attr.channels.length > 0 && (
      <Step label="Ads vs real sales" hint="What each platform says against what your store confirms">
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">01</span>Channels: platform says vs store earned</h2>
          {attr.channels.some((c) => c.platformRoas !== null) && (
            <Card>
              <PairBars cur={cur} fmt={money} rows={attr.channels.filter((c) => c.platformRoas !== null).map((c) => ({ label: label(c.platform), a: { label: "Platform says", value: c.platformRevenue }, b: { label: "Store confirms", value: c.storeRevenue } }))} />
            </Card>
          )}
          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t tabnum" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Channel</th><th>Ad spend</th><th>Platform revenue</th><th><Term>Platform ROAS</Term></th><th>Store revenue</th><th><Term>Modeled ROAS</Term></th><th><Term>Over-claim</Term></th></tr></thead>
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
      </Step>
      )}

      {orders.length > 0 && (
      <Step label="Where sales come from" hint="Which marketing source brought each order">
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
            <Card style={{ overflowX: "auto" }}>
              <b>Order tags that match no campaign</b>
              <p className="sub" style={{ fontSize: 13, margin: "4px 0 8px" }}>Orders carry these campaign names, but no ad campaign has the same name. Use the exact campaign name (or its ID) in <span className="mono">utm_campaign</span> so the revenue is credited.</p>
              <table className="t tabnum" style={{ margin: 0 }}>
                <tbody>{attr.unmatched.slice(0, 6).map((u) => <tr key={`${u.source}|${u.campaign}`}><td style={{ textAlign: "left" }}>{u.campaign} <span style={{ color: "var(--ink3)" }}>· {u.source}</span></td><td>{int(u.orders)} orders</td><td>{money(u.revenue, cur)}</td></tr>)}</tbody>
              </table>
            </Card>
          )}
        </section>
      </Step>
      )}

      <Step label="Website visits" hint="Google Analytics against your ad clicks">
      <section id="analytics" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Website visits: Google Analytics vs ad clicks</h2>
        <TrafficPanel ga={analytics} ads={rows.filter((r) => r.platform !== "allegro")} start={start} end={endDate} cur={cur} />
      </section>
      </Step>

      {(hasAllegro || hasWoo) && (
      <Step label="Profit per offer" hint="Fees, ads and goods taken off every offer, plus the price advisor">
      {(hasAllegro || hasWoo) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} role="tablist" aria-label="Store detail">
          <span className="eyebrow">Store detail</span>
          {hasAllegro && <Link role="tab" aria-selected={tab === "allegro"} href={`/attribution?${storeQs("allegro")}#results-4`} className={`nav-item${tab === "allegro" ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 14px" }}>Allegro</Link>}
          {hasWoo && <Link role="tab" aria-selected={tab === "woocommerce"} href={`/attribution?${storeQs("woocommerce")}#results-4`} className={`nav-item${tab === "woocommerce" ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 14px" }}>WooCommerce</Link>}
          <span className="nav-item" aria-disabled="true" title="TikTok Shop is not connectable yet" style={{ width: "fit-content", padding: "6px 14px", opacity: 0.55, cursor: "default" }}>TikTok Shop<span className="nav-soon">Soon</span></span>
        </div>
      )}

      {tab === "woocommerce" && wooData && (
        <section id="woo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">03</span>WooCommerce: profit per product</h2>
          <div className="kpis">
            <div className="kpi"><span className="eyebrow">Net sales</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{money(wooData.totals.revenue, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{int(wooData.totals.units)} units · before tax</span></div>
            <div className="kpi"><span className="eyebrow">Ads on these products</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{money(wooData.totals.ads, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>campaigns linked to a product</span></div>
            <div className="kpi"><span className="eyebrow">Profit{wooData.missingCosts > 0 ? " (so far)" : ""}</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600, color: wooData.totals.profit < 0 ? "var(--neg)" : "var(--ink)" }}>{money(wooData.totals.profit, cur)}</span><span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>sales − goods − ads</span></div>
          </div>
          {wooData.catalogEmpty && <Card style={{ borderColor: "var(--warn)" }}>Your WooCommerce product list has not arrived. Update the acezilla plugin to the latest version and open your WordPress admin once.</Card>}
          {wooData.missingCosts > 0 && <Card style={{ borderColor: "var(--warn)" }}>{wooData.missingCosts} product{wooData.missingCosts === 1 ? " has" : "s have"} no cost per unit yet, so {wooData.missingCosts === 1 ? "its profit is" : "their profits are"} not shown. Enter the net cost of one unit (before tax) in the table.</Card>}
          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t tabnum" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Product</th><th>Units</th><th>Net sales</th><th>Ads</th><th>Cost per unit</th><th>Profit</th><th>Margin</th></tr></thead>
              <tbody>
                {wooData.rows.map((r) => (
                  <tr key={r.productId} style={{ opacity: r.units === 0 && r.ads === 0 ? 0.7 : 1 }}>
                    <td style={{ textAlign: "left", maxWidth: 300, overflowWrap: "anywhere" }}>{r.name}{r.units === 0 && <span className="sub" style={{ marginLeft: 8, fontSize: 12 }}>no sales</span>}</td>
                    <td>{int(r.units)}</td><td>{money(r.revenue, cur)}</td><td>{r.ads > 0 ? money(r.ads, cur) : "—"}</td>
                    <td>
                      <form action={saveOfferCost} style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <input type="hidden" name="qs" value={storeQs("woocommerce")} /><input type="hidden" name="offerId" value={r.productId} /><input type="hidden" name="platform" value="woocommerce" />
                        <input name="unitCost" className="field" inputMode="decimal" defaultValue={r.unitCost ?? ""} placeholder="cost" aria-label={`Cost per unit for ${r.name}`} style={{ width: 80, padding: "4px 8px" }} />
                        <Button variant="ghost" size="sm">Save</Button>
                      </form>
                    </td>
                    <td style={{ fontWeight: 600, color: r.profit === null ? "var(--ink3)" : r.profit < 0 ? "var(--neg)" : "var(--ink)" }}>{r.profit === null ? "needs cost" : money(r.profit, cur)}</td>
                    <td style={{ color: "var(--ink3)" }}>{r.profit === null || r.revenue <= 0 ? "—" : pct(r.profit / r.revenue, 1)}</td>
                  </tr>
                ))}
                {wooData.rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "left" }}>No WooCommerce products or sales yet.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Profit = net sales (before tax) − cost of the goods sold − ad spend of the campaigns linked to the product. Payment-gateway fees and shipping you pay are not in WooCommerce&apos;s data, so they are not included. Link campaigns to products on the Command center.</p>
        </section>
      )}

      {profit && tab === "allegro" && (
        <section id="offers" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">03</span>Allegro: profit per offer</h2>
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

          {profit.offers.some((o) => o.profit !== null) && (
            <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="h2" style={{ margin: 0 }}>Profit per offer</h2>
              <ProfitBars cur={cur} fmt={money} rows={profit.offers.filter((o) => o.profit !== null).slice(0, 12).map((o) => ({ label: o.name, value: o.profit as number }))} />
            </Card>
          )}
          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t tabnum" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Offer</th><th>Units</th><th>Net sales</th><th>Fees</th><th>Ads</th><th><Term>ACoS</Term></th><th>Cost per unit</th><th>Profit</th><th><Term>Break-even ACoS</Term></th></tr></thead>
              <tbody>
                {profit.offers.filter((o) => o.units > 0).map((o) => (
                  <tr key={o.offerId}>
                    <td style={{ textAlign: "left", maxWidth: 260, overflowWrap: "anywhere" }}>{o.name}{o.status === "loss" && <span className="seo-chip seo-chip-missing" style={{ marginLeft: 8 }}>Losing money</span>}{o.status === "thin" && <span className="seo-chip seo-chip-attention" style={{ marginLeft: 8 }}>Thin margin</span>}</td>
                    <td>{int(o.units)}</td><td>{money(o.revenue, cur)}</td><td title={o.shared > 0 ? `Includes ${money(o.shared, cur)} of shared costs (campaign charges, delivery, subscription), split across offers by sales or units` : undefined}>{money(o.fees, cur)}</td><td title={o.shared > 0 ? "Includes campaign ad charges Allegro does not tie to one offer, split equally across the offers that sold" : undefined}>{money(o.ads, cur)}</td>
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
                {profit.offers.every((o) => o.units === 0) && <tr><td colSpan={9} style={{ textAlign: "left" }}>No sales or ad costs in this period. Run Sync now on the Allegro connection to import offer detail.</td></tr>}
                {profit.accountLevel.total !== 0 && <tr><td style={{ textAlign: "left", color: "var(--ink3)" }}>Account-level costs (subscription and charges not tied to an offer)</td><td /><td /><td>{money(profit.accountLevel.total, cur)}</td><td /><td /><td /><td /><td /></tr>}
              </tbody>
            </table>
            {profit.offers.some((o) => o.units === 0) && (
              <details style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>
                  {profit.offers.filter((o) => o.units === 0).length} offers had ad or fee charges but no sales in this period ({money(profit.offers.filter((o) => o.units === 0).reduce((t, o) => t + o.ads + o.fees, 0), cur)})
                </summary>
                <table className="t tabnum" style={{ margin: "8px 0 0" }}>
                  <thead><tr><th style={{ textAlign: "left" }}>Offer</th><th>Ads</th><th>Fees</th></tr></thead>
                  <tbody>
                    {profit.offers.filter((o) => o.units === 0).sort((x, y) => y.ads + y.fees - (x.ads + x.fees)).map((o) => (
                      <tr key={o.offerId}>
                        <td style={{ textAlign: "left", maxWidth: 360, overflowWrap: "anywhere" }}>{/^Offer [0-9a-f-]{20,}$/i.test(o.name) ? `Unnamed offer ending ${o.offerId.slice(-6)}` : o.name}</td>
                        <td>{money(o.ads, cur)}</td><td>{money(o.fees, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="sub" style={{ fontSize: 12, margin: "8px 0 0" }}>Allegro splits campaign charges equally over every offer, even ones that did not sell. These are listed here so they do not crowd the table above.</p>
              </details>
            )}
          </Card>
          {profit.offers.some((o) => o.paid) && (
            <Card style={{ overflowX: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="h2" style={{ margin: 0 }}>Paid vs organic <span className="eyebrow" style={{ marginLeft: 8 }}>From your Allegro Ads report</span></h2>
              <table className="t tabnum">
                <thead><tr><th style={{ textAlign: "left" }}>Offer</th><th>Units sold</th><th>Ad clicks</th><th>Sold through ads</th><th>Organic</th><th>Ads share</th><th>Sales per click</th><th>Ad cost per sale</th></tr></thead>
                <tbody>{profit.offers.filter((o) => o.paid).map((o) => (
                  <tr key={o.offerId}>
                    <td style={{ textAlign: "left", maxWidth: 260, overflowWrap: "anywhere" }}>{o.name}</td>
                    <td>{int(o.units)}</td><td>{int(o.paid!.clicks)}</td><td>{o.paid!.adUnits.toLocaleString("en-US", { maximumFractionDigits: 1 })}</td>
                    <td style={{ fontWeight: 600 }}>{o.paid!.organicUnits.toLocaleString("en-US", { maximumFractionDigits: 1 })}</td>
                    <td>{pct(o.paid!.adShare)}</td><td>{pct(o.paid!.adConversion, 1)}</td><td>{o.paid!.costPerAdSale === null ? "—" : money(o.paid!.costPerAdSale, cur)}</td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="sub" style={{ margin: 0, fontSize: 12 }}>Organic units are units sold minus the units Allegro credits to your ads, so they are sales you got without paying for a click. Allegro counts an ad sale when a shopper clicked the ad first, so the ad figure can exceed units sold in a short period; organic is then shown as 0. The report covers one date range, so for a shorter period its figures are spread evenly over the days.</p>
            </Card>
          )}
          <Card id="pricing" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <h2 className="h2" style={{ margin: 0 }}>Price and sourcing advisor</h2>
              <p className="sub" style={{ margin: "4px 0 0", fontSize: 13 }}>See what a different selling price, or a cheaper next shipment, would do to an offer&apos;s profit given what you spend on ads. Drag the sliders, or ask the AI for a suggestion.</p>
            </div>
            {pricingModels.length === 0
              ? <p className="sub" style={{ margin: 0 }}>Enter a cost per unit for an offer that sold in this period (in the table above) and it appears here.</p>
              : <PricingAdvisor models={pricingModels} currency={cur} period={{ days: sp.days, from: sp.from, to: sp.to }} />}
          </Card>
          <Card id="ads-report" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="h2" style={{ margin: 0 }}>Exact ad cost per offer</h2>
            <p className="sub" style={{ margin: 0, fontSize: 13 }}>
              {adImports.length === 0
                ? "Allegro does not say which listing each ad charge belongs to, so ad cost is split equally across your offers. For the exact figures, open Allegro Ads, download the campaign report (Excel or CSV) or copy the table (it has “Koszt brutto” per clicked offer), and add it here."
                : "Imported reports give each offer its real ad cost. Ad charges the report does not cover are still split equally."}
            </p>
            <form action={importAdsReport} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input type="hidden" name="qs" value={qs} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="eyebrow">Report covers</span>
                <input type="date" name="from" className="field" required aria-label="First day" defaultValue={start} style={{ padding: "5px 8px" }} />
                <span className="eyebrow">to</span>
                <input type="date" name="to" className="field" required aria-label="Last day" defaultValue={endDate} style={{ padding: "5px 8px" }} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input type="file" name="file" accept=".xlsx,.csv,.tsv,.txt" className="field" aria-label="Report file" style={{ padding: "5px 8px" }} />
                <span className="eyebrow">or paste the table</span>
              </div>
              <textarea name="text" rows={3} className="field" placeholder="Paste the table copied from Allegro Ads, including the header row" aria-label="Pasted report" style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12 }} />
              <div><Button variant="outline" size="sm">Import report</Button></div>
            </form>
            {adImports.length > 0 && (
              <table className="t tabnum">
                <thead><tr><th style={{ textAlign: "left" }}>Imported report</th><th>Offers</th><th>Gross cost</th><th /></tr></thead>
                <tbody>{adImports.map((b) => (
                  <tr key={b.batchId}>
                    <td style={{ textAlign: "left" }}>{b.from} to {b.to}</td><td>{int(b.offers)}</td><td>{money(b.cost, cur)}</td>
                    <td><form action={deleteAdsReport}><input type="hidden" name="qs" value={qs} /><input type="hidden" name="batch" value={b.batchId} /><Button variant="ghost" size="sm">Remove</Button></form></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>The report has one total for its whole date range, so its cost is spread evenly over those days when you view a shorter period.</p>
          </Card>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Profit = net sales − Allegro fees − ads − cost of goods. ACoS is ad cost as a share of net sales; break-even ACoS is the highest it could be before the offer stops making money. Allegro does not tie campaign charges, delivery fees or the subscription to one offer, so they are split across the offers that sold: ads equally per offer (the average ad spend per offer), the subscription by share of sales, delivery by share of units. Hover a Fees or Ads figure to see how much of it is shared. If offer detail is empty, open Connections → Allegro and click Sync now once.</p>
        </section>
      )}
      </Step>
      )}
      </StepFlow>
    </>
  );
}
