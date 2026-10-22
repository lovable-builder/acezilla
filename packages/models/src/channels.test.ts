import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChannels } from "./channels";

const o = (externalId: string, revenue: number, at = "2026-10-10T10:00:00Z") => ({ externalId, createdAt: at, revenue, customerId: null, utm: null, clickIds: null });
const W = { windowDays: 30, endDate: "2026-10-22" };

test("a connected channel with no orders is still listed, with zeros", () => {
  const r = buildChannels([o("allegro:1", 100), o("allegro:2", 50)], { ...W, connected: ["allegro", "woocommerce"] });
  assert.deepEqual(r.map((x) => [x.channel, x.orders, x.revenue]), [["allegro", 2, 150], ["woocommerce", 0, 0]]);
  assert.equal(r[0]!.share, 1); assert.equal(r[1]!.share, 0);
});

test("orders are split by where they were placed and shares add up", () => {
  const r = buildChannels([o("allegro:1", 300), o("woo:7", 100)], { ...W, connected: ["allegro", "woocommerce"] });
  assert.deepEqual(r.map((x) => x.channel), ["allegro", "woocommerce"]);
  assert.equal(r[0]!.share, 0.75); assert.equal(r[1]!.share, 0.25);
});

test("the window applies, and unknown orders only show up when they exist", () => {
  const r = buildChannels([o("woo:1", 10, "2026-08-01T00:00:00Z"), o("zzz:1", 5)], { ...W, connected: ["allegro"] });
  assert.deepEqual(r.map((x) => [x.channel, x.orders]), [["other", 1], ["allegro", 0]]);
  assert.deepEqual(buildChannels([], { ...W, connected: [] }), []);
});

test("an order with no prefix belongs to the single connected non-Allegro store", () => {
  const r = buildChannels([o("1234", 20)], { ...W, connected: ["allegro", "woocommerce"] });
  assert.equal(r.find((x) => x.channel === "woocommerce")!.orders, 1);
});
