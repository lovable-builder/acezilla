import { PER_USD } from "./media";

// ---- seeded random draws, so a forecast is repeatable and testable ----
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
/** Marsaglia–Tsang. */
function gamma(rng: Rng, k: number): number {
  if (k < 1) return gamma(rng, k + 1) * rng() ** (1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function beta(rng: Rng, a: number, b: number): number { const x = gamma(rng, a), y = gamma(rng, b); return x / (x + y); }
export function lognormal(rng: Rng, mean: number, cv: number): number {
  if (cv <= 0) return mean;
  const s2 = Math.log(1 + cv * cv);
  return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * normal(rng));
}
function poisson(rng: Rng, lambda: number): number { const l = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= rng(); } while (p > l); return k - 1; }
export function binomial(rng: Rng, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 40) { let k = 0; for (let i = 0; i < n; i++) if (rng() < p) k++; return k; }
  const mean = n * p;
  if (mean < 30) return Math.min(n, poisson(rng, mean));
  if (n - mean < 30) return Math.max(0, n - poisson(rng, n - mean));
  return Math.min(n, Math.max(0, Math.round(mean + Math.sqrt(mean * (1 - p)) * normal(rng))));
}

// ---- fees per sales channel ----
/** Where an ad sends the shopper, and so who takes a cut of the sale. "woocommerce" is the seller's own website. */
export type SalesChannel = "woocommerce" | "allegro" | "tiktokshop" | "googleshop" | "instagramshop" | "metashop" | "whatsappshop";
export const CHANNELS: SalesChannel[] = ["woocommerce", "allegro", "tiktokshop", "googleshop", "instagramshop", "metashop", "whatsappshop"];
export const CHANNEL_LABEL: Record<SalesChannel, string> = { woocommerce: "My website", allegro: "Allegro", tiktokshop: "TikTok Shop", googleshop: "Google products", instagramshop: "Instagram Shop", metashop: "Meta Shop", whatsappshop: "WhatsApp Shop" };
export type AdPlatformId = "meta" | "tiktok" | "google" | "allegro";
/**
 * Where each ad platform can send shoppers. Every destination is open for every platform, so any combination can be tried and the fees edited by hand.
 * The list starts with the places that platform naturally sends people to.
 */
const withRest = (first: SalesChannel[]): SalesChannel[] => [...first, ...CHANNELS.filter((c) => !first.includes(c))];
export const DESTINATIONS: Record<AdPlatformId, SalesChannel[]> = {
  meta: withRest(["woocommerce", "instagramshop", "metashop", "whatsappshop"]),
  tiktok: withRest(["woocommerce", "tiktokshop"]),
  google: withRest(["woocommerce", "googleshop"]),
  allegro: withRest(["allegro"]),
};
/** Destinations that are not open to this seller yet. Their fees start at zero and must be entered once they open. */
export const NOT_OPEN_YET: SalesChannel[] = ["instagramshop", "metashop", "whatsappshop"];
/** What to know about each destination's fees, in plain words. */
export const CHANNEL_NOTE: Record<SalesChannel, string> = {
  woocommerce: "Your own website pays no marketplace commission. The payment fee is what your card or payment provider charges, so check it with them.",
  allegro: "Allegro takes a commission that depends on the category. It is filled from your own fee history when there is one.",
  tiktokshop: "TikTok Shop takes a commission on each order. The rate depends on your country and category, so check it in TikTok Seller Center.",
  googleshop: "Google lists products without a sales commission, and shoppers usually pay on your site, so the starting fees are your website's payment fee. If you use Google's own checkout, enter its fee.",
  instagramshop: "Not open for you yet. Fees start at zero as a placeholder: enter the real commission and payment fee when it opens.",
  metashop: "Not open for you yet. Fees start at zero as a placeholder: enter the real commission and payment fee when it opens.",
  whatsappshop: "Not open for you yet. Fees start at zero as a placeholder: enter the real commission and payment fee when it opens.",
};

