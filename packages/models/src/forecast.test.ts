import { test } from "node:test";
import assert from "node:assert/strict";
import { beta, binomial, breakEven, CHANNEL_LABEL, CHANNEL_NOTE, channelDefaults, CHANNELS, compareChannels, DESTINATIONS, NOT_OPEN_YET, contributionPerOrder, expectedOutcome, histogram, lognormal, mulberry32, normal, outcomeOf, quantile, sensitivity, simulateCampaign, unitEconomics, type CampaignInput, type ChannelFees, type SalesChannel } from "./forecast";

// Price 123 with 23% VAT = 100 net. Commission 10% + payment 2% => 88 kept, less 2 fixed, 6 shipping, 40 goods = 40 per order.
// 1000 budget at 2.00 per click = 500 clicks, at 4% = 20 orders => 800 before ads, so profit -200 with no returns.
const BASE: CampaignInput = {
  budget: 1000, cpc: { mean: 2, spread: 0.2 }, cvr: { mean: 0.04, clicks: 2000 }, price: 123, unitCost: 40, vatRate: 0.23,
  fees: { commissionRate: 0.1, fixedPerOrder: 1, paymentRate: 0.02, paymentFixed: 1, shippingPerOrder: 6, returnRate: 0 },
};
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const mv = (xs: number[]) => { const m = xs.reduce((s, v) => s + v, 0) / xs.length; return { m, v: xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length }; };

test("same seed gives the same forecast; a different seed differs", () => {
  const a = simulateCampaign(BASE, { trials: 2000, seed: 7 }), b = simulateCampaign(BASE, { trials: 2000, seed: 7 }), c = simulateCampaign(BASE, { trials: 2000, seed: 8 });
  assert.deepEqual(Array.from(a.profits), Array.from(b.profits));
  assert.notDeepEqual(Array.from(a.profits), Array.from(c.profits));
});

test("samplers have the right mean and spread", () => {
  const r = mulberry32(3), N = 40000;
  const n = mv(Array.from({ length: N }, () => normal(r)));
  near(n.m, 0, 0.03); near(n.v, 1, 0.05);
  const l = mv(Array.from({ length: N }, () => lognormal(r, 2, 0.3)));
  near(l.m, 2, 0.03); near(Math.sqrt(l.v) / l.m, 0.3, 0.02);
  const b = mv(Array.from({ length: N }, () => beta(r, 4, 96)));
  near(b.m, 0.04, 0.002); near(b.v, (0.04 * 0.96) / 101, 0.0002);
  for (const [nn, p] of [[20, 0.3], [300, 0.04], [5000, 0.5], [400, 0.97]] as const) {
    const s = mv(Array.from({ length: N }, () => binomial(r, nn, p)));
    near(s.m / (nn * p), 1, 0.03); near(s.v / (nn * p * (1 - p)), 1, 0.1);
  }
  assert.equal(binomial(r, 0, 0.5), 0); assert.equal(binomial(r, 10, 0), 0); assert.equal(binomial(r, 10, 1), 10);
});

test("the average case follows the hand-worked sums", () => {
  near(contributionPerOrder(BASE), 40);
  const e = expectedOutcome(BASE);
  near(e.clicks, 500); near(e.orders, 20); near(e.storeRevenue, 2000); near(e.profit, -200);
  near(e.channelFees, 20 * (100 * 0.12 + 2)); near(e.goods, 800);
});

test("returns cost shipping both ways and recover goods and commission", () => {
  const i = { ...BASE, fees: { ...BASE.fees, returnRate: 0.5 } };
  near(contributionPerOrder(i), 0.5 * 40 - 0.5 * 12);
  const o = outcomeOf(i, 500, 20, 10);
  near(o.kept, 10); near(o.shipping, 10 * 6 + 10 * 12); near(o.profit, 10 * 100 - 10 * 14 - 10 * 40 - 180 - 1000);
});

