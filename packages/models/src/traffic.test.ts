import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTraffic, verdictFor, type GaRow } from "./traffic";
import type { DailyRow } from "./dashboard";

const ga = (date: string, channel: string, sessions: number, conversions = 0, revenue = 0): GaRow => ({ date, channel, sessions, conversions, revenue });
const ad = (date: string, platform: string, spend: number, clicks: number): DailyRow => ({ campaignId: platform, campaignName: platform, platform, status: "active", date, spend, impressions: 0, clicks, conversions: 0, revenue: 0 });
const near = (a: number | null, b: number, t = 1e-9) => assert.ok(a !== null && Math.abs(a - b) <= t, `${a} vs ${b}`);

const GA = [ga("2026-10-01", "Direct", 100, 5), ga("2026-10-01", "Paid Social", 60, 2, 100), ga("2026-10-02", "Paid Social", 40, 0), ga("2026-10-02", "Paid Search", 50, 1), ga("2026-10-03", "Organic Search", 10), ga("2026-09-30", "Direct", 999)];
const ADS = [ad("2026-10-01", "meta", 30, 70), ad("2026-10-02", "tiktok", 20, 50), ad("2026-10-02", "google", 25, 80), ad("2026-10-01", "allegro", 99, 999), ad("2026-09-29", "meta", 1000, 1000)];

test("totals, channels and the daily series cover only the period", () => {
  const t = buildTraffic({ ga: GA, ads: ADS, start: "2026-10-01", end: "2026-10-31" });
  assert.equal(t.visits, 260); assert.equal(t.keyEvents, 8); near(t.keyEventRate, 8 / 260); assert.equal(t.revenue, 100); assert.equal(t.hasRevenue, true);
  assert.deepEqual(t.channels.map((c) => [c.channel, c.visits]), [["Direct", 100], ["Paid Social", 100], ["Paid Search", 50], ["Organic Search", 10]].sort((a, b) => (b[1] as number) - (a[1] as number)));
  near(t.channels.reduce((s, c) => s + c.share, 0), 1);
  assert.deepEqual(t.series, [{ date: "2026-10-01", visits: 160 }, { date: "2026-10-02", visits: 90 }, { date: "2026-10-03", visits: 10 }]);
  const social = t.channels.find((c) => c.channel === "Paid Social")!;
  near(social.keyEventRate, 0.02); assert.equal(social.revenue, 100);
});

test("Meta and TikTok clicks are compared with Paid Social visits together; Google with its channels; Allegro is left out", () => {
  const t = buildTraffic({ ga: GA, ads: ADS, start: "2026-10-01", end: "2026-10-31" });
  const social = t.compare.find((c) => c.id === "paid-social")!, google = t.compare.find((c) => c.id === "google")!;
  assert.equal(social.clicks, 120); assert.equal(social.visits, 100); near(social.ratio, 100 / 120); near(social.spend, 50); near(social.costPerVisit, 0.5); assert.equal(social.verdict, "ok");
  assert.equal(google.clicks, 80); assert.equal(google.visits, 50); near(google.ratio, 50 / 80); near(google.costPerVisit, 0.5); assert.equal(google.keyEvents, 1);
  assert.equal(t.compare.length, 2);
});

test("verdicts: lost clicks, too many visits, too few clicks to judge, and no visits at all", () => {
  assert.equal(verdictFor(200, 100), "lost");
  assert.equal(verdictFor(200, 150), "ok");
  assert.equal(verdictFor(200, 300), "over");
  assert.equal(verdictFor(29, 5), "too_little");
  assert.equal(verdictFor(0, 243), "no_ad_data");
  assert.equal(verdictFor(0, 0), "too_little");
  assert.equal(verdictFor(200, 0), "no_visits");
  assert.equal(verdictFor(100, 60), "ok");
});

test("nothing in the period gives empty, honest results", () => {
  const t = buildTraffic({ ga: GA, ads: ADS, start: "2027-01-01", end: "2027-01-31" });
  assert.equal(t.visits, 0); assert.equal(t.keyEventRate, null); assert.equal(t.hasRevenue, false); assert.deepEqual(t.channels, []); assert.deepEqual(t.compare, []); assert.deepEqual(t.series, []);
});

test("ad clicks with no matching visits are shown, not hidden", () => {
  const t = buildTraffic({ ga: [], ads: [ad("2026-10-01", "google", 40, 200)], start: "2026-10-01", end: "2026-10-31" });
  assert.equal(t.compare.length, 1);
  assert.equal(t.compare[0]!.verdict, "no_visits"); assert.equal(t.compare[0]!.costPerVisit, null);
});