/** What the sales channel and the seller pay on each order. Rates are shares of the price before VAT; money amounts are in the workspace currency. */
export interface ChannelFees {
  /** Marketplace commission, share of the net price. */ commissionRate: number;
  /** Fixed marketplace fee per order. */ fixedPerOrder: number;
  /** Card or payment-gateway fee, share of the net price. */ paymentRate: number;
  /** Fixed payment fee per order. */ paymentFixed: number;
  /** What the seller pays to ship one order. */ shippingPerOrder: number;
  /** Share of orders sent back. A returned order refunds the price, recovers the goods and the commission, and costs shipping both ways. */ returnRate: number;
}
/** Typical starting values, in US dollars for the fixed amounts. They are placeholders to edit: real rates depend on your category, country and contract. */
const TYPICAL_USD: Record<SalesChannel, ChannelFees> = {
  allegro: { commissionRate: 0.08, fixedPerOrder: 0, paymentRate: 0, paymentFixed: 0, shippingPerOrder: 0, returnRate: 0.05 },
  woocommerce: { commissionRate: 0, fixedPerOrder: 0, paymentRate: 0.015, paymentFixed: 0.25, shippingPerOrder: 0, returnRate: 0.05 },
  tiktokshop: { commissionRate: 0.06, fixedPerOrder: 0.3, paymentRate: 0, paymentFixed: 0, shippingPerOrder: 0, returnRate: 0.05 },
  googleshop: { commissionRate: 0, fixedPerOrder: 0, paymentRate: 0.015, paymentFixed: 0.25, shippingPerOrder: 0, returnRate: 0.05 },
  instagramshop: { commissionRate: 0, fixedPerOrder: 0, paymentRate: 0, paymentFixed: 0, shippingPerOrder: 0, returnRate: 0.05 },
  metashop: { commissionRate: 0, fixedPerOrder: 0, paymentRate: 0, paymentFixed: 0, shippingPerOrder: 0, returnRate: 0.05 },
  whatsappshop: { commissionRate: 0, fixedPerOrder: 0, paymentRate: 0, paymentFixed: 0, shippingPerOrder: 0, returnRate: 0.05 },
};
export function channelDefaults(channel: SalesChannel, currency: string): ChannelFees {
  const t = TYPICAL_USD[channel], r = PER_USD[currency.toUpperCase()] ?? 1;
  const round = (n: number) => Math.round(n * r * 100) / 100;
  return { ...t, fixedPerOrder: round(t.fixedPerOrder), paymentFixed: round(t.paymentFixed), shippingPerOrder: round(t.shippingPerOrder) };
}

// ---- the imagined campaign ----
export interface CampaignInput {
  /** Total ad spend for the campaign. */ budget: number;
  /** Cost per click: the average, and how much it wanders (standard deviation as a share of the average). */ cpc: { mean: number; spread: number };
  /** Share of clicks that become orders, and how many clicks that figure was learned from (more clicks, less doubt). */ cvr: { mean: number; clicks: number };
  /** Shelf price including VAT. */ price: number;
  /** Cost of the goods for one unit. */ unitCost: number;
  vatRate: number;
  fees: ChannelFees;
}

const netPrice = (i: CampaignInput) => i.price / (1 + i.vatRate);

/** Money one kept order leaves after the channel and goods, before ads. */
export function marginPerOrder(i: CampaignInput): number {
  const n = netPrice(i), f = i.fees;
  return n * (1 - f.commissionRate - f.paymentRate) - f.fixedPerOrder - f.paymentFixed - f.shippingPerOrder - i.unitCost;
}
const returnLoss = (i: CampaignInput) => 2 * i.fees.shippingPerOrder;
/** Average money one order leaves before ads, counting how often orders come back. */
export function contributionPerOrder(i: CampaignInput): number {
  const r = i.fees.returnRate;
  return (1 - r) * marginPerOrder(i) - r * returnLoss(i);
}