test("with no spread and many trials the simulation matches the average case", () => {
  const i = { ...BASE, budget: 20000, cpc: { mean: 2, spread: 0 }, cvr: { mean: 0.04, clicks: 3000 } };
  const s = simulateCampaign(i, { trials: 6000, seed: 2 }), e = expectedOutcome(i);
  near(s.mean / e.profit, 1, 0.03);
  near(s.avgOrders / e.orders, 1, 0.02);
});

test("closed-form break-even values give zero profit when used", () => {
  const i = { ...BASE, fees: { ...BASE.fees, returnRate: 0.1 } };
  const be = breakEven(i);
  const profitOf = (x: CampaignInput) => { const o = expectedOutcome(x); return o.profit; };
  near(profitOf({ ...i, cvr: { ...i.cvr, mean: be.cvr! } }), 0, 1e-6);
  near(profitOf({ ...i, cpc: { ...i.cpc, mean: be.cpc! } }), 0, 1e-6);
  near(profitOf({ ...i, price: be.price! }), 0, 1e-6);
  near(profitOf({ ...i, unitCost: be.unitCost! }), 0, 1e-6);
  near(expectedOutcome(i).orders * contributionPerOrder(i) - i.budget, expectedOutcome(i).profit, 1e-6);
  near(be.orders! * contributionPerOrder(i), i.budget);
  near(be.adCostPerOrder!, 50);
});

test("when an order earns nothing no break-even conversion rate exists", () => {
  const be = breakEven({ ...BASE, unitCost: 95 });
  assert.equal(be.cvr, null); assert.equal(be.cpc, null); assert.equal(be.orders, null);
  assert.ok(be.price !== null && be.price > BASE.price);
});

test("a losing campaign almost never profits and a strong one almost always does", () => {
  assert.ok(simulateCampaign({ ...BASE, unitCost: 95 }, { trials: 3000 }).probProfit < 0.001);
  const strong = simulateCampaign({ ...BASE, cvr: { mean: 0.1, clicks: 5000 }, cpc: { mean: 1, spread: 0.1 } }, { trials: 3000 });
  assert.ok(strong.probProfit > 0.99 && strong.q.p10 > 0);
});

test("percentiles are ordered and the scenarios follow them", () => {
  const s = simulateCampaign({ ...BASE, cvr: { mean: 0.06, clicks: 400 } }, { trials: 4000 });
  const q = s.q;
  assert.ok(q.p01 <= q.p05 && q.p05 <= q.p10 && q.p10 <= q.p25 && q.p25 <= q.p50 && q.p50 <= q.p75 && q.p75 <= q.p90 && q.p90 <= q.p99);
  assert.ok(s.scenarios.pessimistic.profit <= s.scenarios.base.profit && s.scenarios.base.profit <= s.scenarios.optimistic.profit);
  near(s.scenarios.base.profit, q.p50, Math.max(1, Math.abs(q.p50) * 0.1) + 400);
  near(s.probProfit + s.probLoss, 1);
  assert.ok(s.probLoseHalf <= s.probLoss);
});

test("fewer clicks behind the conversion rate means a wider spread of results", () => {
  const sure = simulateCampaign({ ...BASE, cvr: { mean: 0.06, clicks: 3000 } }, { trials: 4000 }), unsure = simulateCampaign({ ...BASE, cvr: { mean: 0.06, clicks: 40 } }, { trials: 4000 });
  assert.ok(unsure.q.p90 - unsure.q.p10 > sure.q.p90 - sure.q.p10);
});

test("histogram counts every trial", () => {
  const s = simulateCampaign(BASE, { trials: 3000 });
  const h = histogram(s.profits, 30);
  assert.equal(h.length, 30);
  assert.equal(h.reduce((t, b) => t + b.count, 0), 3000);
  near(quantile([1, 2, 3, 4], 0.5), 2.5);
});

