import { shiftDate, type Kpi } from "./dashboard";

/** One store order as saved by a store connector (WooCommerce today). Revenue is already net of tax, shipping and refunds. */
export interface OrderRow { /** Order id as stored. Allegro orders start with "allegro:", WooCommerce orders with "woo:". */ externalId?: string; createdAt: string; revenue: number; customerId: string | null; utm: Record<string, string> | null; clickIds: Record<string, string> | null }

export interface SourceRow { source: string; orders: number; revenue: number; share: number }
export interface StoreSales {
  endDate: string; windowDays: number;
  revenue: Kpi; orders: Kpi; aov: Kpi;
  series: { date: string; revenue: number; orders: number }[];
  /** Where orders came from, by the marketing tag recorded on each order. Biggest first. */
  sources: SourceRow[];
  /** Share of orders that carry a marketing tag or an ad click ID (0 to 1). Low means attribution is not being captured. */
  taggedShare: number | null;
}

export const UNTAGGED = "Direct / unknown";
const CLICK_ID_SOURCE: [string, string][] = [["fbclid", "facebook"], ["gclid", "google"], ["wbraid", "google"], ["gbraid", "google"], ["ttclid", "tiktok"], ["msclkid", "bing"]];
const ALIASES: Record<string, string> = { fb: "facebook", ig: "instagram", "facebook.com": "facebook", "m.facebook.com": "facebook", "l.facebook.com": "facebook", "instagram.com": "instagram", "google.com": "google", tt: "tiktok", "tiktok.com": "tiktok" };

/** The channel an order is credited to: its utm source if present, else the ad click ID, else unknown. */
export function orderSource(o: Pick<OrderRow, "utm" | "clickIds">): string {
  const raw = o.utm?.source?.trim().toLowerCase();
  if (raw) return ALIASES[raw] ?? raw;
  for (const [id, src] of CLICK_ID_SOURCE) if (o.clickIds?.[id]) return src;
  return UNTAGGED;
}

const pct = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);
const day = (iso: string) => iso.slice(0, 10);

export function buildStoreSales(orders: OrderRow[], opts: { windowDays?: number; endDate?: string } = {}): StoreSales {
  const windowDays = opts.windowDays ?? 30;
  const endDate = opts.endDate ?? orders.reduce((m, o) => (day(o.createdAt) > m ? day(o.createdAt) : m), "0000-00-00");
  const start = shiftDate(endDate, -(windowDays - 1));
  const prevEnd = shiftDate(start, -1), prevStart = shiftDate(prevEnd, -(windowDays - 1));
  const within = (o: OrderRow, a: string, b: string) => { const d = day(o.createdAt); return d >= a && d <= b; };
  const cur = orders.filter((o) => within(o, start, endDate)), prev = orders.filter((o) => within(o, prevStart, prevEnd));

  const dates = Array.from({ length: windowDays }, (_, i) => shiftDate(start, i));
  const byDate = new Map<string, { revenue: number; orders: number }>();
  for (const o of cur) { const d = byDate.get(day(o.createdAt)) ?? { revenue: 0, orders: 0 }; d.revenue += o.revenue; d.orders++; byDate.set(day(o.createdAt), d); }
  const series = dates.map((date) => ({ date, revenue: byDate.get(date)?.revenue ?? 0, orders: byDate.get(date)?.orders ?? 0 }));

  const rev = (xs: OrderRow[]) => xs.reduce((s, o) => s + o.revenue, 0);
  const cr = rev(cur), pr = rev(prev);
  const aov = (r: number, n: number) => (n > 0 ? r / n : 0);
  const kpi = (value: number, prevValue: number, s: number[]): Kpi => ({ value, prev: prevValue, deltaPct: pct(value, prevValue), series: s });

  const groups = new Map<string, { orders: number; revenue: number }>();
  for (const o of cur) { const k = orderSource(o); const g = groups.get(k) ?? { orders: 0, revenue: 0 }; g.orders++; g.revenue += o.revenue; groups.set(k, g); }
  const sources = [...groups].map(([source, g]) => ({ source, ...g, share: cr > 0 ? g.revenue / cr : 0 })).sort((a, b) => b.revenue - a.revenue);
  const tagged = cur.filter((o) => orderSource(o) !== UNTAGGED).length;

  return {
    endDate, windowDays,
    revenue: kpi(cr, pr, series.map((s) => s.revenue)),
    orders: kpi(cur.length, prev.length, series.map((s) => s.orders)),
    aov: kpi(aov(cr, cur.length), aov(pr, prev.length), series.map((s) => aov(s.revenue, s.orders))),
    series, sources, taggedShare: cur.length > 0 ? tagged / cur.length : null,
  };
}

/** Store ROAS: real store revenue divided by ad spend over the same days. Null when nothing was spent. */
export const storeRoas = (storeRevenue: number, adSpend: number) => (adSpend > 0 ? storeRevenue / adSpend : null);
