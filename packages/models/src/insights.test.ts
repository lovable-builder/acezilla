import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, type DailyRow } from "./dashboard";
import { buildInsights } from "./insights";
import { buildStoreSales, type OrderRow } from "./store";

const money = (n: number) => `$${Math.round(n)}`;
const END = "2026-10-20";
const day = (n: number) => new Date(new Date(`${END}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);
const rows = (id: string, name: string, platform: string, spend: number, revenue: number, conversions: number, from: number, to: number): DailyRow[] =>
  Array.from({ length: from - to + 1 }, (_, i) => ({ campaignId: id, campaignName: name, platform, status: "active", date: day(from - i), spend, impressions: 100, clicks: 10, conversions, revenue }));
const orders = (n: number, from: number, to: number, revenue: number, utm: Record<string, string> | null = null): OrderRow[] =>
  Array.from({ length: n }, (_, i) => ({ createdAt: `${day(from - (i % (from - to + 1)))}T10:00:00Z`, revenue, customerId: null, utm, clickIds: null }));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("flags campaigns that spend without any conversion, but never a platform that does not report them", () => {
  const data = [...rows("a", "Good", "meta", 100, 300, 3, 29, 0), ...rows("b", "Dud", "google", 50, 0, 0, 29, 0), ...rows("c", "Allegro Ads", "allegro", 40, 0, 0, 29, 0)];
  const d = buildDashboard(data, { windowDays: 30, endDate: END });
  const ins = buildInsights(d, null, { money, nonReporting: ["allegro"] });
  const w = ins.find((i) => i.id === "no-conversions")!;
  assert.ok(w && /a campaign/.test(w.title) && /Dud/.test(w.detail) && !/Allegro/.test(w.detail), JSON.stringify(w));
  assert.ok(ids(ins).includes("nonreporting"), "explains how Allegro ads are read");
  const withSales = buildStoreSales(orders(10, 29, 0, 100, { source: "allegro" }), { windowDays: 30, endDate: END });   // 1000 of sales, 1200 of Allegro ad spend
  const a = buildInsights(d, withSales, { money, nonReporting: ["allegro"] }).find((i) => i.id === "nonreporting")!;
  assert.ok(/cost 120% of Allegro sales/.test(a.title) && a.tone === "warn", a.title);
  assert.ok(!buildInsights(d, null, { money, nonReporting: ["allegro", "google"] }).some((i) => /Dud/.test(i.detail)), "an excluded platform is never called out");
});

test("compares what platforms claim with what the store earned", () => {
  const d = buildDashboard(rows("a", "Meta", "meta", 100, 400, 4, 29, 0), { windowDays: 30, endDate: END });   // platform ROAS 4x
  const lowStore = buildStoreSales(orders(30, 29, 0, 100), { windowDays: 30, endDate: END });                  // store 3000 / spend 3000 = 1x
  const over = buildInsights(d, lowStore, { money }).find((i) => i.id === "overreport")!;
  assert.ok(over && /4\.0x/.test(over.title) && /1\.0x/.test(over.title), over?.title);
  const highStore = buildStoreSales(orders(60, 29, 0, 100), { windowDays: 30, endDate: END });               // 6000/3000 = 2x < 4x still over
  assert.ok(ids(buildInsights(d, highStore, { money })).includes("overreport"));
  const fine = buildStoreSales(orders(120, 29, 0, 100), { windowDays: 30, endDate: END });                    // 12000/3000 = 4x
  assert.ok(!ids(buildInsights(d, fine, { money })).includes("overreport"));
  const withAllegro = buildDashboard([...rows("a", "Meta", "meta", 100, 400, 4, 29, 0), ...rows("c", "Allegro Ads", "allegro", 10, 0, 0, 29, 0)], { windowDays: 30, endDate: END });
  assert.ok(!ids(buildInsights(withAllegro, lowStore, { money, nonReporting: ["allegro"] })).includes("overreport"), "skipped when part of the spend has no reported revenue");
});

test("notices growth, falling sales while spend rises, and unlabelled revenue", () => {
  const d = buildDashboard(rows("a", "A", "meta", 100, 200, 2, 59, 0).map((r, i) => (i >= 30 ? { ...r, spend: 150 } : r)), { windowDays: 30, endDate: END });
  const falling = buildStoreSales([...orders(40, 59, 30, 100), ...orders(20, 29, 0, 100)], { windowDays: 30, endDate: END });
  const ins = buildInsights(d, falling, { money });
  assert.ok(ids(ins).includes("store-revenue") && ins.find((i) => i.id === "store-revenue")!.tone === "bad");
  assert.ok(ids(ins).includes("spend-up-sales-flat"), ids(ins).join());
  const growing = buildStoreSales([...orders(10, 59, 30, 100), ...orders(30, 29, 0, 100)], { windowDays: 30, endDate: END });
  assert.equal(buildInsights(d, growing, { money }).find((i) => i.id === "store-revenue")!.tone, "good");
  const blind = buildStoreSales(orders(20, 29, 0, 100), { windowDays: 30, endDate: END });
  assert.ok(ids(buildInsights(d, blind, { money })).includes("untagged"));
  const tagged = buildStoreSales([...orders(14, 29, 0, 100, { source: "facebook" }), ...orders(6, 29, 0, 100, { source: "google" })], { windowDays: 30, endDate: END });
  const t = buildInsights(d, tagged, { money }).find((i) => i.id === "top-source")!;
  assert.ok(t && /Facebook brings 70%/.test(t.title));
});

test("ranks by importance, caps the list, and says nothing when there is nothing to say", () => {
  const quiet = buildDashboard(rows("a", "A", "meta", 100, 300, 3, 59, 0), { windowDays: 30, endDate: END });
  assert.deepEqual(buildInsights(quiet, null, { money }), []);
  const busy = buildDashboard([...rows("a", "Good", "meta", 100, 500, 5, 29, 0), ...rows("b", "Weak", "google", 100, 120, 1, 29, 0), ...rows("c", "Dud", "tiktok", 60, 0, 0, 29, 0)], { windowDays: 30, endDate: END });
  const ins = buildInsights(busy, buildStoreSales(orders(10, 29, 0, 100), { windowDays: 30, endDate: END }), { money }, 3);
  assert.equal(ins.length, 3);
  assert.ok(ins.every((x, i) => i === 0 || ins[i - 1]!.weight >= x.weight));
});

test("a single order source covering everything is not reported as a finding", () => {
  const d = buildDashboard(rows("a", "A", "meta", 100, 300, 3, 59, 0), { windowDays: 30, endDate: END });
  assert.ok(!ids(buildInsights(d, buildStoreSales(orders(20, 29, 0, 100, { source: "allegro" }), { windowDays: 30, endDate: END }), { money })).includes("top-source"));
  const mixed = buildStoreSales([...orders(12, 29, 0, 100, { source: "allegro" }), ...orders(8, 29, 0, 100, { source: "facebook" })], { windowDays: 30, endDate: END });
  assert.ok(ids(buildInsights(d, mixed, { money })).includes("top-source"));
});
