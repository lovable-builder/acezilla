/** Per-offer profit for a marketplace seller (Allegro): what each offer earned after fees, ads and the cost of the goods. */
export type FeeCategory = "commission" | "ads" | "delivery" | "fulfillment" | "other";
export interface LineRow { offerId: string; name: string | null; qty: number; unitPrice: number; boughtAt: string }
export interface FeeRow { category: FeeCategory; offerId: string | null; amount: number; occurredAt: string }

export interface OfferProfit {
  offerId: string; name: string; units: number;
  revenue: number; commission: number; delivery: number; fulfillment: number; other: number; fees: number; ads: number;
  /** Revenue minus fees and ads, before the cost of the goods. */ profitBeforeCost: number;
  unitCost: number | null; profit: number | null;
  /** Ad cost as a share of revenue. */ acos: number | null;
  /** The highest ad cost share that still leaves the offer at break-even (needs a unit cost). */ breakEvenAcos: number | null;
  status: "loss" | "thin" | "ok" | "unknown";
}
export interface OfferProfitReport {
  offers: OfferProfit[];
  /** Fees Allegro does not tie to an offer (subscription, some campaign charges). Counted in totals, never spread over offers. */
  accountLevel: { total: number; byCategory: Record<FeeCategory, number> };
  totals: { revenue: number; fees: number; ads: number; goodsCost: number; profit: number; units: number };
  /** Offers that sold but have no unit cost, so their profit is not final. */ missingCosts: number;
  vatRate: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => iso.slice(0, 10);
const empty = (): Record<FeeCategory, number> => ({ commission: 0, ads: 0, delivery: 0, fulfillment: 0, other: 0 });

/**
 * Amounts from Allegro are gross (VAT included). With a VAT rate every amount is divided by (1 + rate), which is what a
 * VAT-registered seller really earns and pays. `costs` are net unit costs of the goods by offer id.
 */
export function buildOfferProfit(o: { lines: LineRow[]; fees: FeeRow[]; costs: Map<string, number>; names?: Map<string, string>; vatRate: number; from: string; to: string }): OfferProfitReport {
  const net = (x: number) => x / (1 + o.vatRate);
  const inRange = (iso: string) => day(iso) >= o.from && day(iso) <= o.to;
  const m = new Map<string, OfferProfit>();
  const get = (id: string, name: string | null) => {
    let p = m.get(id);
    if (!p) { p = { offerId: id, name: name || o.names?.get(id) || `Offer ${id}`, units: 0, revenue: 0, commission: 0, delivery: 0, fulfillment: 0, other: 0, fees: 0, ads: 0, profitBeforeCost: 0, unitCost: null, profit: null, acos: null, breakEvenAcos: null, status: "unknown" }; m.set(id, p); }
    else if (name && p.name.startsWith("Offer ")) p.name = name;
    return p;
  };
  for (const l of o.lines) if (inRange(l.boughtAt)) { const p = get(l.offerId, l.name); p.units += l.qty; p.revenue += net(l.unitPrice * l.qty); }
  const account = empty();
  for (const f of o.fees) {
    if (!inRange(f.occurredAt)) continue;
    const v = net(f.amount);
    if (!f.offerId) { account[f.category] += v; continue; }
    const p = get(f.offerId, null);
    if (f.category === "ads") p.ads += v; else { p[f.category] += v; p.fees += v; }
  }
  let goods = 0, missing = 0;
  const offers = [...m.values()].map((p) => {
    p.profitBeforeCost = p.revenue - p.fees - p.ads;
    p.acos = p.revenue > 0 ? p.ads / p.revenue : null;
    const c = o.costs.get(p.offerId);
    if (c !== undefined) {
      p.unitCost = c; p.profit = p.profitBeforeCost - c * p.units; goods += c * p.units;
      p.breakEvenAcos = p.revenue > 0 ? (p.profit + p.ads) / p.revenue : null;
      p.status = p.profit < 0 ? "loss" : p.revenue > 0 && p.profit / p.revenue < 0.1 ? "thin" : "ok";
    } else if (p.units > 0) missing++;
    return p;
  }).sort((a, b) => b.revenue - a.revenue || b.ads - a.ads);
  for (const p of offers) for (const k of ["revenue", "commission", "delivery", "fulfillment", "other", "fees", "ads", "profitBeforeCost"] as const) p[k] = r2(p[k]);
  for (const p of offers) { if (p.profit !== null) p.profit = r2(p.profit); if (p.acos !== null) p.acos = Math.round(p.acos * 10000) / 10000; if (p.breakEvenAcos !== null) p.breakEvenAcos = Math.round(p.breakEvenAcos * 10000) / 10000; }
  const accountTotal = Object.values(account).reduce((a, b) => a + b, 0);
  const sum = (k: "revenue" | "fees" | "ads" | "units") => offers.reduce((a, p) => a + p[k], 0);
  return {
    offers, vatRate: o.vatRate, missingCosts: missing,
    accountLevel: { total: r2(accountTotal), byCategory: Object.fromEntries(Object.entries(account).map(([k, v]) => [k, r2(v)])) as Record<FeeCategory, number> },
    totals: { revenue: r2(sum("revenue")), fees: r2(sum("fees") + accountTotal), ads: r2(sum("ads")), goodsCost: r2(goods), units: sum("units"), profit: r2(offers.reduce((a, p) => a + p.profitBeforeCost, 0) - goods - accountTotal) },
  };
}
