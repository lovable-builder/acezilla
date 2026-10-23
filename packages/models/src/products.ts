/** Every product or listing across the connected stores, including the ones that have not sold. */
export interface CatalogItem { channel: string; productId: string; name: string; price: number | null; status: string | null; stock: string | null; /** Units in stock when known. */ stockQty?: number | null; sku?: string | null }
export interface SoldLine { channel: string; productId: string; name: string | null; qty: number; unitPrice: number; at: string }
export interface ProductRow {
  channel: string; productId: string; name: string; price: number | null; status: string | null; stock: string | null; stockQty: number | null; sku: string | null;
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
  for (const c of o.catalog) m.set(key(c.channel, c.productId), { ...c, stockQty: c.stockQty ?? null, sku: c.sku ?? null, units: 0, revenue: 0, listed: true });
  for (const l of o.lines) {
    if (day(l.at) < o.from || day(l.at) > o.to) continue;
    const k = key(l.channel, l.productId);
    let r = m.get(k);
    if (!r) { r = { channel: l.channel, productId: l.productId, name: l.name || `Product ${l.productId}`, price: null, status: null, stock: null, stockQty: null, sku: null, units: 0, revenue: 0, listed: false }; m.set(k, r); }
    r.units += l.qty;
    r.revenue += (l.unitPrice * l.qty) / (1 + (o.vat?.[l.channel] ?? 0));
  }
  return [...m.values()].map((r) => ({ ...r, revenue: r2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name));
}
