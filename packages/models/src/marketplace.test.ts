import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOfferProfit, type FeeRow, type LineRow } from "./marketplace";

const L = (offerId: string, qty: number, unitPrice: number, boughtAt = "2026-10-10T10:00:00Z", name: string | null = null): LineRow => ({ offerId, name, qty, unitPrice, boughtAt });
const F = (category: FeeRow["category"], offerId: string | null, amount: number, occurredAt = "2026-10-10T10:00:00Z"): FeeRow => ({ category, offerId, amount, occurredAt });
const P = { from: "2026-10-01", to: "2026-10-31" };

test("profit = revenue - fees - ads - goods; break-even ACoS and ACoS follow from it", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map([["a", 30]]),
    lines: [L("a", 2, 100, undefined, "Chair"), L("a", 1, 100)], fees: [F("commission", "a", 30), F("delivery", "a", 15), F("ads", "a", 20)] });
  const a = r.offers[0]!;
  assert.equal(a.name, "Chair"); assert.equal(a.units, 3); assert.equal(a.revenue, 300);
  assert.equal(a.fees, 45); assert.equal(a.ads, 20); assert.equal(a.profitBeforeCost, 235);
  assert.equal(a.profit, 145); // 235 - 3 * 30
  assert.equal(a.acos, 0.0667); assert.equal(a.breakEvenAcos, 0.55); // (145 + 20) / 300
  assert.equal(a.status, "ok");
  assert.equal(r.totals.profit, 145); assert.equal(r.missingCosts, 0);
});

test("with VAT every gross amount is divided by 1 + rate", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0.23, costs: new Map([["a", 10]]), lines: [L("a", 1, 123)], fees: [F("commission", "a", 12.3), F("ads", "a", 12.3)] });
  const a = r.offers[0]!;
  assert.equal(a.revenue, 100); assert.equal(a.fees, 10); assert.equal(a.ads, 10); assert.equal(a.profit, 70);
});

test("an offer without a unit cost is flagged and its profit is left unknown, not guessed", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map(), lines: [L("a", 2, 50)], fees: [F("commission", "a", 10)] });
  assert.equal(r.offers[0]!.profit, null); assert.equal(r.offers[0]!.status, "unknown"); assert.equal(r.offers[0]!.profitBeforeCost, 90);
  assert.equal(r.missingCosts, 1);
});

test("losing and thin offers are named; ads on an offer that sold nothing still show up", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map([["loss", 90], ["thin", 85], ["dud", 5]]),
    lines: [L("loss", 1, 100), L("thin", 1, 100)], fees: [F("commission", "loss", 12), F("commission", "thin", 12), F("ads", "dud", 25)] });
  const by = Object.fromEntries(r.offers.map((o) => [o.offerId, o]));
  assert.equal(by.loss!.status, "loss"); assert.equal(by.loss!.profit, -2);
  assert.equal(by.thin!.status, "thin"); assert.equal(by.thin!.profit, 3);
  assert.equal(by.dud!.units, 0); assert.equal(by.dud!.ads, 25); assert.equal(by.dud!.acos, null); assert.equal(by.dud!.profit, -25 - 0);
});

test("fees without an offer are shared across the offers that sold, so no offer looks profitable on a losing account; the period filter applies", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map([["a", 0]]),
    lines: [L("a", 1, 100), L("a", 1, 999, "2026-09-30T23:00:00Z")],
    fees: [F("other", null, 10), F("ads", null, 5), F("commission", "a", 15), F("commission", "a", 500, "2026-11-02T00:00:00Z")] });
  const a = r.offers[0]!;
  assert.equal(r.offers.length, 1); assert.equal(a.revenue, 100);
  assert.equal(a.fees, 25); assert.equal(a.ads, 5); assert.equal(a.shared, 15);
  assert.equal(a.profit, 70); assert.equal(r.accountLevel.total, 0); assert.equal(r.totals.profit, 70); // 100 - 25 - 5
});

test("shared ads are split equally per offer, subscription follows sales, delivery follows units, and totals never change", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map([["a", 0], ["b", 0]]),
    lines: [L("a", 3, 10), L("b", 1, 70)], // a: 3 units, 30 sales; b: 1 unit, 70 sales
    fees: [F("ads", null, 100), F("delivery", null, 40)] });
  const by = Object.fromEntries(r.offers.map((o) => [o.offerId, o]));
  assert.equal(by.a!.ads, 50); assert.equal(by.b!.ads, 50); // equal per offer
  assert.equal(by.a!.delivery, 30); assert.equal(by.b!.delivery, 10); // by units
  assert.equal(r.totals.ads, 100); assert.equal(r.totals.fees, 40); assert.equal(r.totals.profit, 100 - 100 - 40);
});

test("when nothing sold, shared costs stay at account level and still reduce profit", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map(), lines: [], fees: [F("ads", null, 30)] });
  assert.equal(r.accountLevel.total, 30); assert.equal(r.totals.profit, -30);
});

test("an imported Ads report gives exact ad cost per offer and replaces that much of the untied ad charges", () => {
  const imp = (offerId: string, amount: number) => ({ ...F("ads", offerId, amount), imported: true });
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map(), lines: [L("a", 1, 100), L("b", 1, 100)],
    fees: [F("ads", null, 100), imp("a", 60), imp("c", 20)] }); // billing says 100 was spent; the report accounts for 80 of it
  const by = Object.fromEntries(r.offers.map((o) => [o.offerId, o]));
  assert.equal(by.a!.ads, 70); assert.equal(by.b!.ads, 10); // a: 60 exact + half of the 20 left over; b: half of the 20
  assert.equal(by.c!.ads, 20); assert.equal(by.c!.units, 0); // advertised but sold nothing: still shown, as a cost
  assert.equal(r.totals.ads, 100); // never more than was paid
});

test("paid versus organic: units not sold through ads are organic, never negative", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0.23, costs: new Map(), lines: [L("a", 10, 10), L("b", 2, 10)],
    adStats: new Map([["a", { clicks: 200, units: 4, cost: 123 }], ["b", { clicks: 50, units: 3, cost: 10 }]]), fees: [] });
  const by = Object.fromEntries(r.offers.map((o) => [o.offerId, o]));
  assert.deepEqual([by.a!.paid!.adUnits, by.a!.paid!.organicUnits, by.a!.paid!.clicks], [4, 6, 200]);
  assert.equal(by.a!.paid!.adShare, 0.4); assert.equal(by.a!.paid!.adConversion, 0.02); assert.equal(by.a!.paid!.costPerAdSale, 25); // 123 / 1.23 / 4
  assert.equal(by.b!.paid!.organicUnits, 0); assert.equal(by.b!.paid!.adShare, 1); // Allegro credited more ad sales than were sold in view
  const none = buildOfferProfit({ ...P, vatRate: 0, costs: new Map(), lines: [L("c", 1, 10)], fees: [] });
  assert.equal(none.offers[0]!.paid, null);
});

test("refunds (negative fee amounts) reduce costs", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map([["a", 0]]), lines: [L("a", 1, 100)], fees: [F("ads", "a", 20), F("ads", "a", -5)] });
  assert.equal(r.offers[0]!.ads, 15);
});
