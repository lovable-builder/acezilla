import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, detectAnomalies, shiftDate, type DailyRow } from "./dashboard";

const mk = (campaignId: string, date: string, spend: number, revenue: number, platform = "meta"): DailyRow =>
  ({ campaignId, campaignName: campaignId, platform, status: "active", date, spend, impressions: 0, clicks: 0, conversions: Math.round(revenue / 50), revenue });

const days = (n: number, end = "2026-10-18") => Array.from({ length: n }, (_, i) => shiftDate(end, -i));

test("KPIs compare the window to the previous one", () => {
  const rows = days(60).map((d) => mk("a", d, 100, d > "2026-09-18" ? 300 : 200));
  const { kpis } = buildDashboard(rows);
  assert.equal(kpis.spend.value, 3000);
  assert.equal(kpis.revenue.value, 9000);
  assert.equal(kpis.roas.value, 3);
  assert.ok(Math.abs(kpis.revenue.deltaPct! - 0.5) < 1e-9);
  assert.equal(kpis.spend.series.length, 30);
});

test("handles empty and zero-spend data without NaN", () => {
  const empty = buildDashboard([], { endDate: "2026-10-18" });
  assert.equal(empty.kpis.roas.value, 0);
  assert.equal(empty.kpis.spend.deltaPct, null);
  const zero = buildDashboard([mk("a", "2026-10-18", 0, 0)]);
  assert.equal(zero.campaigns[0]!.roas, null);
});

test("campaigns sorted by spend; platform rollup sums", () => {
  const rows = [mk("small", "2026-10-18", 10, 30), mk("big", "2026-10-18", 90, 180, "google")];
  const d = buildDashboard(rows);
  assert.deepEqual(d.campaigns.map((c) => c.campaignId), ["big", "small"]);
  assert.equal(d.platforms.find((p) => p.platform === "google")!.roas, 2);
});

test("flags a sharp 3-day ROAS drop as high severity", () => {
  const rows = days(20).map((d, i) => mk("x", d, 100, i < 3 ? 100 : 300));
  const [a] = detectAnomalies(rows, "2026-10-18");
  assert.equal(a!.severity, "high");
  assert.match(a!.title, /ROAS fell/);
});

test("flags gradual week-over-week slide as fatigue, and stays quiet when stable", () => {
  const slide = days(20).map((d, i) => mk("f", d, 100, i < 7 ? 220 : 300));
  assert.equal(detectAnomalies(slide, "2026-10-18")[0]!.severity, "warn");
  const stable = days(20).map((d) => mk("s", d, 100, 300));
  assert.equal(detectAnomalies(stable, "2026-10-18").length, 0);
});
