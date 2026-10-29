import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateBudget, fitResponse, forecastFlight, forecastRevenue, marginalRoas, predictRevenue, weeklyPoints, type ResponseFit } from "./planner";
import type { DailyRow } from "./dashboard";

const curve = (a: number, b: number, spends: number[]) => spends.map((spend) => ({ spend, revenue: a * spend ** b }));
const SPENDS = [200, 300, 450, 600, 800, 1000, 1300, 1600];

test("fit recovers an exact power curve", () => {
  const f = fitResponse(curve(5, 0.7, SPENDS))!;
  assert.ok(Math.abs(f.b - 0.7) < 1e-9);
  assert.ok(Math.abs(f.a - 5) < 1e-6);
  assert.ok(f.r2 > 0.999999 && f.sigma < 1e-9);
  assert.equal(f.weeks, 8);
});

test("too few weeks or flat spend gives no curve instead of a guess", () => {
  assert.equal(fitResponse(curve(5, 0.7, SPENDS.slice(0, 5))), null);
  assert.equal(fitResponse(curve(5, 0.7, [500, 505, 498, 502, 500, 501, 499, 500])), null);
  assert.equal(fitResponse([...curve(5, 0.7, SPENDS.slice(0, 5)), { spend: 0, revenue: 10 }, { spend: 300, revenue: 0 }]), null);
});

test("returns that grow faster than spend are capped at linear", () => {
  const f = fitResponse(curve(1, 1.4, SPENDS))!;
  assert.equal(f.b, 1);
});

test("forecast range brackets the expectation and widens with noisy weeks", () => {
  const clean = fitResponse(curve(5, 0.7, SPENDS))!;
  const noisy = fitResponse(SPENDS.map((spend, i) => ({ spend, revenue: 5 * spend ** 0.7 * (i % 2 ? 1.3 : 0.75) })))!;
  const c = forecastRevenue(clean, 700), n = forecastRevenue(noisy, 700);
  assert.ok(Math.abs(c.low - c.expected) < 1e-6 && Math.abs(c.high - c.expected) < 1e-6);
  assert.ok(n.low < n.expected && n.expected < n.high);
  assert.equal(forecastRevenue(clean, 0).expected, 0);
  assert.ok(Math.abs(predictRevenue(clean, 700) - 5 * 700 ** 0.7) < 1e-6);
});

test("marginal ROAS falls as spend rises", () => {
  const f = fitResponse(curve(5, 0.7, SPENDS))!;
  assert.ok(marginalRoas(f, 300)! > marginalRoas(f, 1200)!);
  assert.equal(marginalRoas(f, 0), null);
});

test("allocation keeps the total, moves money to the platform with the higher marginal return, and respects the shift limit", () => {
  const fits: Record<string, ResponseFit> = {
    meta: { a: 8, b: 0.8, r2: 1, sigma: 0.1, weeks: 10 },
    google: { a: 3, b: 0.8, r2: 1, sigma: 0.1, weeks: 10 },
  };
  const al = allocateBudget(fits, { meta: 500, google: 500 }, 1000)!;
  const by = Object.fromEntries(al.rows.map((r) => [r.platform, r.suggested]));
  assert.ok(Math.abs(by.meta! + by.google! - 1000) < 1e-6);
  assert.ok(by.meta! > 500 && by.google! < 500);
  assert.ok(Math.abs(by.meta! - 750) < 1e-6, "capped at +50%");
  assert.ok(al.expected > al.currentExpected);
  assert.ok(al.low < al.expected && al.expected < al.high);
});

test("allocation equalises marginal returns when the limit does not bind", () => {
  const fits: Record<string, ResponseFit> = {
    a: { a: 4, b: 0.6, r2: 1, sigma: 0, weeks: 10 },
    b: { a: 5, b: 0.6, r2: 1, sigma: 0, weeks: 10 },
  };
  const al = allocateBudget(fits, { a: 500, b: 500 }, 1000, 0.9)!;
  const [x, y] = al.rows;
  assert.ok(Math.abs(x!.marginalRoas! - y!.marginalRoas!) / x!.marginalRoas! < 0.01);
});

test("allocation needs two platforms with curves and a positive budget", () => {
  const f: ResponseFit = { a: 4, b: 0.6, r2: 1, sigma: 0, weeks: 10 };
  assert.equal(allocateBudget({ meta: f }, { meta: 500 }, 500), null);
  assert.equal(allocateBudget({ meta: f, google: f }, { meta: 500, google: 500 }, 0), null);
});

test("weekly points sum 7-day blocks ending on the end date and skip empty weeks", () => {
  const row = (date: string, spend: number, revenue: number, platform = "meta"): DailyRow => ({ campaignId: "c", campaignName: "c", platform, status: "active", date, spend, impressions: 0, clicks: 0, conversions: 0, revenue });
  const rows = [row("2026-10-26", 10, 40), row("2026-10-20", 5, 20), row("2026-10-19", 7, 21), row("2026-10-26", 99, 99, "google"), row("2026-10-05", 3, 0)];
  const p = weeklyPoints(rows, "meta", "2026-10-26", 3);
  assert.deepEqual(p, [{ spend: 7, revenue: 21 }, { spend: 15, revenue: 60 }]);
});

test("flight forecast spreads the budget over weeks and platforms with a curve", () => {
  const fits: Record<string, ResponseFit> = { meta: { a: 4, b: 0.5, r2: 1, sigma: 0, weeks: 10 } };
  const fl = { id: "1", name: "Sale", startsOn: "2026-11-01", endsOn: "2026-11-14", platforms: ["meta", "tiktok"], budget: 1400 };
  const r = forecastFlight(fl, fits)!;
  assert.equal(r.days, 14);
  assert.equal(r.covered, 1);
  assert.equal(r.requested, 2);
  assert.ok(Math.abs(r.expected - 2 * 4 * 700 ** 0.5) < 1e-6);
  assert.equal(forecastFlight({ ...fl, platforms: ["tiktok"] }, fits), null);
  assert.equal(forecastFlight({ ...fl, budget: 0 }, fits), null);
});
