import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductList, buildStoreProductProfit } from "./products";

const cat = (channel: string, productId: string, name: string) => ({ channel, productId, name, price: 10, status: "publish", stock: "instock" });
const line = (channel: string, productId: string, qty: number, unitPrice: number, at = "2026-10-10T10:00:00Z") => ({ channel, productId, name: null, qty, unitPrice, at });
const R = { from: "2026-10-01", to: "2026-10-31" };

test("a listed product that never sold is a row of zeros, and sellers come first", () => {
  const r = buildProductList({ ...R, catalog: [cat("woocommerce", "1", "Unsold"), cat("woocommerce", "2", "Sold")], lines: [line("woocommerce", "2", 3, 20)] });
  assert.deepEqual(r.map((x) => [x.name, x.units, x.revenue]), [["Sold", 3, 60], ["Unsold", 0, 0]]);
});

test("sales outside the period are ignored, and something sold but no longer listed is kept and flagged", () => {
  const r = buildProductList({ ...R, catalog: [cat("woocommerce", "1", "A")], lines: [line("woocommerce", "1", 5, 10, "2026-09-30T23:00:00Z"), line("woocommerce", "9", 1, 15)] });
  assert.deepEqual(r.map((x) => [x.productId, x.units, x.listed]), [["9", 1, false], ["1", 0, true]]);
});

test("the same id on two channels stays two products, and VAT comes off only where prices include it", () => {
  const r = buildProductList({ ...R, vat: { allegro: 0.23 }, catalog: [], lines: [line("allegro", "5", 1, 123), line("woocommerce", "5", 1, 100)] });
  assert.equal(r.length, 2);
  assert.equal(r.find((x) => x.channel === "allegro")!.revenue, 100); assert.equal(r.find((x) => x.channel === "woocommerce")!.revenue, 100);
});

test("store product profit: sales minus goods minus linked ads, only where a cost is known, unsold listed products stay as zero rows", () => {
  const rows = buildProductList({ ...R, catalog: [cat("woocommerce", "1", "Lamp"), cat("woocommerce", "2", "Frame"), cat("woocommerce", "3", "Unsold"), cat("allegro", "9", "Other store")], lines: [line("woocommerce", "1", 4, 25), line("woocommerce", "2", 1, 100)] });
  const r = buildStoreProductProfit({ rows, channel: "woocommerce", costs: new Map([["1", 10]]), adSpend: new Map([["woocommerce|1", 30], ["woocommerce|2", 15]]) });
  const by = Object.fromEntries(r.rows.map((x) => [x.productId, x]));
  assert.equal(by["1"]!.profit, 30); // 100 - 40 - 30
  assert.equal(by["2"]!.profit, null); assert.equal(by["2"]!.ads, 15); assert.equal(by["3"]!.units, 0);
  assert.ok(!r.rows.some((x) => x.channel === "allegro"));
  assert.equal(r.missingCosts, 1); assert.equal(r.totals.revenue, 200); assert.equal(r.totals.ads, 45); assert.equal(r.totals.profit, 30);
});
