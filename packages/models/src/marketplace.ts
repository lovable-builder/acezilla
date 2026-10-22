/** Per-offer profit for a marketplace seller (Allegro): what each offer earned after fees, ads and the cost of the goods. */
export type FeeCategory = "commission" | "ads" | "delivery" | "fulfillment" | "other";
export interface LineRow { offerId: string; name: string | null; qty: number; unitPrice: number; boughtAt: string }
export interface FeeRow {
  category: FeeCategory; offerId: string | null; amount: number; occurredAt: string;
  /** From an uploaded Allegro Ads report: exact cost per offer. It replaces the same amount of untied ad charges so nothing is counted twice. */
  imported?: boolean;
}

export interface OfferProfit {
  offerId: string; name: string; units: number;
  revenue: number; commission: number; delivery: number; fulfillment: number; other: number; fees: number; ads: number;
  /** Part of fees and ads that Allegro does not tie to an offer (campaign charges, delivery, subscription), shared across offers. Already included in fees and ads. */ shared: number;
  /** Revenue minus fees and ads, before the cost of the goods. */ profitBeforeCost: number;
  unitCost: number | null; profit: number | null;
  /** Ad cost as a share of revenue. */ acos: number | null;
  /** The highest ad cost share that still leaves the offer at break-even (needs a unit cost). */ breakEvenAcos: number | null;
  status: "loss" | "thin" | "ok" | "unknown";
}
export interface OfferProfitReport {
  offers: OfferProfit[];
  /** Fees that could not be shared because no offer sold in the period. Normally zero: otherwise they are shared across the offers that sold. */
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
    if (!p) { p = { offerId: id, name: name || o.names?.get(id) || `Offer ${id}`, units: 0, revenue: 0, commission: 0, delivery: 0, fulfillment: 0, other: 0, fees: 0, ads: 0, shared: 0, profitBeforeCost: 0, unitCost: null, profit: null, acos: null, breakEvenAcos: null, status: "unknown" }; m.set(id, p); }
    else if (name && p.name.startsWith("Offer ")) p.name = name;
    return p;
  };
  for (const l of o.lines) if (inRange(l.boughtAt)) { const p = get(l.offerId, l.name); p.units += l.qty; p.revenue += net(l.unitPrice * l.qty); }
  const account = empty();
  let imported = 0;
  for (const f of o.fees) {
    if (!inRange(f.occurredAt)) continue;
    const v = net(f.amount);
    if (f.imported && f.offerId) { get(f.offerId, null).ads += v; imported += v; continue; }
    if (!f.offerId) { account[f.category] += v; continue; }
    const p = get(f.offerId, null);
    if (f.category === "ads") p.ads += v; else { p[f.category] += v; p.fees += v; }
  }
  account.ads = Math.max(0, account.ads - imported);
  // Campaign charges, delivery and the subscription are not tied to one offer by Allegro. Leaving them out would show every offer
  // as profitable while the account loses money, so they are shared across the offers that sold: ads equally per offer (the average ad
  // spend per offer), subscription and other by share of sales, delivery by share of units. The shared part is kept on each offer so the table can say so.
  const sold = [...m.values()].filter((p) => p.revenue > 0);
  const totalRev = sold.reduce((a, p) => a + p.revenue, 0), totalUnits = sold.reduce((a, p) => a + p.units, 0);
  if (totalRev > 0) {
    for (const p of sold) {
      const byRev = p.revenue / totalRev, byUnits = totalUnits > 0 ? p.units / totalUnits : byRev;
      const adShare = account.ads / sold.length;
      p.ads += adShare; p.shared += adShare;
      for (const k of ["commission", "fulfillment", "other"] as const) { p[k] += account[k] * byRev; p.fees += account[k] * byRev; p.shared += account[k] * byRev; }
      p.delivery += account.delivery * byUnits; p.fees += account.delivery * byUnits; p.shared += account.delivery * byUnits;
    }
    for (const k of Object.keys(account) as FeeCategory[]) account[k] = 0;
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
  for (const p of offers) for (const k of ["revenue", "commission", "delivery", "fulfillment", "other", "fees", "ads", "shared", "profitBeforeCost"] as const) p[k] = r2(p[k]);
  for (const p of offers) { if (p.profit !== null) p.profit = r2(p.profit); if (p.acos !== null) p.acos = Math.round(p.acos * 10000) / 10000; if (p.breakEvenAcos !== null) p.breakEvenAcos = Math.round(p.breakEvenAcos * 10000) / 10000; }
  const accountTotal = Object.values(account).reduce((a, b) => a + b, 0);
  const sum = (k: "revenue" | "fees" | "ads" | "units") => offers.reduce((a, p) => a + p[k], 0);
  return {
    offers, vatRate: o.vatRate, missingCosts: missing,
    accountLevel: { total: r2(accountTotal), byCategory: Object.fromEntries(Object.entries(account).map(([k, v]) => [k, r2(v)])) as Record<FeeCategory, number> },
    totals: { revenue: r2(sum("revenue")), fees: r2(sum("fees") + accountTotal), ads: r2(sum("ads")), goodsCost: r2(goods), units: sum("units"), profit: r2(offers.reduce((a, p) => a + p.profitBeforeCost, 0) - goods - accountTotal) },
  };
}
