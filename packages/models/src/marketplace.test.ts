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

test("fees without an offer are account-level costs: counted in totals, never spread; the period filter applies", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map([["a", 0]]),
    lines: [L("a", 1, 100), L("a", 1, 999, "2026-09-30T23:00:00Z")],
    fees: [F("other", null, 10), F("ads", null, 5), F("commission", "a", 15), F("commission", "a", 500, "2026-11-02T00:00:00Z")] });
  assert.equal(r.offers.length, 1); assert.equal(r.offers[0]!.revenue, 100); assert.equal(r.offers[0]!.fees, 15);
  assert.equal(r.accountLevel.total, 15); assert.deepEqual([r.accountLevel.byCategory.other, r.accountLevel.byCategory.ads], [10, 5]);
  assert.equal(r.totals.profit, 70); // 100 - 15 - 15
});

test("refunds (negative fee amounts) reduce costs", () => {
  const r = buildOfferProfit({ ...P, vatRate: 0, costs: new Map([["a", 0]]), lines: [L("a", 1, 100)], fees: [F("ads", "a", 20), F("ads", "a", -5)] });
  assert.equal(r.offers[0]!.ads, 15);
});
