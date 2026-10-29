import { shiftDate, type DailyRow } from "./dashboard";

/** Revenue = a * spend^b per week. b < 1 means each extra unit of spend earns less than the one before. */
export interface ResponseFit { a: number; b: number; r2: number; sigma: number; weeks: number }
export interface WeekPoint { spend: number; revenue: number }

const Z80 = 1.2816;
/** A curve built from fewer weeks, or from nearly constant spend, would be a guess. We say so instead of drawing it. */
export const MIN_WEEKS = 6;
const MIN_SPREAD = 0.15;

/** Spend and platform-reported revenue per 7-day block ending on `endDate`, oldest first. Empty blocks are dropped. */
export function weeklyPoints(rows: DailyRow[], platform: string, endDate: string, weeks = 13): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = shiftDate(endDate, -7 * w), from = shiftDate(to, -6);
    let spend = 0, revenue = 0;
    for (const r of rows) if (r.platform === platform && r.date >= from && r.date <= to) { spend += r.spend; revenue += r.revenue; }
    if (spend > 0 && revenue > 0) out.push({ spend, revenue });
  }
  return out;
}

/** Least squares on ln(revenue) = ln(a) + b ln(spend). Returns null when the data cannot support a curve. */
export function fitResponse(points: WeekPoint[]): ResponseFit | null {
  const p = points.filter((x) => x.spend > 0 && x.revenue > 0);
  if (p.length < MIN_WEEKS) return null;
  const xs = p.map((q) => Math.log(q.spend)), ys = p.map((q) => Math.log(q.revenue));
  const n = p.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  const sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  if (Math.sqrt(sxx / n) < MIN_SPREAD) return null;
  const sxy = xs.reduce((s, v, i) => s + (v - mx) * (ys[i]! - my), 0);
  // Weekly noise can make the raw slope look better than linear. Planning assumes returns never grow with spend, and never flatten completely.
  const b = Math.min(1, Math.max(0.1, sxy / sxx));
  const lnA = my - b * mx;
  const resid = ys.map((y, i) => y - (lnA + b * xs[i]!));
  const ssRes = resid.reduce((s, v) => s + v * v, 0), ssTot = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  return { a: Math.exp(lnA), b, r2: ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0, sigma: Math.sqrt(ssRes / Math.max(1, n - 2)), weeks: n };
}

export const predictRevenue = (f: ResponseFit, spend: number) => (spend > 0 ? f.a * spend ** f.b : 0);

/** Expected revenue for a weekly spend with an 80% range from how far past weeks scattered around the curve. */
export function forecastRevenue(f: ResponseFit, spend: number) {
  const mid = predictRevenue(f, spend);
  return { expected: mid, low: mid * Math.exp(-Z80 * f.sigma), high: mid * Math.exp(Z80 * f.sigma) };
}

/** What the next unit of spend returns at this weekly spend. */
export const marginalRoas = (f: ResponseFit, spend: number) => (spend > 0 ? f.a * f.b * spend ** (f.b - 1) : null);

export interface AllocationRow { platform: string; current: number; suggested: number; expected: number; low: number; high: number; marginalRoas: number | null }
export interface Allocation { rows: AllocationRow[]; expected: number; low: number; high: number; currentExpected: number }

/**
 * Splits a weekly budget so the next unit of spend earns the same on every platform, which is where total revenue is highest
 * for curves that flatten. A platform never moves more than `maxShift` (default 50%) from today's spend, because the curve
 * is only known near the spend it was learned from.
 */
export function allocateBudget(fits: Record<string, ResponseFit>, current: Record<string, number>, total: number, maxShift = 0.5): Allocation | null {
  const names = Object.keys(fits).filter((k) => (current[k] ?? 0) > 0);
  if (names.length < 2 || total <= 0) return null;
  const lo = new Map(names.map((k) => [k, current[k]! * (1 - maxShift)]));
  const hi = new Map(names.map((k) => [k, current[k]! * (1 + maxShift)]));
  const loSum = [...lo.values()].reduce((s, v) => s + v, 0), hiSum = [...hi.values()].reduce((s, v) => s + v, 0);
  const spend = new Map<string, number>();
  if (total <= loSum) for (const k of names) spend.set(k, lo.get(k)! * (total / loSum));
  else if (total >= hiSum) for (const k of names) spend.set(k, hi.get(k)! * (total / hiSum));
  else {
    for (const k of names) spend.set(k, lo.get(k)!);
    let left = total - loSum;
    const step = Math.max(total / 1000, 1e-6);
    while (left > 1e-9) {
      let best: string | null = null, bestGain = -1;
      for (const k of names) {
        if (spend.get(k)! >= hi.get(k)! - 1e-9) continue;
        const f = fits[k]!, s = spend.get(k)!;
        const gain = predictRevenue(f, s + step) - predictRevenue(f, s);
        if (gain > bestGain) { bestGain = gain; best = k; }
      }
      if (!best) break;
      const add = Math.min(step, left, hi.get(best)! - spend.get(best)!);
      spend.set(best, spend.get(best)! + add);
      left -= add;
    }
  }
  const rows = names.map((k) => {
    const s = spend.get(k)!, f = forecastRevenue(fits[k]!, s);
    return { platform: k, current: current[k]!, suggested: s, expected: f.expected, low: f.low, high: f.high, marginalRoas: marginalRoas(fits[k]!, s) };
  });
  // Ranges of independent platforms do not add up linearly; combine the spread in quadrature around the total.
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const down = Math.sqrt(rows.reduce((s, r) => s + (r.expected - r.low) ** 2, 0)), up = Math.sqrt(rows.reduce((s, r) => s + (r.high - r.expected) ** 2, 0));
  return { rows, expected, low: expected - down, high: expected + up, currentExpected: names.reduce((s, k) => s + predictRevenue(fits[k]!, current[k]!), 0) };
}

export interface Flight { id: string; name: string; startsOn: string; endsOn: string; platforms: string[]; budget: number }

/** Expected platform-reported revenue for a flight: its budget is spread evenly over its weeks and over its platforms that have a curve. */
export function forecastFlight(f: Flight, fits: Record<string, ResponseFit>) {
  const days = Math.max(1, Math.round((Date.parse(`${f.endsOn}T00:00:00Z`) - Date.parse(`${f.startsOn}T00:00:00Z`)) / 86400000) + 1);
  const weeks = days / 7;
  const usable = f.platforms.filter((p) => fits[p]);
  if (usable.length === 0 || f.budget <= 0) return null;
  const weekly = f.budget / weeks / usable.length;
  let expected = 0, down = 0, up = 0;
  for (const p of usable) {
    const r = forecastRevenue(fits[p]!, weekly);
    expected += r.expected * weeks; down += ((r.expected - r.low) * weeks) ** 2; up += ((r.high - r.expected) * weeks) ** 2;
  }
  return { expected, low: expected - Math.sqrt(down), high: expected + Math.sqrt(up), covered: usable.length, requested: f.platforms.length, days };
}