export interface CampaignOutcome { clicks: number; orders: number; returned: number; kept: number; platformRevenue: number; storeRevenue: number; channelFees: number; goods: number; shipping: number; ads: number; profit: number }

/** Turns a number of clicks and orders into money. Used for each simulated trial's scenario and for the average case. */
export function outcomeOf(i: CampaignInput, clicks: number, orders: number, returned: number): CampaignOutcome {
  const n = netPrice(i), f = i.fees, kept = orders - returned;
  const channelFees = kept * (n * (f.commissionRate + f.paymentRate) + f.fixedPerOrder + f.paymentFixed);
  const goods = kept * i.unitCost, shipping = kept * f.shippingPerOrder + returned * returnLoss(i);
  const storeRevenue = kept * n;
  return { clicks, orders, returned, kept, platformRevenue: orders * i.price, storeRevenue, channelFees, goods, shipping, ads: i.budget, profit: storeRevenue - channelFees - goods - shipping - i.budget };
}

/** The average case with no luck involved: mean cost per click, mean conversion rate. */
export function expectedOutcome(i: CampaignInput): CampaignOutcome {
  const clicks = i.cpc.mean > 0 ? i.budget / i.cpc.mean : 0;
  const orders = clicks * i.cvr.mean, returned = orders * i.fees.returnRate;
  return outcomeOf(i, clicks, orders, returned);
}

// ---- Monte Carlo ----
export interface Quantiles { p01: number; p05: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number; p99: number }
export interface Simulation {
  trials: number;
  /** Profit of every trial, smallest first. */ profits: Float64Array;
  probProfit: number; probLoss: number; mean: number; q: Quantiles;
  /** Chance of losing more than half the budget. */ probLoseHalf: number;
  avgClicks: number; avgOrders: number;
  platformRoas: number | null; storeRoas: number | null;
  scenarios: { pessimistic: CampaignOutcome; base: CampaignOutcome; optimistic: CampaignOutcome };
}

