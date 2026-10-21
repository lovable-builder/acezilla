import type { CampaignRow } from "./dashboard";
import { orderSource, UNTAGGED, type OrderRow } from "./store";

/** Which ad platform an order's marketing source belongs to, if any. */
export function platformOfSource(source: string): string | null {
  if (["facebook", "instagram", "meta", "fb", "ig"].includes(source)) return "meta";
  if (["google", "adwords", "googleads"].includes(source)) return "google";
  if (source === "tiktok") return "tiktok";
  if (source === "allegro") return "allegro";
  return null;
}

export interface ChannelRow {
  platform: string; spend: number; platformRevenue: number; platformRoas: number | null;
  storeOrders: number; storeRevenue: number; storeRoas: number | null;
  /** Share of the platform's claimed revenue that the store cannot confirm. Null when the platform reports no revenue. */ overclaim: number | null;
}
export interface CampaignMatch { orders: number; revenue: number; modeledRoas: number | null }
export interface Attribution {
  channels: ChannelRow[];
  /** Orders and revenue matched to each ad campaign through the order's utm campaign tag. */ campaigns: Map<string, CampaignMatch>;
  /** Campaign tags on orders that match no campaign we know, so the money is visible but unassigned. */ unmatched: { campaign: string; source: string; orders: number; revenue: number }[];
  otherSources: { source: string; orders: number; revenue: number }[];
  untagged: { orders: number; revenue: number; share: number };
  customers: { orders: number; customers: number; repeatShare: number | null };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildAttribution(o: {
  platforms: { platform: string; spend: number; revenue: number }[]; campaigns: (CampaignRow & { externalId?: string })[]; orders: OrderRow[];
  /** Platforms whose revenue is not reported per ad (Allegro). */ nonReporting?: string[];
}): Attribution {
  const nonReporting = new Set(o.nonReporting ?? []);
  const total = o.orders.reduce((s, x) => s + x.revenue, 0);
  const byPlatform = new Map<string, { orders: number; revenue: number }>();
  const other = new Map<string, { orders: number; revenue: number }>();
  let un = { orders: 0, revenue: 0 };
  const campaigns = new Map<string, CampaignMatch>();
  const unmatched = new Map<string, { campaign: string; source: string; orders: number; revenue: number }>();
  const spendOf = new Map(o.campaigns.map((c) => [c.campaignId, c.spend]));
  const cnames = o.campaigns.map((c) => ({ c, n: norm(c.name), id: norm(String(c.externalId ?? c.campaignId)) }));
  const bump = <K,>(mp: Map<K, { orders: number; revenue: number }>, k: K, rev: number) => { const v = mp.get(k) ?? { orders: 0, revenue: 0 }; v.orders++; v.revenue += rev; mp.set(k, v); };

  for (const ord of o.orders) {
    const source = orderSource(ord);
    if (source === UNTAGGED) { un = { orders: un.orders + 1, revenue: un.revenue + ord.revenue }; continue; }
    const plat = platformOfSource(source);
    if (plat) bump(byPlatform, plat, ord.revenue); else bump(other, source, ord.revenue);
    const tag = ord.utm?.campaign ? norm(ord.utm.campaign) : "";
    if (!tag) continue;
    const pool = cnames.filter((x) => !plat || x.c.platform === plat);
    const hit = pool.find((x) => x.n === tag) ?? pool.find((x) => x.id === tag) ?? (tag.length >= 6 ? pool.find((x) => x.n.includes(tag) || (x.n.length >= 6 && tag.includes(x.n))) : undefined);
    if (hit) { const v = campaigns.get(hit.c.campaignId) ?? { orders: 0, revenue: 0, modeledRoas: null }; v.orders++; v.revenue += ord.revenue; campaigns.set(hit.c.campaignId, v); }
    else { const k = `${source}|${tag}`; const v = unmatched.get(k) ?? { campaign: ord.utm!.campaign!, source, orders: 0, revenue: 0 }; v.orders++; v.revenue += ord.revenue; unmatched.set(k, v); }
  }
  for (const [id, v] of campaigns) { const sp = spendOf.get(id) ?? 0; v.modeledRoas = sp > 0 ? v.revenue / sp : null; }

  const names = new Set([...o.platforms.map((p) => p.platform), ...byPlatform.keys()]);
  const channels: ChannelRow[] = [...names].map((platform) => {
    const p = o.platforms.find((x) => x.platform === platform) ?? { spend: 0, revenue: 0 };
    const s = byPlatform.get(platform) ?? { orders: 0, revenue: 0 };
    const reports = !nonReporting.has(platform) && p.revenue > 0;
    return {
      platform, spend: p.spend, platformRevenue: reports ? p.revenue : 0, platformRoas: reports && p.spend > 0 ? p.revenue / p.spend : null,
      storeOrders: s.orders, storeRevenue: s.revenue, storeRoas: p.spend > 0 ? s.revenue / p.spend : null,
      overclaim: reports && p.revenue > s.revenue ? (p.revenue - s.revenue) / p.revenue : reports ? 0 : null,
    };
  }).sort((a, b) => b.spend - a.spend || b.storeRevenue - a.storeRevenue);

  const counts = new Map<string, number>();
  for (const x of o.orders) if (x.customerId) counts.set(x.customerId, (counts.get(x.customerId) ?? 0) + 1);
  const withCustomer = o.orders.filter((x) => x.customerId).length;
  const repeatOrders = [...counts.values()].filter((n) => n >= 2).reduce((a, b) => a + b, 0);

  return {
    channels, campaigns,
    unmatched: [...unmatched.values()].sort((a, b) => b.revenue - a.revenue),
    otherSources: [...other].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.revenue - a.revenue),
    untagged: { ...un, share: total > 0 ? un.revenue / total : 0 },
    customers: { orders: withCustomer, customers: counts.size, repeatShare: withCustomer > 0 ? repeatOrders / withCustomer : null },
  };
}