test("higher commission lowers profit; sensitivity ranks the inputs by effect", () => {
  const a = simulateCampaign(BASE, { trials: 3000, seed: 5 }), b = simulateCampaign({ ...BASE, fees: { ...BASE.fees, commissionRate: 0.2 } }, { trials: 3000, seed: 5 });
  assert.ok(b.q.p50 < a.q.p50);
  const sens = sensitivity({ ...BASE, cvr: { mean: 0.06, clicks: 800 } }, { trials: 1500 });
  assert.equal(sens.length, 6);
  const span = (s: { lowMedian: number; highMedian: number }) => Math.abs(s.highMedian - s.lowMedian);
  for (let k = 1; k < sens.length; k++) assert.ok(span(sens[k - 1]!) >= span(sens[k]!));
  const price = sens.find((s) => s.input === "price")!, cpc = sens.find((s) => s.input === "cpc")!;
  assert.ok(price.highMedian > price.lowMedian && cpc.highMedian < cpc.lowMedian);
});

test("unit economics adds up to the shelf price", () => {
  const parts = unitEconomics(BASE);
  near(parts.reduce((s, p) => s + p.amount, 0), BASE.price);
  near(parts.find((p) => p.label === "Left over")!.amount, 40 - 50);
});

test("channel defaults scale fixed amounts to the currency and channels compare", () => {
  assert.equal(channelDefaults("tiktokshop", "USD").fixedPerOrder, 0.3);
  near(channelDefaults("tiktokshop", "PLN").fixedPerOrder, 1.17);
  const fees = Object.fromEntries(CHANNELS.map((c) => [c, channelDefaults(c, "USD")])) as Record<SalesChannel, ChannelFees>;
  const c = compareChannels({ ...BASE, fees: fees.allegro }, DESTINATIONS.tiktok, fees, { trials: 1000 });
  assert.deepEqual(c.map((x) => x.channel), DESTINATIONS.tiktok);
});

test("every destination is open for every ad platform, with the natural ones first, and each has fees and a label", () => {
  for (const p of Object.keys(DESTINATIONS) as (keyof typeof DESTINATIONS)[]) assert.deepEqual([...DESTINATIONS[p]].sort(), [...CHANNELS].sort());
  assert.deepEqual(DESTINATIONS.tiktok.slice(0, 2), ["woocommerce", "tiktokshop"]);
  assert.deepEqual(DESTINATIONS.meta.slice(0, 4), ["woocommerce", "instagramshop", "metashop", "whatsappshop"]);
  assert.deepEqual(DESTINATIONS.google.slice(0, 2), ["woocommerce", "googleshop"]);
  assert.equal(DESTINATIONS.allegro[0], "allegro");
  for (const c of CHANNELS) { assert.ok(CHANNEL_LABEL[c] && CHANNEL_NOTE[c]); const f = channelDefaults(c, "USD"); assert.ok(f.commissionRate + f.paymentRate < 1); }
  assert.equal(channelDefaults("woocommerce", "USD").commissionRate, 0);
  for (const c of NOT_OPEN_YET) assert.deepEqual([channelDefaults(c, "USD").commissionRate, channelDefaults(c, "USD").paymentRate], [0, 0]);
});

import { reportStats } from "./forecast";
test("report stats count only the share of a report inside the window", () => {
  const rows = [{ from: "2026-10-01", to: "2026-10-10", cost: 100, clicks: 200, units: 10 }, { from: "2026-10-11", to: "2026-10-20", cost: 50, clicks: 100, units: 4 }];
  const all = reportStats(rows, "2026-10-01", "2026-10-31");
  near(all.spend, 150); near(all.clicks, 300); near(all.orders, 14); assert.equal(all.days, 20);
  const half = reportStats(rows, "2026-10-06", "2026-10-15");
  near(half.spend, 50 + 25); near(half.clicks, 100 + 50); near(half.orders, 5 + 2); assert.equal(half.days, 10);
  assert.deepEqual(reportStats(rows, "2026-11-01", "2026-11-30"), { spend: 0, clicks: 0, orders: 0, days: 0 });
});
