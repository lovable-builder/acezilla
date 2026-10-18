import Link from "next/link";
import { buildDashboard, type DailyRow } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueChart, Sparkline } from "@/components/dash/charts";
import { compact, delta, int, money, PLATFORM, x } from "@/lib/format";

const PAGE = 1000;

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

  if (rows.length === 0) {
    return (
      <>
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="page">Command center</h1>
          <p className="sub">Load demo data or import a CSV to get your first briefing.</p>
        </div>
        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>Nothing synced yet.</span>
          <Button asChild><Link href="/connections">Bring in data</Link></Button>
        </Card>
      </>
    );
  }

  const d = buildDashboard(rows);
  const cur = current.currency;
  const k = d.kpis;
  const roasUp = k.roas.deltaPct !== null && k.roas.deltaPct >= 0;
  const cells = [
    { label: "Spend", v: money(k.spend.value, cur), d: k.spend.deltaPct, good: null, s: k.spend.series },
    { label: "Revenue", v: money(k.revenue.value, cur), d: k.revenue.deltaPct, good: true, s: k.revenue.series },
    { label: "Blended ROAS", v: x(k.roas.value), d: k.roas.deltaPct, good: true, s: k.roas.series },
    { label: "CPA", v: k.conversions.value > 0 ? money(k.cpa.value, cur) : "—", d: k.cpa.deltaPct, good: false, s: k.cpa.series },
    { label: "Conversions", v: int(k.conversions.value), d: k.conversions.deltaPct, good: true, s: k.conversions.series },
  ];
  const tone = (good: boolean | null, dv: number | null) => dv === null || good === null ? "var(--ink3)" : (dv >= 0) === good ? "var(--pos)" : "var(--neg)";

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
        <p className="sub">Platform-reported figures. Modeled ROAS arrives once store orders are matched.</p>
      </div>

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
