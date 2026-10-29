import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalRate, issueLabel, issueSummary, needsFix, priceGap, priceReport, priceVerdict, shoppingTotals, statusCounts, type FeedProduct } from "./feed";

const p = (id: string, status: FeedProduct["status"], codes: [string, string][] = []): FeedProduct => ({ productId: id, offerId: id, title: `Product ${id}`, status, issues: codes.map(([code, severity]) => ({ code, severity, resolution: "merchant_action" })) });

test("counts products per status", () => {
  const c = statusCounts([p("1", "eligible"), p("2", "eligible"), p("3", "disapproved"), p("4", "pending"), p("5", "limited")]);
  assert.deepEqual(c, { eligible: 2, limited: 1, pending: 1, disapproved: 1, unknown: 0, total: 5 });
});

test("approval rate ignores products Google has not decided on, and is null with nothing decided", () => {
  assert.equal(approvalRate(statusCounts([p("1", "eligible"), p("2", "limited"), p("3", "disapproved"), p("4", "disapproved"), p("5", "pending")])), 0.5);
  assert.equal(approvalRate(statusCounts([p("1", "pending"), p("2", "unknown")])), null);
  assert.equal(approvalRate(statusCounts([])), null);
});

test("issues are counted once per product and ranked worst first, then by how many products they hold back", () => {
  const rows = issueSummary([
    p("1", "disapproved", [["missing_gtin", "disapproved"], ["missing_gtin", "disapproved"], ["image_small", "demoted"]]),
    p("2", "disapproved", [["missing_gtin", "disapproved"]]),
    p("3", "limited", [["image_small", "demoted"], ["price_mismatch", "demoted"]]),
  ]);
  assert.deepEqual(rows, [
    { code: "missing_gtin", severity: "disapproved", products: 2 },
    { code: "image_small", severity: "demoted", products: 2 },
    { code: "price_mismatch", severity: "demoted", products: 1 },
  ]);
});

test("a code keeps its worst severity across products", () => {
  const rows = issueSummary([p("1", "limited", [["x", "demoted"]]), p("2", "disapproved", [["x", "disapproved"]])]);
  assert.deepEqual(rows, [{ code: "x", severity: "disapproved", products: 2 }]);
});

test("products to fix: blocked first, then limited, more issues first; healthy ones are left out", () => {
  const list = needsFix([p("ok", "eligible"), p("lim", "limited", [["a", "demoted"]]), p("dis1", "disapproved", [["a", "disapproved"]]), p("dis2", "disapproved", [["a", "disapproved"], ["b", "disapproved"]])]);
  assert.deepEqual(list.map((x) => x.productId), ["dis2", "dis1", "lim"]);
});

test("issue codes read as plain words", () => {
  assert.equal(issueLabel("missing_gtin"), "Missing gtin");
  assert.equal(issueLabel(""), "Issue");
});

test("shopping totals add up one source inside the date window and compute the click rate", () => {
  const rows = [
    { date: "2026-10-01", source: "free" as const, clicks: 10, impressions: 100, conversions: 1, conversionValue: 50 },
    { date: "2026-10-02", source: "free" as const, clicks: 20, impressions: 300, conversions: 2, conversionValue: 100 },
    { date: "2026-10-02", source: "ads" as const, clicks: 5, impressions: 50, conversions: 0, conversionValue: 0 },
    { date: "2026-09-01", source: "free" as const, clicks: 99, impressions: 99, conversions: 9, conversionValue: 9 },
  ];
  assert.deepEqual(shoppingTotals(rows, "free", "2026-10-01", "2026-10-31"), { clicks: 30, impressions: 400, ctr: 0.075, conversions: 3, conversionValue: 150 });
  assert.equal(shoppingTotals(rows, "ads", "2026-11-01", "2026-11-30").ctr, null);
});

import { feedSpendReport, findInFeed } from "./feed";

const feed = [p("SKU-1", "disapproved", [["missing_gtin", "disapproved"]]), p("SKU-2", "limited"), p("55", "eligible"), p("SKU-4", "eligible"), p("SKU-4", "disapproved")];
const line = (productId: string, sku: string | null, spend: number) => ({ key: `woo|${productId}`, name: `Item ${productId}`, sku, productId, spend });

test("a store product is found by SKU first, then by product ID, ignoring case and spaces", () => {
  assert.equal(findInFeed({ sku: " sku-1 ", productId: "9" }, feed)?.productId, "SKU-1");
  assert.equal(findInFeed({ sku: null, productId: "55" }, feed)?.status, "eligible");
  assert.equal(findInFeed({ sku: "nope", productId: "55" }, feed)?.productId, "55");
  assert.equal(findInFeed({ sku: "zzz", productId: "1" }, feed), null);
});

test("when the feed holds one ID twice, the worse status wins", () => {
  assert.equal(findInFeed({ sku: "SKU-4", productId: "4" }, feed)?.status, "disapproved");
});

test("ad spend on blocked, limited and unmatched products is totalled, biggest first; healthy and zero-spend products are left out", () => {
  const r = feedSpendReport([line("1", "SKU-1", 120), line("2", "SKU-2", 40), line("3", "SKU-3", 70), line("5", "55", 500), line("6", "SKU-1", 0), line("7", "SKU-4", 30)], feed);
  assert.deepEqual(r.blocked.map((x) => x.productId), ["1", "7"]);
  assert.equal(r.blockedSpend, 150);
  assert.deepEqual(r.limited.map((x) => x.productId), ["2"]);
  assert.equal(r.limitedSpend, 40);
  assert.deepEqual(r.unmatched.map((x) => x.productId), ["3"]);
  assert.equal(r.unmatchedSpend, 70);
});


test("price gap is the share above or below the benchmark, and empty without one", () => {
  assert.equal(priceGap(110, 100)!.toFixed(2), "0.10");
  assert.equal(priceGap(90, 100)!.toFixed(2), "-0.10");
  assert.equal(priceGap(100, 0), null);
  assert.equal(priceGap(Number.NaN, 100), null);
  assert.equal(priceVerdict(0.03), "near");
  assert.equal(priceVerdict(0.031), "above");
  assert.equal(priceVerdict(-0.04), "below");
});

test("price report counts each side of the market and lists the dearest first, leaving out products without a benchmark", () => {
  const row = (id: string, price: number, benchmark: number) => ({ productId: id, offerId: id, title: `P${id}`, price, benchmark, currency: "PLN" });
  const r = priceReport([row("1", 120, 100), row("2", 150, 100), row("3", 101, 100), row("4", 70, 100), row("5", 50, 0)]);
  assert.deepEqual([r.above, r.near, r.below, r.rows.length], [2, 1, 1, 4]);
  assert.deepEqual(r.overpriced.map((x) => x.productId), ["2", "1"]);
});
