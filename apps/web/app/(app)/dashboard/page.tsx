import Link from "next/link";
import { buildDashboard, buildStoreSales, storeRoas, type DailyRow, type OrderRow, type StoreSales } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueChart, Sparkline } from "@/components/dash/charts";
import { compact, delta, int, money, PLATFORM, x } from "@/lib/format";

const PAGE = 1000;
const ORDER_DAYS = 120;

const tone = (good: boolean | null, dv: number | null) => dv === null || good === null ? "var(--ink3)" : (dv >= 0) === good ? "var(--pos)" : "var(--neg)";

function StoreBlock({ store, cur, spendByDate, adSpend, platformRoas }: { store: StoreSales; cur: string; spendByDate: Map<string, number> | null; adSpend: number | null; platformRoas: number | null }) {
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
      <h2 className="h2" style={{ margin: 0 }}><span className="n">··</span>Store sales</h2>
      <div className="kpis">
        {cells.map((c) => (
          <div className="kpi" key={c.label}>
            <span className="eyebrow">{c.label}</span>
            <span className="tabnum" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.v}</span>
            {c.label === "Store ROAS"
              ? <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{x(platformRoas)} platform-reported</span>
              : <span className="mono tabnum" style={{ fontSize: 12, color: tone(c.good, c.d) }}>{delta(c.d)}</span>}
            {c.s.length > 0 && <Sparkline data={c.s} color="var(--accent)" />}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 24 }}>
        <Card>
          <h2 className="h2"><span className="n">A</span>{spendByDate ? "Store revenue vs ad spend" : "Store revenue"}</h2>
          <RevenueChart series={chart} />
          <div className="eyebrow" style={{ display: "flex", gap: 16, marginTop: 6 }}><span style={{ color: "var(--accent-ink)" }}>— Store revenue</span>{spendByDate && <span>- - Ad spend</span>}</div>
        </Card>
        <Card style={{ overflowX: "auto" }}>
          <h2 className="h2"><span className="n">B</span>Where orders came from</h2>
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

export default async function CommandCenter() {
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
  const since = new Date(Date.now() - ORDER_DAYS * 86400000).toISOString();
  for (let from = 0; from < 30 * PAGE; from += PAGE) {
    const { data } = await supabase.from("order").select("created_at,revenue,utm,click_ids,customer_id").eq("workspace_id", current.id).gte("created_at", since).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    for (const r of data ?? []) orderRows.push({ createdAt: r.created_at as string, revenue: Number(r.revenue), customerId: (r.customer_id as string | null) ?? null, utm: (r.utm as Record<string, string> | null) ?? null, clickIds: (r.click_ids as Record<string, string> | null) ?? null });
    if ((data?.length ?? 0) < PAGE) break;
  }
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

  if (rows.length === 0 && orderRows.length > 0) {
    const cur0 = current.currency;
    const store0 = buildStoreSales(orderRows);
    return (
      <>
        <div>
          <div className="eyebrow">Overview · last {store0.windowDays} days to {store0.endDate}</div>
          <h1 className="page">Your store made {money(store0.revenue.value, cur0)} from {int(store0.orders.value)} order{store0.orders.value === 1 ? "" : "s"}.</h1>
          <p className="sub">Connect an ad account to see how your ad spend compares with this revenue.</p>
        </div>
        {warningCard}
        <StoreBlock store={store0} cur={cur0} spendByDate={null} adSpend={null} platformRoas={null} />
        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>No ad data yet.</span>
          <Button asChild><Link href="/connections">Connect an ad account</Link></Button>
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
        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>Nothing synced yet.</span>
          <Button asChild><Link href="/connections">Connect an account</Link></Button>
        </Card>
      </>
    );
  }

  const d = buildDashboard(rows);
  const cur = current.currency;
  const k = d.kpis;
  const store = orderRows.length > 0 ? buildStoreSales(orderRows, { endDate: d.endDate, windowDays: d.windowDays }) : null;
  const spendByDate = new Map(d.series.map((p) => [p.date, p.spend]));
  const roasUp = k.roas.deltaPct !== null && k.roas.deltaPct >= 0;
  const cells = [
    { label: "Spend", v: money(k.spend.value, cur), d: k.spend.deltaPct, good: null, s: k.spend.series },
    { label: "Revenue", v: money(k.revenue.value, cur), d: k.revenue.deltaPct, good: true, s: k.revenue.series },
    { label: "Blended ROAS", v: x(k.roas.value), d: k.roas.deltaPct, good: true, s: k.roas.series },
    { label: "CPA", v: k.conversions.value > 0 ? money(k.cpa.value, cur) : "—", d: k.cpa.deltaPct, good: false, s: k.cpa.series },
    { label: "Conversions", v: int(k.conversions.value), d: k.conversions.deltaPct, good: true, s: k.conversions.series },
  ];

  return (
    <>
      <div>
        <div className="eyebrow">Overview · last {d.windowDays} days to {d.endDate}</div>
        <h1 className="page">
          You spent {money(k.spend.value, cur)} and made {money(k.revenue.value, cur)}
          {k.roas.deltaPct === null
            ? ` — blended ROAS is ${x(k.roas.value)}.`
            : ` — ROAS is ${roasUp ? "up" : "down"} ${delta(k.roas.deltaPct).replace(/^[+−]/, "")} on the previous period.`}
        </h1>
        <p className="sub">{store ? "Ad figures are platform-reported. Store sales are your real orders, so Store ROAS is the honest return on your ad spend." : "Platform-reported figures. Connect your store to compare them with real orders."}</p>
      </div>
      {warningCard}

      <div className="kpis">
        {cells.map((c) => (
          <div className="kpi" key={c.label}>
            <span className="eyebrow">{c.label}</span>
            <span className="tabnum" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.v}</span>
            <span className="mono tabnum" style={{ fontSize: 12, color: tone(c.good, c.d) }}>{delta(c.d)}</span>
            <Sparkline data={c.s} color={c.good === null ? "var(--ink3)" : "var(--accent)"} />
          </div>
        ))}
      </div>

      {store && <StoreBlock store={store} cur={cur} spendByDate={spendByDate} adSpend={k.spend.value} platformRoas={k.roas.value} />}

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
          <thead><tr><th>Campaign</th><th>Spend</th><th>Platform ROAS</th><th>Modeled ROAS</th><th>CPA</th><th>Status</th></tr></thead>
          <tbody>
            {d.campaigns.map((c) => (
              <tr key={c.campaignId}>
                <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 8, background: PLATFORM[c.platform]?.color }} />{c.name}</td>
                <td>{money(c.spend, cur)}</td>
                <td style={{ color: "var(--ink3)" }}>{x(c.roas)}</td>
                <td style={{ fontWeight: 600 }} title="Needs store orders matched (coming next phase)">—</td>
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
