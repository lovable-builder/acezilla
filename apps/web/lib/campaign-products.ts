import { matchProduct, stockLevel, type ProductRow, type StockLevel } from "@acezilla/models";

export interface CampaignProduct { product: ProductRow; source: "manual" | "auto"; stock: StockLevel }

/**
 * The product each campaign sells. A link a person made always wins; otherwise a strict name match is suggested.
 * Allegro's own "Allegro Ads" entry is skipped: it covers many offers, not one product.
 */
export function resolveCampaignProducts(campaigns: { campaignId: string; name: string; platform: string }[], products: ProductRow[], links: Map<string, { channel: string; productId: string }>): Map<string, CampaignProduct> {
  const listed = products.filter((p) => p.listed);
  const byKey = new Map(listed.map((p) => [`${p.channel}|${p.productId}`, p]));
  const out = new Map<string, CampaignProduct>();
  for (const c of campaigns) {
    if (c.platform === "allegro") continue;
    const link = links.get(c.campaignId);
    const manual = link ? byKey.get(`${link.channel}|${link.productId}`) : undefined;
    const auto = manual ? null : matchProduct(c.name, listed.map((p) => ({ channel: p.channel, productId: p.productId, name: p.name, sku: p.sku })));
    const product = manual ?? (auto ? byKey.get(`${auto.channel}|${auto.productId}`) : undefined);
    if (product) out.set(c.campaignId, { product, source: manual ? "manual" : "auto", stock: stockLevel({ qty: product.stockQty, status: product.stock }) });
  }
  return out;
}
