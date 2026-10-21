import type { Dashboard } from "./dashboard";
import { UNTAGGED, type StoreSales } from "./store";

export interface Insight { id: string; tone: "good" | "warn" | "bad" | "info"; title: string; detail: string; weight: number }
export interface InsightOptions {
  /** Formats an amount in the workspace currency. */ money: (n: number) => string;
  /** Platforms that report spend but not revenue or conversions (Allegro Ads): left out of "no conversions" and ROAS comparisons. */ nonReporting?: string[];
}

const pctText = (p: number) => `${Math.abs(p * 100).toFixed(0)}%`;
const LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok", allegro: "Allegro" };
export const platformName = (p: string) => LABEL[p] ?? p;

/**
 * Plain-language findings from the numbers on the page. Rules, not AI: each one states what changed and why it matters,
 * and is only shown when the data actually supports it. Most important first, at most `limit`.
 */
export function buildInsights(d: Dashboard, store: StoreSales | null, o: InsightOptions, limit = 6): Insight[] {
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);
  const nonReporting = new Set(o.nonReporting ?? []);
  const days = d.windowDays;
  const spend = d.kpis.spend.value;
  const reporting = d.campaigns.filter((c) => !nonReporting.has(c.platform));
  const reportingSpend = reporting.reduce((s, c) => s + c.spend, 0), reportingRevenue = reporting.reduce((s, c) => s + c.revenue, 0);

  // 1. Is the business growing? Real store revenue first, platform revenue if there is no store.
  if (store && store.revenue.deltaPct !== null && Math.abs(store.revenue.deltaPct) >= 0.1) {
    const up = store.revenue.deltaPct > 0;
    add({ id: "store-revenue", tone: up ? "good" : "bad", weight: 90, title: `Store revenue is ${up ? "up" : "down"} ${pctText(store.revenue.deltaPct)}`, detail: `${o.money(store.revenue.value)} in the last ${days} days, against ${o.money(store.revenue.prev)} in the ${days} days before.` });
  }

  // 2. Spend moving the wrong way against results.
  const salesDelta = store ? store.revenue.deltaPct : d.kpis.revenue.deltaPct;
  if (d.kpis.spend.deltaPct !== null && d.kpis.spend.deltaPct >= 0.15 && salesDelta !== null && salesDelta <= 0)
    add({ id: "spend-up-sales-flat", tone: "warn", weight: 85, title: `Spend is up ${pctText(d.kpis.spend.deltaPct)} but sales are ${salesDelta < -0.005 ? `down ${pctText(salesDelta)}` : "flat"}`, detail: `You spent ${o.money(spend)} (${o.money(d.kpis.spend.prev)} before). More budget is not producing more orders yet. Check which campaigns grew.` });

  // 3. Do the ad platforms claim more than the store actually earned?
  if (store && d.kpis.spend.value > 0 && store.revenue.value > 0 && reportingSpend > 0 && nonReporting.size === 0) {
    const platformRoas = reportingRevenue / reportingSpend, storeRoas = store.revenue.value / spend;
    if (platformRoas > storeRoas * 1.25) add({ id: "overreport", tone: "warn", weight: 80, title: `Ad platforms report ${platformRoas.toFixed(1)}x, your store earned ${storeRoas.toFixed(1)}x`, detail: `Platforms claim ${o.money(reportingRevenue)} of revenue; your store recorded ${o.money(store.revenue.value)} in total. Judge budgets by the store figure.` });
    else if (storeRoas > platformRoas * 1.1 && platformRoas > 0) add({ id: "underreport", tone: "info", weight: 40, title: `Your store earned more than platforms credit`, detail: `Store ROAS is ${storeRoas.toFixed(1)}x against ${platformRoas.toFixed(1)}x reported. Sales that ads influence but do not get credit for (direct, organic, other channels) make up the difference.` });
  }

  // 4. Money going to campaigns that report no conversions at all.
  const wasteMin = Math.max(spend * 0.05, 1);
  const waste = reporting.filter((c) => c.conversions === 0 && c.spend >= wasteMin);
  if (waste.length) {
    const total = waste.reduce((s, c) => s + c.spend, 0);
    add({ id: "no-conversions", tone: "bad", weight: 88, title: `${o.money(total)} spent on ${waste.length === 1 ? "a campaign" : `${waste.length} campaigns`} with no conversions`, detail: `${waste.slice(0, 3).map((c) => `${c.name} (${o.money(c.spend)})`).join(", ")}${waste.length > 3 ? ` and ${waste.length - 3} more` : ""}. Pause or fix these first.` });
  }

  // 5. Best and weakest campaigns by return.
  const ranked = reporting.filter((c) => c.roas !== null && c.spend >= wasteMin && c.conversions > 0).sort((a, b) => b.roas! - a.roas!);
  if (ranked.length >= 2) {
    const best = ranked[0]!, worst = ranked[ranked.length - 1]!;
    if (best.roas! >= worst.roas! * 1.5) add({ id: "best-worst", tone: "info", weight: 60, title: `${best.name} returns ${best.roas!.toFixed(1)}x, ${worst.name} only ${worst.roas!.toFixed(1)}x`, detail: `Moving budget from the weaker campaign to the stronger one is the cheapest improvement available. Spend: ${o.money(best.spend)} vs ${o.money(worst.spend)}.` });
  }

  // 6. Budget concentrated in one campaign.
  const top = d.campaigns[0];
  if (top && d.campaigns.length >= 3 && spend > 0 && top.spend / spend >= 0.6) add({ id: "concentration", tone: "info", weight: 35, title: `${pctText(top.spend / spend)} of spend is in one campaign`, detail: `${top.name} takes ${o.money(top.spend)} of ${o.money(spend)}. If it slips, the whole account does.` });

  // 7. Where orders come from, and whether that can be trusted.
  if (store && store.orders.value >= 10 && store.taggedShare !== null) {
    const untagged = store.sources.find((s) => s.source === UNTAGGED);
    if (untagged && untagged.share >= 0.5) add({ id: "untagged", tone: "warn", weight: 70, title: `${pctText(untagged.share)} of store revenue has no marketing source`, detail: `Without UTM tags or click IDs on orders, acezilla cannot tell which ads brought them. Add UTM tags to your ad links and keep WooCommerce order attribution on.` });
    else {
      const first = store.sources.find((s) => s.source !== UNTAGGED);
      // One source covering every order is not a finding.
      if (first && first.share >= 0.3 && first.share < 0.995 && store.sources.length >= 2) add({ id: "top-source", tone: "info", weight: 45, title: `${first.source.replace(/^./, (c) => c.toUpperCase())} brings ${pctText(first.share)} of store revenue`, detail: `${first.orders} orders worth ${o.money(first.revenue)} in the last ${days} days.` });
    }
  }
  if (store && store.aov.deltaPct !== null && Math.abs(store.aov.deltaPct) >= 0.15 && store.orders.value >= 10) {
    const up = store.aov.deltaPct > 0;
    add({ id: "aov", tone: up ? "good" : "warn", weight: 50, title: `Average order is ${up ? "up" : "down"} ${pctText(store.aov.deltaPct)}`, detail: `${o.money(store.aov.value)} per order, from ${o.money(store.aov.prev)}.` });
  }

  // 8. Sharp campaign changes already detected.
  const high = d.anomalies.filter((a) => a.severity === "high").length;
  if (d.anomalies.length) add({ id: "anomalies", tone: high ? "bad" : "warn", weight: high ? 95 : 65, title: `${d.anomalies.length} campaign${d.anomalies.length === 1 ? "" : "s"} changed sharply`, detail: `${d.anomalies[0]!.title}. See Anomalies below.` });

  // 9. Marketplace ads (Allegro) cost money but have no revenue of their own: judge them by their cost against that marketplace's sales.
  const mk = d.platforms.find((p) => nonReporting.has(p.platform));
  if (mk && mk.spend > 0) {
    const name = platformName(mk.platform);
    const sales = store?.sources.find((s) => s.source === mk.platform)?.revenue ?? 0;
    if (sales > 0) {
      const share = mk.spend / sales;
      add({ id: "nonreporting", tone: share >= 0.3 ? "warn" : "info", weight: share >= 0.3 ? 75 : 55, title: `${name} ads cost ${pctText(share)} of ${name} sales`, detail: `${o.money(mk.spend)} of ads for ${o.money(sales)} of sales in the last ${days} days. ${name} does not report revenue per ad, so ads are judged by this ratio.${share >= 0.3 ? " That is a high share: check which offers the spend goes to." : ""}` });
    } else add({ id: "nonreporting", tone: "info", weight: 30, title: `${name} ads: ${o.money(mk.spend)} spent`, detail: `No ${name} sales in this period to compare it with, and ${name} does not report revenue per ad.` });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}
