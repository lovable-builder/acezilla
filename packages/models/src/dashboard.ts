export interface DailyRow {
  campaignId: string; campaignName: string; platform: string; status: string | null;
  date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
}

export interface Kpi { value: number; prev: number; deltaPct: number | null; series: number[] }
export interface Anomaly { severity: "high" | "warn"; campaignId: string; title: string; detail: string }
export interface CampaignRow {
  campaignId: string; name: string; platform: string; status: string;
  spend: number; revenue: number; conversions: number; roas: number | null; cpa: number | null;
}
export interface Dashboard {
  endDate: string; windowDays: number;
  kpis: { spend: Kpi; revenue: Kpi; roas: Kpi; cpa: Kpi; conversions: Kpi };
  series: { date: string; spend: number; revenue: number }[];
  platforms: { platform: string; spend: number; revenue: number; roas: number | null }[];
  campaigns: CampaignRow[];
  anomalies: Anomaly[];
}

const DAY = 86400000;
export const shiftDate = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
const div = (a: number, b: number) => (b > 0 ? a / b : null);
const sum = (rows: DailyRow[], k: "spend" | "revenue" | "conversions" | "clicks" | "impressions") => rows.reduce((s, r) => s + r[k], 0);
const between = (rows: DailyRow[], from: string, to: string) => rows.filter((r) => r.date >= from && r.date <= to);
const pct = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);

export function buildDashboard(rows: DailyRow[], opts: { windowDays?: number; endDate?: string } = {}): Dashboard {
  const windowDays = opts.windowDays ?? 30;
  const endDate = opts.endDate ?? rows.reduce((m, r) => (r.date > m ? r.date : m), "0000-00-00");
  const start = shiftDate(endDate, -(windowDays - 1));
  const prevEnd = shiftDate(start, -1);
  const prevStart = shiftDate(prevEnd, -(windowDays - 1));
  const cur = between(rows, start, endDate);
  const prev = between(rows, prevStart, prevEnd);

  const dates = Array.from({ length: windowDays }, (_, i) => shiftDate(start, i));
  const byDate = new Map<string, { spend: number; revenue: number; conversions: number }>();
  for (const r of cur) {
    const d = byDate.get(r.date) ?? { spend: 0, revenue: 0, conversions: 0 };
    d.spend += r.spend; d.revenue += r.revenue; d.conversions += r.conversions;
    byDate.set(r.date, d);
  }
  const series = dates.map((date) => ({ date, spend: byDate.get(date)?.spend ?? 0, revenue: byDate.get(date)?.revenue ?? 0 }));
  const conv = dates.map((d) => byDate.get(d)?.conversions ?? 0);

  const kpi = (value: number, pv: number, s: number[]): Kpi => ({ value, prev: pv, deltaPct: pct(value, pv), series: s });
  const cs = sum(cur, "spend"), cr = sum(cur, "revenue"), cc = sum(cur, "conversions");
  const ps = sum(prev, "spend"), pr = sum(prev, "revenue"), pc = sum(prev, "conversions");

  const kpis = {
    spend: kpi(cs, ps, series.map((s) => s.spend)),
    revenue: kpi(cr, pr, series.map((s) => s.revenue)),
    roas: kpi(cs > 0 ? cr / cs : 0, ps > 0 ? pr / ps : 0, series.map((s) => (s.spend > 0 ? s.revenue / s.spend : 0))),
    cpa: kpi(cc > 0 ? cs / cc : 0, pc > 0 ? ps / pc : 0, series.map((s, i) => (conv[i]! > 0 ? s.spend / conv[i]! : 0))),
    conversions: kpi(cc, pc, conv),
  };

  const groups = new Map<string, DailyRow[]>();
  for (const r of cur) (groups.get(r.campaignId) ?? groups.set(r.campaignId, []).get(r.campaignId)!).push(r);
  const campaigns: CampaignRow[] = [...groups.values()].map((g) => {
    const spend = sum(g, "spend"), revenue = sum(g, "revenue"), conversions = sum(g, "conversions");
    return { campaignId: g[0]!.campaignId, name: g[0]!.campaignName, platform: g[0]!.platform, status: g[0]!.status ?? "active", spend, revenue, conversions, roas: div(revenue, spend), cpa: div(spend, conversions) };
  }).sort((a, b) => b.spend - a.spend);

  const pl = new Map<string, { spend: number; revenue: number }>();
  for (const c of campaigns) { const p = pl.get(c.platform) ?? { spend: 0, revenue: 0 }; p.spend += c.spend; p.revenue += c.revenue; pl.set(c.platform, p); }
  const platforms = [...pl.entries()].map(([platform, v]) => ({ platform, ...v, roas: div(v.revenue, v.spend) })).sort((a, b) => b.spend - a.spend);

  return { endDate, windowDays, kpis, series, platforms, campaigns, anomalies: detectAnomalies(rows, endDate) };
}

/** Flags (1) sudden ROAS drops over the last 3 days vs a 14-day baseline, and (2) fatigue: last 7 days vs prior 7. */
export function detectAnomalies(rows: DailyRow[], endDate: string): Anomaly[] {
  const out: Anomaly[] = [];
  const groups = new Map<string, DailyRow[]>();
  for (const r of rows) (groups.get(r.campaignId) ?? groups.set(r.campaignId, []).get(r.campaignId)!).push(r);
  const roas = (g: DailyRow[]) => div(sum(g, "revenue"), sum(g, "spend"));

  for (const g of groups.values()) {
    const name = g[0]!.campaignName, id = g[0]!.campaignId;
    const recent = between(g, shiftDate(endDate, -2), endDate);
    const base = between(g, shiftDate(endDate, -16), shiftDate(endDate, -3));
    const rr = roas(recent), br = roas(base);
    if (rr !== null && br !== null && sum(base, "spend") > 100 && rr < br * 0.65) {
      out.push({ severity: "high", campaignId: id, title: `${name}: ROAS fell ${Math.round((1 - rr / br) * 100)}%`, detail: `${rr.toFixed(2)}x over the last 3 days vs ${br.toFixed(2)}x baseline.` });
      continue;
    }
    const l7 = roas(between(g, shiftDate(endDate, -6), endDate)), p7 = roas(between(g, shiftDate(endDate, -13), shiftDate(endDate, -7)));
    if (l7 !== null && p7 !== null && l7 < p7 * 0.8)
      out.push({ severity: "warn", campaignId: id, title: `${name}: possible fatigue`, detail: `ROAS slid from ${p7.toFixed(2)}x to ${l7.toFixed(2)}x week over week.` });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
