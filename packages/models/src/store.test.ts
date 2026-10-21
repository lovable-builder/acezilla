import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoreSales, orderSource, storeRoas, UNTAGGED, type OrderRow } from "./store";

const o = (createdAt: string, revenue: number, over: Partial<OrderRow> = {}): OrderRow => ({ createdAt, revenue, customerId: null, utm: null, clickIds: null, ...over });

test("credits an order to its utm source, then its click id, else unknown", () => {
  assert.equal(orderSource({ utm: { source: "Facebook" }, clickIds: null }), "facebook");
  assert.equal(orderSource({ utm: { source: "fb" }, clickIds: null }), "facebook");
  assert.equal(orderSource({ utm: { source: "newsletter" }, clickIds: { gclid: "x" } }), "newsletter", "an explicit tag wins over a click id");
  assert.equal(orderSource({ utm: {}, clickIds: { gclid: "x" } }), "google");
  assert.equal(orderSource({ utm: null, clickIds: { ttclid: "x" } }), "tiktok");
  assert.equal(orderSource({ utm: null, clickIds: {} }), UNTAGGED);
  assert.equal(orderSource({ utm: { source: "  " }, clickIds: null }), UNTAGGED);
});

test("totals, average order value and change against the previous window", () => {
  const orders = [o("2026-10-10T10:00:00Z", 100), o("2026-10-10T18:00:00Z", 50), o("2026-10-09T12:00:00Z", 150), o("2026-09-05T12:00:00Z", 100)];
  const s = buildStoreSales(orders, { windowDays: 7, endDate: "2026-10-10" });
  assert.equal(s.revenue.value, 300); assert.equal(s.orders.value, 3); assert.equal(s.aov.value, 100);
  assert.equal(s.revenue.prev, 0); assert.equal(s.revenue.deltaPct, null, "no previous sales: no percentage");
  assert.equal(s.series.length, 7); assert.equal(s.series[6]!.date, "2026-10-10"); assert.equal(s.series[6]!.revenue, 150); assert.equal(s.series[5]!.orders, 1);
  const grown = buildStoreSales([o("2026-10-10T10:00:00Z", 150), o("2026-10-03T10:00:00Z", 100)], { windowDays: 7, endDate: "2026-10-10" });
  assert.equal(grown.revenue.deltaPct, 0.5); assert.equal(grown.orders.deltaPct, 0);
});

test("the window ends on the latest order when no end date is given, and orders outside it are ignored", () => {
  const s = buildStoreSales([o("2026-10-10T10:00:00Z", 10), o("2026-08-01T10:00:00Z", 999)], { windowDays: 30 });
  assert.equal(s.endDate, "2026-10-10"); assert.equal(s.revenue.value, 10);
  const none = buildStoreSales([], { windowDays: 7, endDate: "2026-10-10" });
  assert.equal(none.revenue.value, 0); assert.equal(none.aov.value, 0); assert.equal(none.taggedShare, null); assert.deepEqual(none.sources, []);
});

test("sources are ranked by revenue and shares add up to one; tagged share shows attribution coverage", () => {
  const orders = [
    o("2026-10-10T10:00:00Z", 100, { utm: { source: "facebook" } }), o("2026-10-10T11:00:00Z", 100, { clickIds: { fbclid: "a" } }),
    o("2026-10-10T12:00:00Z", 50, { utm: { source: "google" } }), o("2026-10-10T13:00:00Z", 50),
  ];
  const s = buildStoreSales(orders, { windowDays: 7, endDate: "2026-10-10" });
  assert.deepEqual(s.sources.map((r) => [r.source, r.orders, r.revenue]), [["facebook", 2, 200], ["google", 1, 50], [UNTAGGED, 1, 50]]);
  assert.ok(Math.abs(s.sources.reduce((a, r) => a + r.share, 0) - 1) < 1e-9);
  assert.equal(s.taggedShare, 0.75);
});

test("store ROAS divides store revenue by ad spend and is empty when nothing was spent", () => {
  assert.equal(storeRoas(300, 100), 3);
  assert.equal(storeRoas(300, 0), null);
  assert.equal(storeRoas(0, 100), 0);
});
