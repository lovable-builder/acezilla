/** Google Merchant Center feed health: which products Google Shopping shows, which it blocks, and what it says is wrong. */

export type FeedStatus = "eligible" | "limited" | "pending" | "disapproved" | "unknown";
export interface FeedIssue { code: string; severity: string; resolution: string }
export interface FeedProduct { productId: string; offerId: string; title: string; status: FeedStatus; issues: FeedIssue[] }

export interface StatusCounts { eligible: number; limited: number; pending: number; disapproved: number; unknown: number; total: number }

export function statusCounts(products: Pick<FeedProduct, "status">[]): StatusCounts {
  const c: StatusCounts = { eligible: 0, limited: 0, pending: 0, disapproved: 0, unknown: 0, total: products.length };
  for (const p of products) c[p.status] += 1;
  return c;
}

/** Share of products Google shows in full or in a limited way. Pending and unknown products are left out, since their fate is not known yet. */
export function approvalRate(c: StatusCounts): number | null {
  const decided = c.eligible + c.limited + c.disapproved;
  return decided === 0 ? null : (c.eligible + c.limited) / decided;
}

const RANK: Record<string, number> = { disapproved: 0, demoted: 1, pending: 2 };

export interface IssueRow { code: string; severity: string; products: number }

/** The problems that hold back the most products, worst severity first. */
export function issueSummary(products: Pick<FeedProduct, "issues">[]): IssueRow[] {
  const by = new Map<string, IssueRow>();
  for (const p of products) {
    for (const code of new Set(p.issues.map((i) => i.code))) {
      const sev = p.issues.filter((i) => i.code === code).map((i) => i.severity).sort((a, b) => (RANK[a] ?? 9) - (RANK[b] ?? 9))[0] ?? "";
      const r = by.get(code) ?? { code, severity: sev, products: 0 };
      r.products += 1;
      if ((RANK[sev] ?? 9) < (RANK[r.severity] ?? 9)) r.severity = sev;
      by.set(code, r);
    }
  }
  return [...by.values()].sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) || b.products - a.products || a.code.localeCompare(b.code));
}

/** Blocked products first, then limited ones. These are the ones worth fixing. */
export function needsFix<T extends FeedProduct>(products: T[]): T[] {
  const order: Record<string, number> = { disapproved: 0, limited: 1 };
  return products.filter((p) => p.status === "disapproved" || p.status === "limited")
    .sort((a, b) => order[a.status]! - order[b.status]! || b.issues.length - a.issues.length || a.title.localeCompare(b.title));
}

/** Turns a code like missing_gtin into "Missing gtin". */
export const issueLabel = (code: string) => { const s = code.replace(/[_-]+/g, " ").trim(); return s ? s[0]!.toUpperCase() + s.slice(1) : "Issue"; };

export interface ShoppingDay { date: string; source: "free" | "ads"; clicks: number; impressions: number; conversions: number; conversionValue: number }
export interface ShoppingTotals { clicks: number; impressions: number; ctr: number | null; conversions: number; conversionValue: number }

/** Totals for free listings or ads between two dates (inclusive). */
export function shoppingTotals(rows: ShoppingDay[], source: "free" | "ads", from: string, to: string): ShoppingTotals {
  const t = { clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 };
  for (const r of rows) {
    if (r.source !== source || r.date < from || r.date > to) continue;
    t.clicks += r.clicks; t.impressions += r.impressions; t.conversions += r.conversions; t.conversionValue += r.conversionValue;
  }
  return { ...t, ctr: t.impressions > 0 ? t.clicks / t.impressions : null };
}

