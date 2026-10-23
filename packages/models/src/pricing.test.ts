import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPricingModel, maxAds, maxUnitCost, parsePricingResponse, priceForMargin, pricingScenarios, profitAt, sweep, toGross, unitsAt, type PricingModel } from "./pricing";
import type { OfferProfit } from "./marketplace";

// 100 units at a net price of 20: revenue 2000. Commission 10% of revenue = 200. Other fees 2 a unit = 200. Goods 8 a unit = 800. Ads 300.
// Profit = 2000 - 200 - 200 - 800 - 300 = 500.
const M: PricingModel = { offerId: "o1", name: "Lamp", units: 100, price: 20, commissionRate: 0.1, feesPerUnit: 2, ads: 300, unitCost: 8, vatRate: 0.23 };
const offer = (over: Partial<OfferProfit> = {}): OfferProfit => ({ offerId: "o1", name: "Lamp", units: 100, revenue: 2000, commission: 200, delivery: 150, fulfillment: 30, other: 20, fees: 400, ads: 300, shared: 0, profitBeforeCost: 1300, unitCost: 8, profit: 500, acos: 0.15, breakEvenAcos: 0.4, status: "ok", paid: null, ...over });

test("a model is built from an offer's measured figures, and refused when it cannot be priced", () => {
  const m = buildPricingModel(offer(), 0.23)!;
  assert.equal(m.price, 20); assert.equal(m.commissionRate, 0.1); assert.equal(m.feesPerUnit, 2); assert.equal(m.ads, 300);
  assert.equal(buildPricingModel(offer({ unitCost: null }), 0.23), null); assert.equal(buildPricingModel(offer({ units: 0 }), 0.23), null);
});

test("profit at today's price matches the profit table, and a price change moves revenue and commission but not ads", () => {
  assert.equal(profitAt(M).profit, 500);
  const up = profitAt(M, { price: 22 }); // same 100 units: revenue 2200, commission 220, fees 200, goods 800, ads 300
  assert.equal(up.profit, 680); assert.equal(up.ads, 300);
  assert.equal(profitAt(M, { price: 18 }).profit, 320);
});

test("break-even price, margin prices, the most a unit may cost and the most ads that can be spent", () => {
  const be = priceForMargin(M)!;
  assert.ok(Math.abs(profitAt(M, { price: be }).profit) < 0.01);
  assert.ok(Math.abs(be - 14.4444) < 0.01, String(be)); // (800 + 200 + 300) / (100 x 0.9)
  const m10 = priceForMargin(M, 0.1)!; const o = profitAt(M, { price: m10 }); assert.ok(Math.abs(o.profit / o.revenue - 0.1) < 0.001);
  assert.ok(Math.abs(maxUnitCost(M) - 13) < 0.001); // 20 x 0.9 - 2 - 300/100 = 13
  assert.ok(Math.abs(maxAds(M) - 800) < 0.001); // 100 x (18 - 2 - 8) = 800
  assert.ok(priceForMargin({ ...M, unitCost: 60 }, 0, {}) !== null);
  assert.equal(priceForMargin({ ...M, unitCost: 500 }), null, "a price more than six times today's is out of range");
  assert.equal(priceForMargin({ ...M, commissionRate: 1.2 }), null, "nothing can break even when fees take more than the price");
});

test("a demand assumption lowers sales when the price rises, never below zero", () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(unitsAt(M, 22, 0), 100); near(unitsAt(M, 22, 1), 90); near(unitsAt(M, 18, 1), 110); near(unitsAt(M, 100, 5), 0);
  assert.ok(profitAt(M, { price: 22, elasticity: 2 }).profit < profitAt(M, { price: 22 }).profit);
  const be0 = priceForMargin(M, 0)!, be2 = priceForMargin(M, 0, { elasticity: 2 })!;
  assert.ok(be2 !== null && Math.abs(profitAt(M, { price: be2, elasticity: 2 }).profit) < 0.01); assert.ok(be0 > 0);
});

test("the sweep covers the range and crosses zero at the break-even price", () => {
  const s = sweep(M, { from: -0.3, to: 0.5, steps: 8 });
  assert.equal(s.length, 9); assert.equal(Math.round(s[0]!.pct * 100), -30); assert.equal(Math.round(s[8]!.pct * 100), 50);
  assert.ok(s[0]!.profit < 0 && s[8]!.profit > 0);
});

test("scenarios give the AI every figure: prices with VAT, costs and ads without", () => {
  const s = pricingScenarios(M, { currency: "PLN" });
  assert.equal(s.now.priceGross, toGross(20, 0.23)); assert.equal(s.now.profit, 500);
  assert.ok(s.breakEven.priceGross! < s.now.priceGross && s.breakEven.changePct! < 0);
  assert.equal(s.maxCost.breakEven, 13); assert.equal(s.maxAdsBreakEven, 800); assert.equal(s.losesEvenWithoutAds, false); assert.equal(s.adsToCutForBreakEven, null, "ads of 300 are below the 800 it could afford");
  const heavy = pricingScenarios({ ...M, ads: 1000 }, { currency: "PLN" }); assert.equal(heavy.adsToCutForBreakEven, 200);
  const loss = pricingScenarios({ ...M, unitCost: 17 }, { currency: "PLN" });
  assert.ok(loss.now.profit < 0 && loss.breakEven.changePct! > 0);
  const hopeless = pricingScenarios({ ...M, unitCost: 19 }, { currency: "PLN" }); // 20 x 0.9 - 2 - 19 < 0 before any ads
  assert.equal(hopeless.losesEvenWithoutAds, true); assert.equal(hopeless.maxAdsBreakEven, null); assert.equal(hopeless.adsToCutForBreakEven, null);
});

test("the AI answer is validated; figures not in the data are flagged, bad shapes and markup are refused", () => {
  const s = pricingScenarios({ ...M, unitCost: 17 }, { currency: "PLN" });
  const good = { headline: `Raise the price to ${s.breakEven.priceGross} to break even.`, actions: [{ kind: "raise_price", title: "Raise the price", detail: `Break-even is ${s.breakEven.priceGross} PLN.` }, { kind: "lower_cost", title: "Source cheaper", detail: `Keep the unit cost under ${s.maxCost.breakEven}.` }], watchOut: ["Check competitors"] };
  const ok = parsePricingResponse(good, s)!;
  assert.deepEqual(ok.unverified, []); assert.equal(ok.actions.length, 2);
  const invented = parsePricingResponse({ ...good, headline: "Raise the price to 999.99 PLN." }, s)!;
  assert.ok(invented.unverified.includes("999.99"));
  assert.deepEqual(parsePricingResponse({ ...good, headline: `A ${Math.abs(s.maxCost.changePctToBreakEven)}% cut in cost is needed.` }, s)!.unverified, [], "a negative figure may be quoted as its size");
  assert.equal(parsePricingResponse({ ...good, actions: [{ kind: "launch_rocket", title: "x", detail: "y" }] }, s), null);
  assert.equal(parsePricingResponse({ ...good, headline: "<b>hi</b>" }, s)!.headline, "hi" === "hi" ? parsePricingResponse({ ...good, headline: "<b>hi</b>" }, s)!.headline : "");
  assert.equal(parsePricingResponse({ ...good, actions: [] }, s), null); assert.equal(parsePricingResponse("nope", s), null);
});