export function quantile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const pos = (n - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function simulateCampaign(i: CampaignInput, o: { trials?: number; seed?: number } = {}): Simulation {
  const trials = o.trials ?? 10000, rng = mulberry32(o.seed ?? 1);
  const k = Math.min(3000, Math.max(30, i.cvr.clicks));
  const a = Math.max(i.cvr.mean, 1e-6) * k, b = Math.max(1 - i.cvr.mean, 1e-6) * k;
  const clicksT = new Float64Array(trials), ordersT = new Float64Array(trials), retT = new Float64Array(trials), profT = new Float64Array(trials);
  let sumP = 0, wins = 0, bad = 0, sumRev = 0, sumStore = 0, sumClicks = 0, sumOrders = 0;
  for (let t = 0; t < trials; t++) {
    const cpc = lognormal(rng, i.cpc.mean, i.cpc.spread);
    const clicks = cpc > 0 ? Math.floor(i.budget / cpc) : 0;
    const cvr = i.cvr.mean <= 0 ? 0 : i.cvr.mean >= 1 ? 1 : beta(rng, a, b);
    const orders = binomial(rng, clicks, cvr), returned = binomial(rng, orders, i.fees.returnRate);
    const out = outcomeOf(i, clicks, orders, returned);
    clicksT[t] = clicks; ordersT[t] = orders; retT[t] = returned; profT[t] = out.profit;
    sumP += out.profit; sumRev += out.platformRevenue; sumStore += out.storeRevenue; sumClicks += clicks; sumOrders += orders;
    if (out.profit > 0) wins++;
    if (out.profit < -0.5 * i.budget) bad++;
  }
  const idx = Array.from({ length: trials }, (_, t) => t).sort((x, y) => profT[x]! - profT[y]!);
  const profits = Float64Array.from(idx, (t) => profT[t]!);
  const at = (p: number) => { const t = idx[Math.min(trials - 1, Math.max(0, Math.round((trials - 1) * p)))]!; return outcomeOf(i, clicksT[t]!, ordersT[t]!, retT[t]!); };
  const q: Quantiles = { p01: quantile(profits, 0.01), p05: quantile(profits, 0.05), p10: quantile(profits, 0.1), p25: quantile(profits, 0.25), p50: quantile(profits, 0.5), p75: quantile(profits, 0.75), p90: quantile(profits, 0.9), p95: quantile(profits, 0.95), p99: quantile(profits, 0.99) };
  return {
    trials, profits, probProfit: wins / trials, probLoss: 1 - wins / trials, probLoseHalf: bad / trials, mean: sumP / trials, q,
    avgClicks: sumClicks / trials, avgOrders: sumOrders / trials,
    platformRoas: i.budget > 0 ? sumRev / trials / i.budget : null, storeRoas: i.budget > 0 ? sumStore / trials / i.budget : null,
    scenarios: { pessimistic: at(0.1), base: at(0.5), optimistic: at(0.9) },
  };
}

// ---- what you need (closed form, no luck involved) ----
export interface BreakEven {
  /** Conversion rate needed at this cost per click. Null when an order cannot earn anything. */ cvr: number | null;
  /** Highest cost per click that still breaks even at this conversion rate. */ cpc: number | null;
  /** Lowest shelf price (with VAT) that breaks even. */ price: number | null;
  /** Highest unit cost that still breaks even. */ unitCost: number | null;
  /** Orders needed to cover the ad budget. */ orders: number | null;
  /** Ad cost of one order: cost per click divided by the conversion rate. */ adCostPerOrder: number | null;
}
export function breakEven(i: CampaignInput): BreakEven {
  const u = contributionPerOrder(i), f = i.fees, r = f.returnRate;
  const cpo = i.cvr.mean > 0 ? i.cpc.mean / i.cvr.mean : null; // ad cost of one order
  const keep = 1 - f.commissionRate - f.paymentRate;
  const fixed = f.fixedPerOrder + f.paymentFixed + f.shippingPerOrder;
  const solvable = cpo !== null && r < 1 && keep > 0;
  return {
    cvr: u > 0 ? i.cpc.mean / u : null,
    cpc: u > 0 ? i.cvr.mean * u : null,
    price: solvable ? (((cpo! + r * returnLoss(i)) / (1 - r) + fixed + i.unitCost) / keep) * (1 + i.vatRate) : null,
    unitCost: solvable ? netPrice(i) * keep - fixed - (cpo! + r * returnLoss(i)) / (1 - r) : null,
    orders: u > 0 ? i.budget / u : null,
    adCostPerOrder: cpo,
  };
}

/** Where the shelf price of one kept order goes, at average assumptions. */
export function unitEconomics(i: CampaignInput): { label: string; amount: number }[] {
  const n = netPrice(i), f = i.fees;
  const adPerOrder = i.cvr.mean > 0 ? i.cpc.mean / i.cvr.mean : 0;
  const parts = [
    { label: "VAT", amount: i.price - n },
    { label: "Marketplace commission", amount: n * f.commissionRate + f.fixedPerOrder },
    { label: "Payment fee", amount: n * f.paymentRate + f.paymentFixed },
    { label: "Shipping", amount: f.shippingPerOrder },
    { label: "Cost of goods", amount: i.unitCost },
    { label: "Ads", amount: adPerOrder },
  ];
  return [...parts, { label: "Left over", amount: i.price - parts.reduce((s, p) => s + p.amount, 0) }];
}

// ---- how the result reacts to each input ----
export interface Sensitivity { input: string; label: string; lowMedian: number; highMedian: number; lowProb: number; highProb: number }
/** Each input moved down and up by `step`, with the same random draws so only that input differs. */
export function sensitivity(i: CampaignInput, o: { step?: number; trials?: number; seed?: number } = {}): Sensitivity[] {
  const step = o.step ?? 0.2, opts = { trials: o.trials ?? 3000, seed: o.seed ?? 1 };
  const vary: [string, string, (m: number) => CampaignInput][] = [
    ["cpc", "Cost per click", (m) => ({ ...i, cpc: { ...i.cpc, mean: i.cpc.mean * m } })],
    ["cvr", "Conversion rate", (m) => ({ ...i, cvr: { ...i.cvr, mean: Math.min(1, i.cvr.mean * m) } })],
    ["price", "Selling price", (m) => ({ ...i, price: i.price * m })],
    ["unitCost", "Cost of goods", (m) => ({ ...i, unitCost: i.unitCost * m })],
    ["commission", "Commission", (m) => ({ ...i, fees: { ...i.fees, commissionRate: i.fees.commissionRate * m } })],
    ["returns", "Returns", (m) => ({ ...i, fees: { ...i.fees, returnRate: Math.min(1, i.fees.returnRate * m) } })],
  ];
  return vary.map(([input, label, f]) => {
    const lo = simulateCampaign(f(1 - step), opts), hi = simulateCampaign(f(1 + step), opts);
    return { input, label, lowMedian: lo.q.p50, highMedian: hi.q.p50, lowProb: lo.probProfit, highProb: hi.probProfit };
  }).sort((x, y) => Math.abs(y.highMedian - y.lowMedian) - Math.abs(x.highMedian - x.lowMedian));
}

/** The same campaign sent to each of these destinations, each with its own fees. */
export function compareChannels(i: CampaignInput, channels: SalesChannel[], fees: Record<SalesChannel, ChannelFees>, o: { trials?: number; seed?: number } = {}) {
  return channels.map((channel) => {
    const s = simulateCampaign({ ...i, fees: fees[channel] }, { trials: o.trials ?? 3000, seed: o.seed ?? 1 });
    return { channel, probProfit: s.probProfit, median: s.q.p50, p10: s.q.p10, p90: s.q.p90 };
  });
}

export interface Bin { from: number; to: number; count: number }
/** Counts of trials per profit band. The ends are trimmed to the 0.5% and 99.5% points; outliers count in the edge bands. */
export function histogram(sorted: ArrayLike<number>, bins = 40): Bin[] {
  if (sorted.length === 0) return [];
  let lo = quantile(sorted, 0.005), hi = quantile(sorted, 0.995);
  if (hi <= lo) { lo -= 1; hi += 1; }
  const w = (hi - lo) / bins, out: Bin[] = Array.from({ length: bins }, (_, k) => ({ from: lo + k * w, to: lo + (k + 1) * w, count: 0 }));
  for (let t = 0; t < sorted.length; t++) out[Math.min(bins - 1, Math.max(0, Math.floor((sorted[t]! - lo) / w)))]!.count++;
  return out;
}

export interface AdReportRow { from: string; to: string; cost: number; clicks: number; units: number }
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
/**
 * Totals for the part of each uploaded report that falls inside the window. A report is one total per offer over a date range,
 * so only the share of its days inside the window counts. Units are what Allegro credits to the ads.
 */
export function reportStats(rows: AdReportRow[], start: string, end: string): { spend: number; clicks: number; orders: number; days: number } {
  let spend = 0, clicks = 0, orders = 0;
  const covered = new Set<number>();
  for (const r of rows) {
    const lo = Math.max(dayNum(r.from), dayNum(start)), hi = Math.min(dayNum(r.to), dayNum(end));
    if (hi < lo) continue;
    const share = (hi - lo + 1) / (dayNum(r.to) - dayNum(r.from) + 1);
    spend += r.cost * share; clicks += r.clicks * share; orders += r.units * share;
    for (let d = lo; d <= hi; d++) covered.add(d);
  }
  return { spend, clicks, orders, days: covered.size };
}
