import { shiftDate } from "./dashboard";
import type { OrderRow } from "./store";

/** Where an order was placed: the store or marketplace it belongs to, not the marketing source that sent the customer. */
export interface SalesChannelRow { channel: string; orders: number; revenue: number; share: number }

const channelOf = (externalId: string | undefined, connected: string[]): string => {
  if (externalId?.startsWith("allegro:")) return "allegro";
  if (externalId?.startsWith("woo:")) return "woocommerce";
  // Orders with no recognisable prefix belong to the only other connected store, if there is exactly one.
  const others = connected.filter((c) => c !== "allegro");
  return others.length === 1 ? others[0]! : "other";
};

/**
 * Orders and revenue per connected sales channel in a window. Every connected channel is listed, with zeros when it had no
 * orders, so a connected store never disappears from the picture just because it did not sell. "other" only appears when
 * orders exist that belong to no connected channel.
 */
export function buildChannels(orders: OrderRow[], o: { connected: string[]; windowDays: number; endDate: string }): SalesChannelRow[] {
  const from = shiftDate(o.endDate, -(o.windowDays - 1));
  const m = new Map<string, { orders: number; revenue: number }>(o.connected.map((c) => [c, { orders: 0, revenue: 0 }]));
  let total = 0;
  for (const r of orders) {
    const d = r.createdAt.slice(0, 10);
    if (d < from || d > o.endDate) continue;
    const ch = channelOf(r.externalId, o.connected);
    const g = m.get(ch) ?? { orders: 0, revenue: 0 };
    g.orders += 1; g.revenue += r.revenue; total += r.revenue;
    m.set(ch, g);
  }
  return [...m].map(([channel, g]) => ({ channel, orders: g.orders, revenue: Math.round(g.revenue * 100) / 100, share: total > 0 ? g.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue || a.channel.localeCompare(b.channel));
}