export interface SpendLine { key: string; name: string; sku: string | null; productId: string; spend: number }
export interface SpendOnFeed extends SpendLine { match: FeedProduct | null }
export interface FeedSpendReport {
  /** Spend on products Google blocks: shoppers cannot see them in Shopping. */ blocked: SpendOnFeed[];
  /** Spend on products Google shows with reduced reach. */ limited: SpendOnFeed[];
  /** Spend on products with no match in Merchant Center. May be a different ID, so this is a question, not a verdict. */ unmatched: SpendOnFeed[];
  blockedSpend: number; limitedSpend: number; unmatchedSpend: number;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Finds a store product in the Merchant Center feed. Feeds usually use the SKU as the offer ID; some use the store's product ID, so both are tried.
 * An ID shared by two feed products (the same item in two languages or countries) takes the worst status, since that is the one worth seeing.
 */
export function findInFeed(p: { sku: string | null; productId: string }, feed: FeedProduct[]): FeedProduct | null {
  const worst: Record<string, number> = { disapproved: 0, limited: 1, pending: 2, unknown: 3, eligible: 4 };
  for (const id of [norm(p.sku), norm(p.productId)].filter(Boolean)) {
    const hits = feed.filter((f) => norm(f.offerId) === id).sort((a, b) => worst[a.status]! - worst[b.status]!);
    if (hits[0]) return hits[0];
  }
  return null;
}

/** Money spent advertising products Google Shopping blocks or limits. Pass spend from Google Ads campaigns only, since only they use the feed. */
export function feedSpendReport(lines: SpendLine[], feed: FeedProduct[]): FeedSpendReport {
  const r: FeedSpendReport = { blocked: [], limited: [], unmatched: [], blockedSpend: 0, limitedSpend: 0, unmatchedSpend: 0 };
  for (const l of lines) {
    if (!(l.spend > 0)) continue;
    const match = findInFeed(l, feed), row = { ...l, match };
    if (!match) { r.unmatched.push(row); r.unmatchedSpend += l.spend; }
    else if (match.status === "disapproved") { r.blocked.push(row); r.blockedSpend += l.spend; }
    else if (match.status === "limited") { r.limited.push(row); r.limitedSpend += l.spend; }
  }
  for (const list of [r.blocked, r.limited, r.unmatched]) list.sort((a, b) => b.spend - a.spend);
  return r;
}

/** One product's price next to Google's benchmark: the average price other merchants charge for the same product, as Google sees it. */
export interface PriceRow { productId: string; offerId: string; title: string; price: number; benchmark: number; currency: string }
export type PriceVerdict = "above" | "near" | "below";
/** Within 3% of the benchmark counts as the same price; Google's own figure is rounded and moves daily. */
export const PRICE_NEAR = 0.03;

/** How far above (positive) or below (negative) the benchmark a price is, as a fraction of the benchmark. Null when there is no usable benchmark. */
export function priceGap(price: number, benchmark: number): number | null {
  return benchmark > 0 && price >= 0 && Number.isFinite(price) && Number.isFinite(benchmark) ? price / benchmark - 1 : null;
}
export function priceVerdict(gap: number): PriceVerdict { return gap > PRICE_NEAR ? "above" : gap < -PRICE_NEAR ? "below" : "near"; }

export interface PriceReport {
  rows: (PriceRow & { gap: number; verdict: PriceVerdict })[];
  above: number; near: number; below: number;
  /** Products priced above the benchmark, the most expensive compared with the market first. */
  overpriced: (PriceRow & { gap: number; verdict: PriceVerdict })[];
}

/** Sorts products into above, near and below the market price. Products Google has no benchmark for are left out. */
export function priceReport(rows: PriceRow[]): PriceReport {
  const out: PriceReport = { rows: [], above: 0, near: 0, below: 0, overpriced: [] };
  for (const r of rows) {
    const gap = priceGap(r.price, r.benchmark);
    if (gap === null) continue;
    const verdict = priceVerdict(gap);
    out.rows.push({ ...r, gap, verdict });
    out[verdict] += 1;
  }
  out.overpriced = out.rows.filter((r) => r.verdict === "above").sort((a, b) => b.gap - a.gap || a.title.localeCompare(b.title));
  return out;
}
