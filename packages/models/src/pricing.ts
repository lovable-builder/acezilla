import { cleanLine, collectNumbers, DATA_RULES, dataBlock, unverifiedNumbers, untrustedLabel } from "./ai";
import type { OfferProfit } from "./marketplace";

/**
 * What an offer earns at a given selling price, and where it breaks even. All money here is per the period the offer was measured
 * over and before VAT (the profit table's basis); `toGross` adds VAT back for the price a shopper sees.
 *
 *   profit = units x (price x (1 - commission rate) - other fees per unit - cost per unit) - ad spend
 *
 * Commission follows the price. Delivery, fulfilment and other fees are per unit. Ad spend is a fixed amount for the period: a
 * higher or lower price does not change what was paid for ads. Sales volume only changes if you give a demand assumption.
 */
export interface PricingModel {
  offerId: string; name: string;
  /** Units sold in the period. */ units: number;
  /** Net price per unit now. */ price: number;
  /** Commission as a share of net revenue. */ commissionRate: number;
  /** Delivery, fulfilment and other fees per unit. */ feesPerUnit: number;
  /** Total ad spend in the period. */ ads: number;
  /** Net cost of one unit of goods now. */ unitCost: number;
  vatRate: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const toGross = (net: number, vat: number) => net * (1 + vat);

/** The model for one offer, or null when it cannot be priced: no sales in the period, or no cost per unit entered. */
export function buildPricingModel(o: OfferProfit, vatRate: number): PricingModel | null {
  if (o.units <= 0 || o.revenue <= 0 || o.unitCost === null) return null;
  return {
    offerId: o.offerId, name: o.name, units: o.units, price: o.revenue / o.units, commissionRate: o.commission / o.revenue,
    feesPerUnit: (o.delivery + o.fulfillment + o.other) / o.units, ads: o.ads, unitCost: o.unitCost, vatRate,
  };
}

export interface Whatif { price?: number; unitCost?: number; ads?: number; /** Sales lost per 1% price rise (and gained per 1% fall). 0 = same sales at any price. */ elasticity?: number }
export interface Outcome { price: number; units: number; revenue: number; commission: number; fees: number; goods: number; ads: number; profit: number; margin: number | null }

/** Units after a price change under a demand assumption. Never below zero. */
export const unitsAt = (m: PricingModel, price: number, elasticity = 0) => Math.max(0, m.units * (1 - elasticity * (price / m.price - 1)));

export function profitAt(m: PricingModel, w: Whatif = {}): Outcome {
  const price = w.price ?? m.price, cost = w.unitCost ?? m.unitCost, ads = w.ads ?? m.ads;
  const units = unitsAt(m, price, w.elasticity ?? 0);
  const revenue = units * price, commission = revenue * m.commissionRate, fees = units * m.feesPerUnit, goods = units * cost;
  const profit = revenue - commission - fees - goods - ads;
  return { price, units, revenue, commission, fees, goods, ads, profit, margin: revenue > 0 ? profit / revenue : null };
}

/** The price whose profit equals `margin` of revenue (0 = break even). Found by search, so it works with any demand assumption. Null if none in range. */
export function priceForMargin(m: PricingModel, margin = 0, w: Pick<Whatif, "unitCost" | "ads" | "elasticity"> = {}): number | null {
  const f = (p: number) => { const o = profitAt(m, { ...w, price: p }); return o.profit - margin * o.revenue; };
  // With falling sales at higher prices, profit rises and then falls again, so look for the lowest price that reaches the target.
  const lo = m.price * 0.2, hi = m.price * 6, steps = 240;
  let prev = lo;
  if (f(lo) >= 0) return lo;
  for (let i = 1; i <= steps; i++) {
    const p = lo + ((hi - lo) * i) / steps;
    if (f(p) >= 0) {
      let a = prev, b = p;
      for (let k = 0; k < 50; k++) { const mid = (a + b) / 2; if (f(mid) >= 0) b = mid; else a = mid; }
      return b;
    }
    prev = p;
  }
  return null;
}

/** The most one unit of goods can cost, at this price, for the offer to reach `margin` of revenue. For the next shipment. */
export function maxUnitCost(m: PricingModel, margin = 0, w: Pick<Whatif, "price" | "ads" | "elasticity"> = {}): number {
  const o = profitAt(m, { ...w, unitCost: 0 });
  return o.units > 0 ? (o.profit - margin * o.revenue) / o.units : 0;
}

/** The most that could have been spent on ads, at this price, and still reach `margin` of revenue. */
export function maxAds(m: PricingModel, margin = 0, w: Pick<Whatif, "price" | "unitCost" | "elasticity"> = {}): number {
  const o = profitAt(m, { ...w, ads: 0 });
  return o.profit - margin * o.revenue;
}

/** Profit across a range of price changes, for a chart. `pct` is the change from today's price (0.1 = +10%). */
export function sweep(m: PricingModel, o: { from?: number; to?: number; steps?: number } & Pick<Whatif, "unitCost" | "ads" | "elasticity"> = {}) {
  const from = o.from ?? -0.3, to = o.to ?? 0.5, steps = o.steps ?? 80;
  return Array.from({ length: steps + 1 }, (_, i) => { const pct = from + ((to - from) * i) / steps; const price = m.price * (1 + pct); return { pct, price, profit: profitAt(m, { price, unitCost: o.unitCost, ads: o.ads, elasticity: o.elasticity }).profit }; });
}

export interface PricingScenarios {
  offer: string; currency: string; vatIncluded: boolean; elasticity: number;
  now: { priceGross: number; units: number; profit: number; marginPct: number | null; unitCost: number; adsTotal: number; adsShareOfRevenuePct: number };
  breakEven: { priceGross: number | null; changePct: number | null };
  margin10: { priceGross: number | null; changePct: number | null };
  margin20: { priceGross: number | null; changePct: number | null };
  /** Net cost per unit that makes this offer break even, or reach 10% margin, at today's price. */
  maxCost: { breakEven: number; margin10: number; changePctToBreakEven: number };
  /** The most that could have been spent on ads and still break even at today's price and sales, or null when it would lose money even with no ads at all. */
  maxAdsBreakEven: number | null;
  /** True when cutting ads cannot fix the offer: it loses money before any ad spend. */
  losesEvenWithoutAds: boolean;
  /** How much of today's ad spend would have to go to break even, when cutting ads can fix it. */
  adsToCutForBreakEven: number | null;
}

/** Every figure the AI is allowed to quote. Prices are shown the way shoppers see them (with VAT); costs and ads are before VAT. */
function adsFigures(m: PricingModel, e: number) {
  const max = maxAds(m, 0, { elasticity: e });
  return { maxAdsBreakEven: max > 0 ? r2(max) : null, losesEvenWithoutAds: max <= 0, adsToCutForBreakEven: max > 0 && m.ads > max ? r2(m.ads - max) : null };
}

export function pricingScenarios(m: PricingModel, o: { currency: string; elasticity?: number }): PricingScenarios {
  const e = o.elasticity ?? 0, now = profitAt(m, { elasticity: e });
  const g = (net: number | null) => (net === null ? { priceGross: null, changePct: null } : { priceGross: r2(toGross(net, m.vatRate)), changePct: r2(((net / m.price) - 1) * 100) });
  return {
    offer: untrustedLabel(m.name, 80), currency: o.currency, vatIncluded: m.vatRate > 0, elasticity: e,
    now: { priceGross: r2(toGross(m.price, m.vatRate)), units: Math.round(m.units), profit: r2(now.profit), marginPct: now.margin === null ? null : r2(now.margin * 100), unitCost: r2(m.unitCost), adsTotal: r2(m.ads), adsShareOfRevenuePct: r2(now.revenue > 0 ? (m.ads / now.revenue) * 100 : 0) },
    breakEven: g(priceForMargin(m, 0, { elasticity: e })), margin10: g(priceForMargin(m, 0.1, { elasticity: e })), margin20: g(priceForMargin(m, 0.2, { elasticity: e })),
    maxCost: { breakEven: r2(maxUnitCost(m, 0, { elasticity: e })), margin10: r2(maxUnitCost(m, 0.1, { elasticity: e })), changePctToBreakEven: r2((maxUnitCost(m, 0, { elasticity: e }) / m.unitCost - 1) * 100) },
    ...adsFigures(m, e),
  };
}

// ---------------- the AI's part: choose and explain, never calculate ----------------
export const PRICING_SYSTEM = `You are the pricing analyst inside acezilla. An Allegro seller wants to know how to stop an offer losing money or to earn more, given what they spend on ads.

${DATA_RULES}
- The data contains every figure you may quote: today's price (with VAT), profit, what the break-even and 10% and 20% margin prices would be, the most one unit of goods could cost for the next shipment, and the ad spend that would have let it break even. Do not calculate new figures. Quote the ones given, exactly.
- Recommend 1 to 3 actions in order of what to try first, each of kind "raise_price", "lower_cost", "cut_ads", "test" or "keep". A raise_price action must name a price from the data. A lower_cost action names the highest unit cost from the data. A cut_ads action names "adsToCutForBreakEven" from the data.
- If "losesEvenWithoutAds" is true, ads are not the problem: never recommend cutting ads as the fix. Say the offer loses money before any ad spend, and focus on price and sourcing cost.
- If the change needed to break even is larger than 40% (a price rise, or a cost cut), call it unrealistic on its own and suggest combining a smaller price rise with a cheaper next shipment, or stopping the offer if neither is possible.
- Quote money and percentages as positive amounts ("a price of 30.52", "a 58.66% cut"), never with a minus sign unless the data does.
- If a price rise would likely lose sales, say so plainly: the figures assume the stated demand response ("elasticity"; 0 means sales do not change with price). Never promise a result.
- Keep each detail to two sentences. "headline" is one sentence. "watchOut" has up to 3 short cautions (for example market prices, competitors, Allegro's price rules).

Respond with JSON only.`;
export const PRICING_MAX_TOKENS = 900;
export const PRICING_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    actions: { type: "array", maxItems: 3, items: { type: "object", properties: { kind: { type: "string", enum: ["raise_price", "lower_cost", "cut_ads", "test", "keep"] }, title: { type: "string" }, detail: { type: "string" } }, required: ["kind", "title", "detail"] } },
    watchOut: { type: "array", maxItems: 3, items: { type: "string" } },
  },
  required: ["headline", "actions", "watchOut"],
} as const;
export const buildPricingPrompt = (s: PricingScenarios) => `Suggest how to fix or improve this offer's profit.\n${dataBlock("pricing", s)}`;

