import Link from "next/link";
import { cookies } from "next/headers";
import { buildAttribution, buildChannels, buildDashboard, buildInsights, buildStoreSales, shiftDate, storeRoas, type SalesChannelRow, type DailyRow, type OrderRow, type StoreSales } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueChart, Sparkline } from "@/components/dash/charts";
import { PeriodBar } from "@/components/dash/period-bar";
import { parsePeriod, parseSavedView } from "@/lib/period";
import { Term } from "@/components/app/term";
import { Checklist } from "@/components/app/checklist";
import { ClaimedVsReal, CountUp, RoasGauge, SpendDonut } from "@/components/dash/gadgets";
import { ago } from "@/lib/format";
import { generateWeeklySummary } from "./summary-actions";
import { compact, delta, int, money, PLATFORM, x } from "@/lib/format";

const PAGE = 1000;
const tone = (good: boolean | null, dv: number | null) => dv === null || good === null ? "var(--ink3)" : (dv >= 0) === good ? "var(--pos)" : "var(--neg)";

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
        <StoreBlock channels={buildChannels(orderRows, { connected: connectedStores, windowDays: store0.windowDays, endDate: store0.endDate })} compare={compare} store={store0} cur={cur0} spendByDate={null} adSpend={null} platformRoas={null} />
        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}><b>Next: connect an ad platform.</b> Your store is connected, so this page already shows real sales. Add Meta or Google Ads to see what your ad spend returns.</span>
          <Button asChild><Link href="/connections">Connect an ad platform</Link></Button>
        </Card>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="page">Command center</h1>
          <p className="sub">Connect an ad account or your store to get your first briefing.</p>
        </div>
        {skippedCard}
        {connectedStores.length > 0 && <ChannelsCard cur={current.currency} channels={buildChannels([], { connected: connectedStores, windowDays: period.windowDays, endDate: period.endDate ?? new Date().toISOString().slice(0, 10) })} />}
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
  const cells = [
    { label: "Spend", v: money(k.spend.value, cur), raw: k.spend.value, kind: "money" as const, d: k.spend.deltaPct, good: null, s: k.spend.series },
    { label: "Revenue", v: money(k.revenue.value, cur), raw: k.revenue.value, kind: "money" as const, d: k.revenue.deltaPct, good: true, s: k.revenue.series },
    { label: "Blended ROAS", v: x(k.roas.value), raw: k.roas.value, kind: "x" as const, d: k.roas.deltaPct, good: true, s: k.roas.series },
    { label: "CPA", v: k.conversions.value > 0 ? money(k.cpa.value, cur) : "—", raw: k.conversions.value > 0 ? k.cpa.value : null, kind: "money" as const, d: k.cpa.deltaPct, good: false, s: k.cpa.series },
    { label: "Conversions", v: int(k.conversions.value), raw: k.conversions.value, kind: "int" as const, d: k.conversions.deltaPct, good: true, s: k.conversions.series },
  ];

  const winStart = shiftDate(d.endDate, -(d.windowDays - 1));
  const inWindow = orderRows.filter((x) => x.createdAt.slice(0, 10) >= winStart && x.createdAt.slice(0, 10) <= d.endDate);
  const attr = buildAttribution({ platforms: d.platforms, campaigns: d.campaigns, orders: inWindow, nonReporting: ["allegro"] });
  const { data: summaryRow } = await supabase.from("ai_summary").select("day,content").eq("workspace_id", current.id).eq("kind", "weekly").order("day", { ascending: false }).limit(1).maybeSingle();
  const summary = summaryRow && Date.now() - new Date(`${summaryRow.day}T00:00:00Z`).getTime() < 8 * 86400000 ? (summaryRow.content as { headline?: string; highlights?: string[]; watch?: string[]; nextSteps?: string[]; unverified?: string[]; error?: string }) : null;
  const insights = buildInsights(d, store, { money: (n) => money(n, cur), nonReporting: ["allegro"] });

  return (
    <>
      <PeriodBar path="/dashboard" active={period.days} custom={period.custom} compare={compare} />
      <div>
        <div className="eyebrow">Overview · last {d.windowDays} days to {d.endDate}</div>
        <h1 className="page">
          You spent {money(k.spend.value, cur)} and made {money(k.revenue.value, cur)}
          {k.roas.deltaPct === null || !compare
            ? ` — blended ROAS is ${x(k.roas.value)}.`
            : ` — ROAS is ${roasUp ? "up" : "down"} ${delta(k.roas.deltaPct).replace(/^[+−]/, "")} on the previous period.`}
        </h1>
        <p className="sub">{store ? "Ad figures are platform-reported. Store sales are your real orders, so Store ROAS is the honest return on your ad spend." : "Platform-reported figures. Connect your store to compare them with real orders."}</p>
      </div>
      <Sources ads={d.platforms.filter((p) => p.platform !== "allegro").map((p) => PLATFORM[p.platform]?.label ?? p.platform)} stores={storeNames} />
      {checklist}
      {warningCard}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        <div className="gadget rise" style={{ "--i": 0 } as React.CSSProperties}>
          <h2 className="h2" style={{ margin: 0 }}><Term k="Store ROAS">Return on ad spend</Term></h2>
          <RoasGauge real={store && k.spend.value > 0 ? storeRoas(store.revenue.value, k.spend.value) : null} claimed={k.roas.value} />
        </div>
        <div className="gadget rise" style={{ "--i": 1 } as React.CSSProperties}>
          <h2 className="h2" style={{ margin: 0 }}>Where the money goes</h2>
          <SpendDonut total={k.spend.value} cur={cur} parts={d.platforms.filter((p) => p.spend > 0).map((p) => ({ label: PLATFORM[p.platform]?.label ?? p.platform, value: p.spend, color: PLATFORM[p.platform]?.color ?? "var(--ink3)" }))} />
        </div>
        {store && (
          <div className="gadget rise" style={{ "--i": 2 } as React.CSSProperties}>
            <h2 className="h2" style={{ margin: 0 }}>Claimed vs real sales</h2>
            <ClaimedVsReal claimed={k.revenue.value} real={store.revenue.value} cur={cur} />
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

      <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Ad performance <span className="eyebrow" style={{ marginLeft: 8 }}>As reported by the ad platforms</span></h2>
      <div className="kpis">
        {cells.map((c, i) => (
          <div className="kpi rise" style={{ "--i": i } as React.CSSProperties} key={c.label}>
            <span className="eyebrow"><Term>{c.label}</Term></span>
            <span className="tabnum" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.raw === null ? c.v : <CountUp value={c.raw} kind={c.kind} cur={cur} />}</span>
            <span className="mono tabnum" style={{ fontSize: 12, color: tone(c.good, c.d) }}>{compare ? delta(c.d) : " "}</span>
            <Sparkline data={c.s} color={c.good === null ? "var(--ink3)" : "var(--accent)"} />
          </div>
        ))}
      </div>

      {store ? <StoreBlock channels={buildChannels(orderRows, { connected: connectedStores, windowDays: d.windowDays, endDate: d.endDate })} store={store} cur={cur} spendByDate={spendByDate} adSpend={k.spend.value} platformRoas={k.roas.value} compare={compare} /> : connectedStores.length > 0 && <ChannelsCard cur={cur} channels={buildChannels([], { connected: connectedStores, windowDays: d.windowDays, endDate: d.endDate })} />}

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
              <div className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{x(p.roas)} platform · {compact(p.revenue)} rev</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ overflowX: "auto" }}>
        <h2 className="h2"><span className="n">04</span>Campaigns</h2>
        <table className="t tabnum">
          <thead><tr><th>Campaign</th><th>Spend</th><th><Term>Platform ROAS</Term></th><th><Term>Modeled ROAS</Term></th><th><Term>CPA</Term></th><th>Status</th></tr></thead>
          <tbody>
            {d.campaigns.map((c) => (
              <tr key={c.campaignId}>
                <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 8, background: PLATFORM[c.platform]?.color }} />{c.name}</td>
                <td>{money(c.spend, cur)}</td>
                <td style={{ color: "var(--ink3)" }}>{x(c.roas)}</td>
                {(() => { const m = attr.campaigns.get(c.campaignId); return <td style={{ fontWeight: 600 }} title={m ? `${m.orders} store orders tagged with this campaign` : "No store orders are tagged with this campaign's name (utm_campaign)"}>{m?.modeledRoas == null ? "—" : x(m.modeledRoas)}</td>; })()}
                <td>{c.cpa === null ? "—" : money(c.cpa, cur)}</td>
                <td style={{ color: c.status === "active" ? "var(--pos)" : "var(--ink3)" }}>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
