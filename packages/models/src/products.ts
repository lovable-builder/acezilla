/** Every product or listing across the connected stores, including the ones that have not sold. */
export interface CatalogItem { channel: string; productId: string; name: string; price: number | null; status: string | null; stock: string | null; /** Units in stock when known. */ stockQty?: number | null; sku?: string | null; /** The product photo (an https address). */ imageUrl?: string | null; /** All photos of the listing, main first. */ images?: string[] }
export interface SoldLine { channel: string; productId: string; name: string | null; qty: number; unitPrice: number; at: string }
export interface ProductRow {
  channel: string; productId: string; name: string; price: number | null; status: string | null; stock: string | null; stockQty: number | null; sku: string | null; imageUrl: string | null; images: string[];
  units: number; revenue: number;
  /** True when it is in the store's catalogue; false for something that sold but is no longer listed. */ listed: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => iso.slice(0, 10);

/**
 * Joins the catalogue with sales in a period. A listed product with no sales is a row of zeros, not a missing row. Revenue is
 * before tax: `vat` gives the rate to take off for channels whose prices include it (Allegro), by channel.
 */
export function buildProductList(o: { catalog: CatalogItem[]; lines: SoldLine[]; from: string; to: string; vat?: Record<string, number> }): ProductRow[] {
  const key = (c: string, id: string) => `${c}|${id}`;
  const m = new Map<string, ProductRow>();
  for (const c of o.catalog) m.set(key(c.channel, c.productId), { ...c, stockQty: c.stockQty ?? null, sku: c.sku ?? null, imageUrl: c.imageUrl ?? null, images: c.images?.length ? c.images : c.imageUrl ? [c.imageUrl] : [], units: 0, revenue: 0, listed: true });
  for (const l of o.lines) {
    if (day(l.at) < o.from || day(l.at) > o.to) continue;
    const k = key(l.channel, l.productId);
    let r = m.get(k);
    if (!r) { r = { channel: l.channel, productId: l.productId, name: l.name || `Product ${l.productId}`, price: null, status: null, stock: null, stockQty: null, sku: null, imageUrl: null, images: [], units: 0, revenue: 0, listed: false }; m.set(k, r); }
    r.units += l.qty;
    r.revenue += (l.unitPrice * l.qty) / (1 + (o.vat?.[l.channel] ?? 0));
  }
  return [...m.values()].map((r) => ({ ...r, revenue: r2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name));
}

export interface StoreProfitRow extends ProductRow {
  /** Net cost of one unit, as entered. */ unitCost: number | null;
  /** Ad spend of the campaigns linked to the product, in the period. */ ads: number;
  /** Sales minus goods cost minus ad spend. Null until a cost per unit is entered. Payment and shipping costs are not included. */ profit: number | null;
}
/**
 * Profit per product for a store that has no marketplace fees in its data (WooCommerce): net sales, minus the goods sold at the
 * entered cost, minus the ad spend of campaigns linked to the product. Products that neither sold nor are listed are left out.
 */
export function buildStoreProductProfit(o: { rows: ProductRow[]; channel: string; costs: Map<string, number>; adSpend: Map<string, number> }) {
  const rows: StoreProfitRow[] = o.rows.filter((r) => r.channel === o.channel && (r.listed || r.units > 0)).map((r) => {
    const unitCost = o.costs.get(r.productId) ?? null, ads = r2(o.adSpend.get(`${r.channel}|${r.productId}`) ?? 0);
    return { ...r, unitCost, ads, profit: unitCost === null ? null : r2(r.revenue - unitCost * r.units - ads) };
  }).sort((a, b) => b.revenue - a.revenue || b.ads - a.ads || a.name.localeCompare(b.name));
  const priced = rows.filter((r) => r.profit !== null);
  return { rows, totals: { revenue: r2(rows.reduce((s, r) => s + r.revenue, 0)), ads: r2(rows.reduce((s, r) => s + r.ads, 0)), units: rows.reduce((s, r) => s + r.units, 0), profit: r2(priced.reduce((s, r) => s + (r.profit ?? 0), 0)) }, missingCosts: rows.filter((r) => r.units > 0 && r.unitCost === null).length };
}