export interface PricingAdvice { headline: string; actions: { kind: "raise_price" | "lower_cost" | "cut_ads" | "test" | "keep"; title: string; detail: string }[]; watchOut: string[]; unverified: string[] }
const KINDS = ["raise_price", "lower_cost", "cut_ads", "test", "keep"];
const hasMarkup = (v: unknown) => typeof v === "string" && /[<>]/.test(v);

/** Validates the answer. Figures that are not in the data are not removed but flagged, so the person knows to check them. */
export function parsePricingResponse(raw: unknown, s: PricingScenarios): PricingAdvice | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.headline !== "string" || !Array.isArray(r.actions) || !Array.isArray(r.watchOut) || r.actions.length < 1 || r.actions.length > 3 || r.watchOut.length > 3) return null;
  const actions: PricingAdvice["actions"] = [];
  for (const a of r.actions) {
    if (!a || typeof a !== "object") return null;
    const x = a as Record<string, unknown>;
    if (!KINDS.includes(String(x.kind)) || typeof x.title !== "string" || typeof x.detail !== "string" || hasMarkup(x.title) || hasMarkup(x.detail)) return null;
    actions.push({ kind: x.kind as PricingAdvice["actions"][number]["kind"], title: cleanLine(x.title, 90), detail: cleanLine(x.detail, 360) });
  }
  if (r.watchOut.some((w) => typeof w !== "string" || hasMarkup(w))) return null;
  const headline = cleanLine(r.headline, 200), watchOut = (r.watchOut as string[]).map((w) => cleanLine(w, 160)).filter(Boolean);
  if (!headline || actions.some((a) => !a.title || !a.detail)) return null;
  // Figures are quoted as sizes ("cut by 58.66%"), so a negative number in the data also counts as its positive form.
  const numbers = collectNumbers(s).flatMap((n) => (n < 0 ? [n, -n] : [n]));
  return { headline, actions, watchOut, unverified: unverifiedNumbers([headline, ...actions.flatMap((a) => [a.title, a.detail]), ...watchOut].join(" "), numbers) };
}
