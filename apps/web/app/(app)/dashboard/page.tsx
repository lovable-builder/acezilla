import Link from "next/link";
import { cookies } from "next/headers";
import { adviseCampaign, roasTone, todaysDecisions, buildAttribution, buildChannels, buildDashboard, buildInsights, buildStoreSales, shiftDate, storeRoas, type SalesChannelRow, type DailyRow, type OrderRow, type ProductRow, type StockLevel, type StoreSales } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueChart, Sparkline } from "@/components/dash/charts";
import { PeriodBar } from "@/components/dash/period-bar";
import { parsePeriod, parseSavedView } from "@/lib/period";
import { loadCampaignLinks, loadProducts, loadVatRate, netAdRows, netOfVat } from "@/lib/data";
import { resolveCampaignProducts } from "@/lib/campaign-products";
import { linkCampaignProduct } from "./link-actions";
import { Term } from "@/components/app/term";
import { Checklist } from "@/components/app/checklist";
import { ClaimedVsReal, CountUp, RoasGauge, SpendDonut } from "@/components/dash/gadgets";
import { ago } from "@/lib/format";
import { generateWeeklySummary } from "./summary-actions";
import { compact, delta, int, money, PLATFORM, x } from "@/lib/format";

const PAGE = 1000;
const tone = (good: boolean | null, dv: number | null) => dv === null || good === null ? "var(--ink3)" : (dv >= 0) === good ? "var(--pos)" : "var(--neg)";

/** Listed products per connected store (sold vs not sold) and the best sellers, with a link to the full list. */
function ProductsOverview({ rows, cur, stores }: { rows: ProductRow[]; cur: string; stores: string[] }) {
  if (stores.length === 0) return null;
  const top = rows.filter((r) => r.revenue > 0).slice(0, 5);
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Products <span className="eyebrow" style={{ marginLeft: 8 }}>Listed in your stores</span></h2>
        <Link href="/products" className="link" style={{ marginLeft: "auto" }}>See all products →</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stores.map((ch, i) => {
            const listed = rows.filter((r) => r.channel === ch && r.listed), sold = listed.filter((r) => r.units > 0).length;
            return (
              <div key={ch}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><b style={{ fontWeight: 600 }}>{CHANNEL_LABEL[ch] ?? ch}</b><span className="mono tabnum" style={{ color: "var(--ink3)" }}>{listed.length === 0 ? "no products received yet" : `${sold} of ${listed.length} sold`}</span></div>
                <div style={{ height: 10, borderRadius: 5, background: "var(--line)", overflow: "hidden", marginTop: 4 }}>
                  <div className="grow" style={{ "--i": i, width: listed.length ? `${(sold / listed.length) * 100}%` : "0%", height: "100%", background: "var(--accent)", borderRadius: 5 } as React.CSSProperties} />
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Best sellers</div>
          {top.length === 0 ? <p className="sub" style={{ margin: 0, fontSize: 13 }}>No product sales in this period.</p> : (
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {top.map((r) => <li key={`${r.channel}|${r.productId}`} style={{ fontSize: 13 }}><span style={{ overflowWrap: "anywhere" }}>{r.name}</span> <span className="mono tabnum" style={{ color: "var(--ink3)" }}>· {CHANNEL_LABEL[r.channel] ?? r.channel} · {int(r.units)} sold · {money(r.revenue, cur)}</span></li>)}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}

const ADVICE_CHIP: Record<string, string> = { stop: "missing", scale: "good", restore: "good", watch: "attention", too_early: "not_measured", paused: "not_measured" };

/** The campaigns that need a person today. Suggestions only: acezilla never changes a live campaign. */
function Decisions({ campaigns, cur }: { campaigns: { campaignId: string; name: string; platform: string; status: string; spend: number; roas: number | null; stock?: StockLevel; productName?: string }[]; cur: string }) {
  const list = todaysDecisions(campaigns.filter((c) => c.platform !== "allegro").map((c) => ({ ...c })), { currency: cur });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Today&apos;s decisions</h2>
        <span className="eyebrow">Suggestions. You change campaigns in the ad platform.</span>
      </div>
      {list.length === 0 ? <p className="sub" style={{ margin: 0 }}>Nothing needs a decision right now.</p> : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(({ campaign: c, advice: a }, i) => (
            <li key={c.campaignId} className="rise" style={{ "--i": i, display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" } as React.CSSProperties}>
              <span className={`seo-chip seo-chip-${ADVICE_CHIP[a.kind]}`} style={{ flexShrink: 0 }}>{a.label}</span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <b style={{ fontWeight: 600 }}>{c.name}</b> <span className="eyebrow">{PLATFORM[c.platform]?.label ?? c.platform} · {money(c.spend, cur)} spent{c.productName ? ` · sells ${c.productName.slice(0, 50)}` : ""}</span>
                <div className="sub" style={{ margin: 0, fontSize: 13 }}>{a.reason}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const CHANNEL_LABEL: Record<string, string> = { woocommerce: "WooCommerce", allegro: "Allegro", shopify: "Shopify", other: "Other" };

/** Every connected store or marketplace, including ones with no orders yet, so a connected store never looks missing. */
function ChannelsCard({ channels, cur }: { channels: SalesChannelRow[]; cur: string }) {
  return (
    <Card style={{ overflowX: "auto" }}>
      <h2 className="h2"><span className="n">A</span>Where orders were placed <span className="eyebrow" style={{ marginLeft: 8 }}>Your connected stores</span></h2>
      <table className="t tabnum">
        <thead><tr><th style={{ textAlign: "left" }}>Store</th><th>Orders</th><th>Revenue</th><th>Share</th></tr></thead>
        <tbody>{channels.map((c) => (
          <tr key={c.channel}>
            <td style={{ textAlign: "left" }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, marginRight: 8, background: c.channel === "other" ? "var(--line2)" : "var(--pos)" }} />
              {CHANNEL_LABEL[c.channel] ?? c.channel}
              {c.orders === 0 && <span className="sub" style={{ marginLeft: 8, fontSize: 12 }}>connected, no orders in this period</span>}
            </td>
            <td>{int(c.orders)}</td><td>{money(c.revenue, cur)}</td><td>{(c.share * 100).toFixed(0)}%</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  );
}

function StoreBlock({ store, cur, spendByDate, adSpend, platformRoas, compare, channels }: { compare: boolean; channels: SalesChannelRow[]; store: StoreSales; cur: string; spendByDate: Map<string, number> | null; adSpend: number | null; platformRoas: number | null }) {
  const sRoas = adSpend ? storeRoas(store.revenue.value, adSpend) : null;
  const cells = [
    { label: "Store revenue", v: money(store.revenue.value, cur), d: store.revenue.deltaPct, good: true as boolean | null, s: store.revenue.series },
    { label: "Orders", v: int(store.orders.value), d: store.orders.deltaPct, good: true, s: store.orders.series },
    { label: "Average order", v: store.orders.value > 0 ? money(store.aov.value, cur) : "—", d: store.aov.deltaPct, good: true, s: store.aov.series },
    ...(sRoas !== null ? [{ label: "Store ROAS", v: x(sRoas), d: null as number | null, good: null, s: [] as number[] }] : []),
  ];
  const chart = store.series.map((p) => ({ date: p.date, revenue: p.revenue, spend: spendByDate?.get(p.date) ?? 0 }));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Store sales <span className="eyebrow" style={{ marginLeft: 8 }}>Real orders from your store</span></h2>
      <div className="kpis">
        {cells.map((c) => (
          <div className="kpi" key={c.label}>
            <span className="eyebrow"><Term>{c.label}</Term></span>
            <span className="tabnum" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.v}</span>
            {c.label === "Store ROAS"
              ? <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{x(platformRoas)} platform-reported</span>
              : <span className="mono tabnum" style={{ fontSize: 12, color: tone(c.good, c.d) }}>{compare ? delta(c.d) : " "}</span>}
            {c.s.length > 0 && <Sparkline data={c.s} color="var(--accent)" />}
          </div>
        ))}
      </div>
      {channels.length > 0 && <ChannelsCard channels={channels} cur={cur} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 24 }}>
        <Card>
          <h2 className="h2"><span className="n">B</span>{spendByDate ? "Store revenue vs ad spend" : "Store revenue"}</h2>
          <RevenueChart series={chart} />
          <div className="eyebrow" style={{ display: "flex", gap: 16, marginTop: 6 }}><span style={{ color: "var(--accent-ink)" }}>— Store revenue</span>{spendByDate && <span>- - Ad spend</span>}</div>
        </Card>
        <Card style={{ overflowX: "auto" }}>
          <h2 className="h2"><span className="n">C</span>Marketing sources <span className="eyebrow" style={{ marginLeft: 8 }}>What sent the customer</span></h2>
          {store.sources.length === 0 ? <p className="sub">No orders in this period.</p> : (
            <table className="t tabnum">
              <thead><tr><th style={{ textAlign: "left" }}>Source</th><th>Orders</th><th>Revenue</th><th>Share</th></tr></thead>
              <tbody>{store.sources.slice(0, 8).map((r) => (
                <tr key={r.source}><td style={{ textAlign: "left", textTransform: "capitalize" }}>{r.source}</td><td>{int(r.orders)}</td><td>{money(r.revenue, cur)}</td><td>{(r.share * 100).toFixed(0)}%</td></tr>
              ))}</tbody>
            </table>
          )}
          {store.taggedShare !== null && <p className="sub" style={{ fontSize: 12, marginBottom: 0 }}>{(store.taggedShare * 100).toFixed(0)}% of orders carry a marketing source.{store.taggedShare < 0.3 ? " That is low. Make sure WooCommerce order attribution is on and your ads use UTM tags." : ""}</p>}
        </Card>
      </div>
    </section>
  );
}

function Sources({ ads, stores }: { ads: string[]; stores: string[] }) {
  const chip = (label: string, names: string[], href: string, hint: string) => (
    <Link href={href} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 999, padding: "4px 12px", fontSize: 13, background: "var(--surface)" }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: names.length ? "var(--pos)" : "var(--line2)" }} />
      <span className="eyebrow">{label}</span>
      <span style={{ color: names.length ? "var(--ink)" : "var(--ink3)" }}>{names.length ? names.join(", ") : hint}</span>
    </Link>
  );
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {chip("Ads", ads, "/connections", "No ad platform yet")}
      {chip("Store", stores, "/connections", "No store yet")}
      <Link href="/connections" className="eyebrow" style={{ color: "var(--accent-ink)" }}>Manage connections</Link>
    </div>
  );
}

export default async function CommandCenter({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; compare?: string }> }) {
  const sp = await searchParams;
  const saved = sp.days || sp.from || sp.to ? {} : parseSavedView((await cookies()).get("az_view")?.value);
  const period = parsePeriod({ ...sp, ...saved });
  const compare = (sp.compare ?? saved.compare) !== "0";
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>No workspace found for this account.</Card>;

  const rows: DailyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("campaign_daily").select("*").eq("workspace_id", current.id)
      .order("date", { ascending: false }).range(from, from + PAGE - 1);
    if (error) return <Card style={{ color: "var(--neg)" }}>Could not load data: {error.message}</Card>;
    for (const r of data ?? []) rows.push({
      campaignId: r.campaign_id, campaignName: r.campaign_name, platform: r.platform, status: r.status, date: r.date,
      spend: Number(r.spend), impressions: Number(r.impressions), clicks: Number(r.clicks), conversions: Number(r.conversions), revenue: Number(r.revenue),
    });
    if ((data?.length ?? 0) < PAGE) break;
  }

  const orderRows: OrderRow[] = [];
  const sinceDate = shiftDate(period.endDate ?? new Date().toISOString().slice(0, 10), -(2 * period.windowDays + (period.endDate ? 2 : 14)));
  const since = `${sinceDate}T00:00:00Z`;
  for (let from = 0; from < 30 * PAGE; from += PAGE) {
    const { data } = await supabase.from("order").select("external_id,created_at,revenue,utm,click_ids,customer_id").eq("workspace_id", current.id).gte("created_at", since).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    for (const r of data ?? []) orderRows.push({ externalId: r.external_id as string, createdAt: r.created_at as string, revenue: Number(r.revenue), customerId: (r.customer_id as string | null) ?? null, utm: (r.utm as Record<string, string> | null) ?? null, clickIds: (r.click_ids as Record<string, string> | null) ?? null });
    if ((data?.length ?? 0) < PAGE) break;
  }
  const vat = await loadVatRate(supabase, current.id);
  orderRows.splice(0, orderRows.length, ...netOfVat(orderRows, vat));
  rows.splice(0, rows.length, ...netAdRows(rows, vat));
  // The previous period is only a fair comparison when we have data that far back. Orders and ads are imported for a limited time.
  const firstData = [...orderRows.map((o) => o.createdAt.slice(0, 10)), ...rows.map((r) => r.date)].reduce<string | null>((m, x) => (m === null || x < m ? x : m), null);
  const hasHistory = (end: string, days: number) => firstData !== null && firstData <= shiftDate(end, -(2 * days - 1));
  const { data: allConns } = await supabase.from("connection").select("platform").eq("workspace_id", current.id);
  const storeConns = (allConns ?? []).filter((c) => ["woocommerce", "allegro", "shopify"].includes(c.platform as string));
  const connectedStores = storeConns.map((c) => c.platform as string);
  const adsConnected = (allConns ?? []).some((c) => ["meta", "google", "tiktok"].includes(c.platform as string));
  const storeNames = storeConns.map((c) => PLATFORM[c.platform as string]?.label ?? (c.platform as string).replace(/^./, (m) => m.toUpperCase()));
  const { data: wooConn } = await supabase.from("connection").select("last_error,stats").eq("workspace_id", current.id).eq("platform", "woocommerce").maybeSingle();
  const currencyWarning = (wooConn?.last_error as string | null)?.startsWith("Your store sells in") ? (wooConn!.last_error as string) : null;
  const skippedMap = ((wooConn?.stats as { skipped_orders?: Record<string, string> } | null)?.skipped_orders) ?? {};
  const skippedCounts = Object.values(skippedMap).reduce<Record<string, number>>((a, r) => { a[r] = (a[r] ?? 0) + 1; return a; }, {});
  const skippedTotal = Object.values(skippedCounts).reduce((a, n) => a + n, 0);
  const skippedCard = wooConn && orderRows.length === 0 && skippedTotal > 0 && (
    <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 240 }}>Your store sent {skippedTotal} order{skippedTotal === 1 ? "" : "s"}, but none count as sales yet: {Object.entries(skippedCounts).map(([k, n]) => `${n} ${k}`).join(", ")}. Completed, processing and on-hold orders count.</span>
      <Button asChild variant="outline"><Link href="/connections/woocommerce">Details</Link></Button>
    </Card>
  );
  const warningCard = currencyWarning && (
    <Card style={{ borderColor: "var(--warn)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 220 }}>{currencyWarning}</span>
      <Button asChild variant="outline"><Link href="/connections/woocommerce">Fix currency</Link></Button>
    </Card>
  );

  const productsFor = async (end: string, days: number): Promise<ProductRow[]> => (connectedStores.length ? (await loadProducts(supabase, current.id, shiftDate(end, -(days - 1)), end)).rows : []);
  const checklist = (
    <Checklist steps={[
      { title: "Connect your store", hint: "WooCommerce or Allegro. This is how acezilla sees real orders.", done: storeConns.length > 0, href: "/connections", cta: "Connect a store" },
      { title: "Connect an ad platform", hint: "Meta or Google Ads. This brings in your spend and campaigns.", done: adsConnected, href: "/connections", cta: "Connect ads" },
      { title: "Make sure the currency matches", hint: currencyWarning ?? "Your store and ad accounts should use the same currency.", done: !currencyWarning && (storeConns.length > 0 || adsConnected), href: "/connections/woocommerce", cta: "Fix currency" },
    ]} />
  );

  if (rows.length === 0 && orderRows.length > 0) {
    const cur0 = current.currency;
    const store0 = buildStoreSales(orderRows, { windowDays: period.windowDays, endDate: period.endDate });
    const prod0 = await productsFor(store0.endDate, store0.windowDays);
    return (
      <>
        <PeriodBar path="/dashboard" active={period.days} custom={period.custom} compare={compare} />
        <div>
          <div className="eyebrow">Overview · last {store0.windowDays} days to {store0.endDate}</div>
          <h1 className="page">Your store made {money(store0.revenue.value, cur0)} from {int(store0.orders.value)} order{store0.orders.value === 1 ? "" : "s"}.</h1>
          <p className="sub">Connect an ad account to see how your ad spend compares with this revenue.</p>
        </div>
        <Sources ads={[]} stores={storeNames} />
        {checklist}
        {warningCard}
        <StoreBlock channels={buildChannels(orderRows, { connected: connectedStores, windowDays: store0.windowDays, endDate: store0.endDate })} compare={compare && hasHistory(store0.endDate, store0.windowDays)} store={store0} cur={cur0} spendByDate={null} adSpend={null} platformRoas={null} />
        <ProductsOverview rows={prod0} cur={cur0} stores={connectedStores} />
        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}><b>Next: connect an ad platform.</b> Your store is connected, so this page already shows real sales. Add Meta or Google Ads to see what your ad spend returns.</span>
          <Button asChild><Link href="/connections">Connect an ad platform</Link></Button>
        </Card>
      </>
    );
  }

  if (rows.length === 0) {
    const prodE = await productsFor(period.endDate ?? new Date().toISOString().slice(0, 10), period.windowDays);
    return (
      <>
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="page">Command center</h1>
          <p className="sub">Connect an ad account or your store to get your first briefing.</p>
        </div>
        {skippedCard}
        {connectedStores.length > 0 && <ChannelsCard cur={current.currency} channels={buildChannels([], { connected: connectedStores, windowDays: period.windowDays, endDate: period.endDate ?? new Date().toISOString().slice(0, 10) })} />}
        <ProductsOverview rows={prodE} cur={current.currency} stores={connectedStores} />
        {checklist}
        <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <b>Two connections give you the full picture</b>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}><div className="eyebrow">1 · Ad platform</div><div className="sub" style={{ margin: "4px 0 0", fontSize: 13 }}>Meta or Google Ads. Shows what you spend and what the platforms report.</div></div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}><div className="eyebrow">2 · Store or marketplace</div><div className="sub" style={{ margin: "4px 0 0", fontSize: 13 }}>WooCommerce or Allegro. Shows real orders, so ROAS is measured on sales that happened.</div></div>
          </div>
          <div><Button asChild><Link href="/connections">Go to Connections</Link></Button></div>
        </Card>
      </>
    );
  }

  const d = buildDashboard(rows, { windowDays: period.windowDays, endDate: period.endDate });
  const cur = current.currency;
  const k = d.kpis;
  const store = orderRows.length > 0 ? buildStoreSales(orderRows, { endDate: d.endDate, windowDays: d.windowDays }) : null;
  const spendByDate = new Map(d.series.map((p) => [p.date, p.spend]));
  const roasUp = k.roas.deltaPct !== null && k.roas.deltaPct >= 0;
  const hasPrev = hasHistory(d.endDate, d.windowDays);
  const cmp = compare && hasPrev;
  // Allegro does not report revenue per ad, so with only Allegro the "platform" revenue and ROAS are nothing, not zero.
  const reporting = d.platforms.some((p) => p.platform !== "allegro");
  const storeRoasNow = store && k.spend.value > 0 ? storeRoas(store.revenue.value, k.spend.value) : null;
  const allCells = [
    { label: "Spend", v: money(k.spend.value, cur), raw: k.spend.value, kind: "money" as const, d: k.spend.deltaPct, good: null, s: k.spend.series },
    { label: "Revenue", v: money(k.revenue.value, cur), raw: k.revenue.value, kind: "money" as const, d: k.revenue.deltaPct, good: true, s: k.revenue.series },
    { label: "Blended ROAS", v: x(k.roas.value), raw: k.roas.value, kind: "x" as const, d: k.roas.deltaPct, good: true, s: k.roas.series },
    { label: "CPA", v: k.conversions.value > 0 ? money(k.cpa.value, cur) : "—", raw: k.conversions.value > 0 ? k.cpa.value : null, kind: "money" as const, d: k.cpa.deltaPct, good: false, s: k.cpa.series },
    { label: "Conversions", v: int(k.conversions.value), raw: k.conversions.value, kind: "int" as const, d: k.conversions.deltaPct, good: true, s: k.conversions.series },
  ];

  const cells = reporting ? allCells : allCells.slice(0, 1);
  const winStart = shiftDate(d.endDate, -(d.windowDays - 1));
  const inWindow = orderRows.filter((x) => x.createdAt.slice(0, 10) >= winStart && x.createdAt.slice(0, 10) <= d.endDate);
  const attr = buildAttribution({ platforms: d.platforms, campaigns: d.campaigns, orders: inWindow, nonReporting: ["allegro"] });
  const { data: summaryRow } = await supabase.from("ai_summary").select("day,content").eq("workspace_id", current.id).eq("kind", "weekly").order("day", { ascending: false }).limit(1).maybeSingle();
  const summary = summaryRow && Date.now() - new Date(`${summaryRow.day}T00:00:00Z`).getTime() < 8 * 86400000 ? (summaryRow.content as { headline?: string; highlights?: string[]; watch?: string[]; nextSteps?: string[]; unverified?: string[]; error?: string }) : null;
  const prodRows = await productsFor(d.endDate, d.windowDays);
  const campaignLinks = connectedStores.length ? await loadCampaignLinks(supabase, current.id) : new Map<string, { channel: string; productId: string }>();
  const cp = resolveCampaignProducts(d.campaigns.map((c) => ({ campaignId: c.campaignId, name: c.name, platform: c.platform })), prodRows, campaignLinks);
  // Insights that compare with the previous period are left out when there is no history that far back.
  const insights = buildInsights(d, store, { money: (n) => money(n, cur), nonReporting: ["allegro"] }).filter((i) => hasPrev || !["store-revenue", "spend-up-sales-flat", "aov"].includes(i.id));

  return (
    <>
      <PeriodBar path="/dashboard" active={period.days} custom={period.custom} compare={compare} />
      <div>
        <div className="eyebrow">Overview · last {d.windowDays} days to {d.endDate}</div>
        <h1 className="page">
          {!reporting
            ? <>You spent {money(k.spend.value, cur)} on ads{store ? <> and your store made {money(store.revenue.value, cur)}{storeRoasNow !== null ? ` — ${x(storeRoasNow)} back for every 1 spent.` : "."}</> : "."}</>
            : <>You spent {money(k.spend.value, cur)} and made {money(k.revenue.value, cur)}
              {k.roas.deltaPct === null || !cmp
                ? ` — blended ROAS is ${x(k.roas.value)}.`
                : ` — ROAS is ${roasUp ? "up" : "down"} ${delta(k.roas.deltaPct).replace(/^[+−]/, "")} on the previous period.`}</>}
        </h1>
        <p className="sub">{!reporting ? "Allegro does not report revenue per ad, so your ads are judged against your real store sales." : store ? "Ad figures are platform-reported. Store sales are your real orders, so Store ROAS is the honest return on your ad spend." : "Platform-reported figures. Connect your store to compare them with real orders."}</p>
        {compare && !hasPrev && firstData && <p className="sub" style={{ fontSize: 13 }}>Changes against the previous period are hidden: your data starts on {firstData}, so the previous period is incomplete. Choose a shorter period to compare.</p>}
      </div>
      <Sources ads={d.platforms.map((p) => (p.platform === "allegro" ? "Allegro Ads" : PLATFORM[p.platform]?.label ?? p.platform))} stores={storeNames} />
      {checklist}
      {warningCard}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        <div className="gadget rise" style={{ "--i": 0 } as React.CSSProperties}>
          <h2 className="h2" style={{ margin: 0 }}><Term k="Store ROAS">Return on ad spend</Term></h2>
          <RoasGauge real={storeRoasNow} claimed={reporting ? k.roas.value : null} />
        </div>
        <div className="gadget rise" style={{ "--i": 1 } as React.CSSProperties}>
          <h2 className="h2" style={{ margin: 0 }}>Where the money goes</h2>
          <SpendDonut total={k.spend.value} cur={cur} parts={d.platforms.filter((p) => p.spend > 0).map((p) => ({ label: PLATFORM[p.platform]?.label ?? p.platform, value: p.spend, color: PLATFORM[p.platform]?.color ?? "var(--ink3)" }))} />
        </div>
        {store && (
          <div className="gadget rise" style={{ "--i": 2 } as React.CSSProperties}>
            <h2 className="h2" style={{ margin: 0 }}>{reporting ? "Claimed vs real sales" : "Ad cost vs store sales"}</h2>
            {reporting
              ? <ClaimedVsReal claimed={k.revenue.value} real={store.revenue.value} cur={cur} />
              : <ClaimedVsReal claimed={k.spend.value} real={store.revenue.value} cur={cur} aLabel="Ad spend" bLabel="Store sales" note={store.revenue.value > 0 ? `Ads cost ${((k.spend.value / store.revenue.value) * 100).toFixed(0)}% of store sales. That share is your ACoS.` : "No store sales in this period."} />}
          </div>
        )}
      </div>

      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Weekly summary</h2>
          {summaryRow && <span className="eyebrow">written {ago(`${summaryRow.day}T12:00:00Z`)}</span>}
          <form action={generateWeeklySummary} style={{ marginLeft: "auto" }}><Button variant="outline" size="sm">{summary && !summary.error ? "Rewrite" : "Write this week's summary"}</Button></form>
        </div>
        {summary?.error && <div style={{ color: "var(--neg)", fontSize: 13 }}>{summary.error}</div>}
        {summary && !summary.error && summary.headline && (
          <>
            <b style={{ fontWeight: 600 }}>{summary.headline}</b>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>{(summary.highlights ?? []).map((h) => <li key={h}>{h}</li>)}</ul>
            {(summary.watch ?? []).length > 0 && <div><div className="eyebrow" style={{ color: "var(--warn)" }}>Keep an eye on</div><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{summary.watch!.map((h) => <li key={h}>{h}</li>)}</ul></div>}
            {(summary.nextSteps ?? []).length > 0 && <div><div className="eyebrow">This week, try</div><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{summary.nextSteps!.map((h) => <li key={h}>{h}</li>)}</ul></div>}
            {(summary.unverified ?? []).length > 0 && <div style={{ fontSize: 12, color: "var(--warn)" }}>Check before relying on this: {summary.unverified!.join(", ")} could not be matched to your data.</div>}
          </>
        )}
        {!summary && <div className="sub" style={{ margin: 0 }}>A short, plain-language summary of the last 7 days written from your numbers. It is written when you ask, so opening this page never costs anything.</div>}
      </Card>

      <Decisions campaigns={d.campaigns.map((c) => ({ ...c, stock: cp.get(c.campaignId)?.stock, productName: cp.get(c.campaignId)?.product.name }))} cur={cur} />

      <Card>
        <h2 className="h2"><span className="n">··</span>Insights</h2>
        {insights.length === 0 ? <p className="sub">Nothing stands out in this period. Pick a longer period or a different range for more.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {insights.map((i) => (
              <li key={i.id} style={{ display: "flex", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, flexShrink: 0, background: i.tone === "bad" ? "var(--neg)" : i.tone === "warn" ? "var(--warn)" : i.tone === "good" ? "var(--pos)" : "var(--accent)" }} />
                <div><b style={{ fontWeight: 600 }}>{i.title}</b><div className="sub" style={{ margin: 0, fontSize: 13 }}>{i.detail}</div></div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Ad performance <span className="eyebrow" style={{ marginLeft: 8 }}>{reporting ? "As reported by the ad platforms" : "Allegro does not report revenue per ad"}</span></h2>
      <div className="kpis">
        {cells.map((c, i) => (
          <div className="kpi rise" style={{ "--i": i } as React.CSSProperties} key={c.label}>
            <span className="eyebrow"><Term>{c.label}</Term></span>
            <span className="tabnum" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.raw === null ? c.v : <CountUp value={c.raw} kind={c.kind} cur={cur} />}</span>
            <span className="mono tabnum" style={{ fontSize: 12, color: tone(c.good, c.d) }}>{cmp ? delta(c.d) : " "}</span>
            <Sparkline data={c.s} color={c.good === null ? "var(--ink3)" : "var(--accent)"} />
          </div>
        ))}
      </div>

      {store ? <StoreBlock channels={buildChannels(orderRows, { connected: connectedStores, windowDays: d.windowDays, endDate: d.endDate })} store={store} cur={cur} spendByDate={spendByDate} adSpend={k.spend.value} platformRoas={reporting ? k.roas.value : null} compare={cmp} /> : connectedStores.length > 0 && <ChannelsCard cur={cur} channels={buildChannels([], { connected: connectedStores, windowDays: d.windowDays, endDate: d.endDate })} />}
      <ProductsOverview rows={prodRows} cur={cur} stores={connectedStores} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 24 }}>
        <Card>
          <h2 className="h2"><span className="n">01</span>Revenue vs spend</h2>
          <RevenueChart series={d.series} />
          <div className="eyebrow" style={{ display: "flex", gap: 16, marginTop: 6 }}>
            <span style={{ color: "var(--accent-ink)" }}>— Revenue</span><span>- - Spend</span>
          </div>
        </Card>
        <Card>
          <h2 className="h2"><span className="n">02</span>Anomalies</h2>
          {d.anomalies.length === 0 ? <p className="sub">Nothing unusual in the last two weeks.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {d.anomalies.map((a) => (
                <li key={a.campaignId} style={{ display: "flex", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0, background: a.severity === "high" ? "var(--neg)" : "var(--warn)" }} />
                  <div><b style={{ fontWeight: 600 }}>{a.title}</b><div className="sub" style={{ margin: 0, fontSize: 13 }}>{a.detail}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="h2"><span className="n">03</span>By platform</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          {d.platforms.map((p) => (
            <div key={p.platform} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: PLATFORM[p.platform]?.color }} />
                <b style={{ fontWeight: 600 }}>{PLATFORM[p.platform]?.label ?? p.platform}</b>
              </div>
              <div className="tabnum" style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>{money(p.spend, cur)}</div>
              <div className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{p.platform === "allegro" ? "revenue per ad not reported" : `${x(p.roas)} platform · ${compact(p.revenue)} rev`}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ overflowX: "auto" }}>
        <h2 className="h2"><span className="n">04</span>Campaigns</h2>
        <table className="t tabnum">
          <thead><tr><th>Campaign</th><th>Spend</th><th><Term>Platform ROAS</Term></th><th><Term>Modeled ROAS</Term></th><th><Term>CPA</Term></th><th>Status</th>{connectedStores.length > 0 && <th style={{ textAlign: "left" }}>Product</th>}<th style={{ textAlign: "left" }}>What to do</th></tr></thead>
          <tbody>
            {d.campaigns.map((c) => (
              <tr key={c.campaignId}>
                <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 8, background: PLATFORM[c.platform]?.color }} />{c.name}</td>
                <td>{money(c.spend, cur)}</td>
                <td style={{ color: ({ good: "var(--pos)", ok: "var(--warn)", bad: "var(--neg)", none: "var(--ink3)" } as const)[roasTone(c.roas)], fontWeight: 600 }} title="Green from 2x, amber from 1x, red below 1x">{c.platform === "allegro" ? <span className="sub" style={{ fontSize: 12, fontWeight: 400 }}>not reported</span> : x(c.roas)}</td>
                {(() => { const m = attr.campaigns.get(c.campaignId); return <td style={{ fontWeight: 600 }} title={m ? `${m.orders} store orders tagged with this campaign` : "No store orders are tagged with this campaign's name (utm_campaign)"}>{m?.modeledRoas == null ? "—" : x(m.modeledRoas)}</td>; })()}
                <td>{c.cpa === null ? "—" : money(c.cpa, cur)}</td>
                <td style={{ color: c.status === "active" ? "var(--pos)" : "var(--ink3)" }}>{c.status}</td>
                {connectedStores.length > 0 && (() => {
                  const link = cp.get(c.campaignId); const listed = prodRows.filter((p) => p.listed);
                  const chip = link ? ({ out: ["missing", "Out of stock"], low: ["attention", "Low stock"], ok: ["good", "In stock"], unknown: ["not_measured", "Stock unknown"] } as const)[link.stock] : null;
                  return (
                    <td style={{ textAlign: "left", maxWidth: 260 }}>
                      {c.platform === "allegro" ? <span className="sub" style={{ fontSize: 12 }}>Many offers</span> : (
                        <details>
                          <summary style={{ cursor: "pointer", listStyle: "none" }}>
                            {link ? <><span style={{ overflowWrap: "anywhere" }}>{link.product.name.slice(0, 44)}</span> {chip && <span className={`seo-chip seo-chip-${chip[0]}`}>{chip[1]}</span>} <span className="eyebrow">{link.source === "auto" ? "suggested" : "linked"}</span></> : <span className="eyebrow" style={{ color: "var(--accent-ink)" }}>Link a product</span>}
                          </summary>
                          <form action={linkCampaignProduct} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            <input type="hidden" name="campaignId" value={c.campaignId} />
                            <select name="product" className="field" defaultValue={link ? `${link.product.channel}|${link.product.productId}` : ""} style={{ padding: "4px 8px", maxWidth: 220 }} aria-label="Product this campaign sells">
                              <option value="">No product</option>
                              {listed.slice(0, 300).map((p) => <option key={`${p.channel}|${p.productId}`} value={`${p.channel}|${p.productId}`}>{p.name.slice(0, 60)}</option>)}
                            </select>
                            <Button size="sm" variant="outline">Save</Button>
                          </form>
                        </details>
                      )}
                    </td>
                  );
                })()}
                {(() => { const a = c.platform === "allegro" ? null : adviseCampaign({ ...c, stock: cp.get(c.campaignId)?.stock }, { currency: cur }); return <td style={{ textAlign: "left" }} title={a?.reason}>{a ? <span className={`seo-chip seo-chip-${ADVICE_CHIP[a.kind]}`}>{a.label}</span> : <span className="sub" style={{ fontSize: 12 }}>—</span>}</td>; })()}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
