import { test } from "node:test";
import assert from "node:assert/strict";
import { marginFromTotals, monthlyOrders, badges, defaultShares, evaluatePlatform, foundations, levelFor, missionFor, missionKey, ratios, splitBudget, stageFor, strategyScore, streak, targets, weekKey, worst, type NodeId, type PlatformFacts, type Stats } from "./strategy";

const S = (o: Partial<Stats> = {}): Stats => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, ...o });
const facts = (d14: Partial<Stats>, w1: Partial<Stats> = {}, w0: Partial<Stats> = {}, storeRoas: number | null = null, more: Partial<PlatformFacts> = {}): PlatformFacts => ({ d14: S(d14), w1: S(w1), w0: S(w0), storeRoas, reportsSales: true, ...more });
const T = targets(0.4, 0.2, 100); // break-even 2.5x, target 3x, most you can pay for a sale 40

test("break-even is one over the margin, the target adds the cushion, and a bad margin gives nothing", () => {
  assert.equal(T.breakEvenRoas, 2.5);
  assert.equal(T.targetRoas!.toFixed(2), "3.00");
  assert.equal(T.maxCpa, 40);
  assert.equal(T.targetCpa!.toFixed(2), "33.33");
  assert.deepEqual(targets(0, 0.2, 100), { breakEvenRoas: null, targetRoas: null, maxCpa: null, targetCpa: null });
  assert.equal(targets(0.3, 0.2, 0).maxCpa, null);
});

test("stage follows monthly orders", () => {
  assert.deepEqual([stageFor(0), stageFor(30), stageFor(299), stageFor(300)], ["starting", "growing", "growing", "scaling"]);
});

test("default shares add up to 100, skip free channels, and give a starting shop no reminders", () => {
  const chosen: NodeId[] = ["meta_prospecting", "meta_retargeting", "google_shopping", "seo_content", "store"];
  const s = defaultShares("sales", "starting", chosen);
  assert.equal(Object.values(s).reduce((a, b) => a! + b!, 0), 100);
  assert.equal(s.meta_retargeting, undefined);
  assert.equal(s.seo_content, undefined);
  const g = defaultShares("sales", "growing", chosen);
  assert.ok((g.meta_retargeting ?? 0) > 0);
  assert.ok((defaultShares("launch", "growing", chosen).meta_prospecting ?? 0) > (g.meta_prospecting ?? 0));
  assert.deepEqual(defaultShares("sales", "growing", []), {});
});

test("budget is split over the chosen paid channels in proportion to their shares", () => {
  const m = splitBudget(1000, { meta_prospecting: 60, google_shopping: 20, tiktok_prospecting: 20 }, ["meta_prospecting", "google_shopping"]);
  assert.deepEqual(m, { meta_prospecting: 750, google_shopping: 250 });
  assert.deepEqual(splitBudget(0, { meta_prospecting: 100 }, ["meta_prospecting"]), {});
});

test("ratios hold nothing back when a division is impossible", () => {
  assert.deepEqual(ratios(S()), { ctr: null, cpc: null, cpa: null, roas: null });
  const r = ratios(S({ spend: 100, impressions: 10000, clicks: 200, conversions: 5, revenue: 400 }));
  assert.deepEqual([r.ctr, r.cpc, r.cpa, r.roas], [0.02, 0.5, 20, 4]);
});

test("no spend means nothing to judge", () => {
  const r = evaluatePlatform("meta", undefined, T);
  assert.deepEqual(r.map((x) => x.status), ["nodata"]);
  assert.equal(worst(r), "nodata");
});

test("a platform under break-even with enough spend is told to act, and quotes the store's own return", () => {
  const r = evaluatePlatform("meta", facts({ spend: 500, conversions: 10, revenue: 1000 }, {}, {}, 1.4), T);
  assert.equal(r[0]!.id, "below_breakeven");
  assert.equal(r[0]!.status, "act");
  assert.match(r[0]!.detail, /2\.00x/);
  assert.match(r[0]!.detail, /2\.50x/);
  assert.match(r[0]!.detail, /1\.40x/);
});

test("spend with no sales is an act, once it passed twice the most you can pay", () => {
  assert.equal(evaluatePlatform("google", facts({ spend: 90, conversions: 0 }), T)[0]!.id, "no_sales");
  assert.notEqual(evaluatePlatform("google", facts({ spend: 50, conversions: 0 }), T)[0]!.id, "no_sales");
});

test("below break-even is not declared before there is enough spend to tell", () => {
  const r = evaluatePlatform("meta", facts({ spend: 60, conversions: 3, revenue: 90 }), T);
  assert.ok(!r.some((x) => x.id === "below_breakeven"));
  assert.equal(r[0]!.id, "thin");
});

test("a steady platform above target with enough sales may scale; an unsteady one may not", () => {
  const good = facts({ spend: 1000, conversions: 40, revenue: 3600 }, { spend: 500, revenue: 1800 }, { spend: 500, revenue: 1750 });
  assert.equal(evaluatePlatform("meta", good, T)[0]!.id, "scale");
  const jumpy = facts({ spend: 1000, conversions: 40, revenue: 3600 }, { spend: 500, revenue: 2600 }, { spend: 500, revenue: 1000 });
  assert.ok(!evaluatePlatform("meta", jumpy, T).some((x) => x.id === "scale"));
});

test("when the store's own orders do not back the platform up, the platform is not told to scale", () => {
  const steady = { spend: 500, revenue: 1800 }, f = facts({ spend: 1000, conversions: 40, revenue: 3600 }, steady, { spend: 500, revenue: 1750 }, 1.5);
  const r = evaluatePlatform("meta", f, T);
  assert.equal(r[0]!.id, "overclaim");
  assert.equal(r[0]!.status, "watch");
  assert.ok(!r.some((x) => x.id === "scale"));
  assert.match(r[0]!.detail, /3\.60x/);
  assert.match(r[0]!.detail, /1\.50x/);
  const backed = evaluatePlatform("meta", facts({ spend: 1000, conversions: 40, revenue: 3600 }, steady, { spend: 500, revenue: 1750 }, 3.2), T);
  assert.equal(backed[0]!.id, "scale");
  assert.match(backed[0]!.detail, /3\.20x/);
});

test("clicks getting dearer and a falling click rate each raise a watch, but only with enough traffic", () => {
  const f = facts({ spend: 300, conversions: 25, revenue: 900 }, { spend: 200, clicks: 200, impressions: 20000 }, { spend: 100, clicks: 200, impressions: 20000 });
  const ids = evaluatePlatform("tiktok", f, T).map((x) => x.id);
  assert.ok(ids.includes("cpc_up"));
  const fall = facts({ spend: 300, conversions: 25, revenue: 900 }, { spend: 100, clicks: 150, impressions: 20000 }, { spend: 100, clicks: 300, impressions: 20000 });
  assert.ok(evaluatePlatform("tiktok", fall, T).map((x) => x.id).includes("ctr_down"));
  const tiny = facts({ spend: 300, conversions: 25, revenue: 900 }, { spend: 200, clicks: 20, impressions: 500 }, { spend: 100, clicks: 20, impressions: 500 });
  assert.ok(!evaluatePlatform("tiktok", tiny, T).some((x) => x.id === "cpc_up" || x.id === "ctr_down"));
});

test("without a margin there are no profit verdicts, only the traffic checks", () => {
  const none = targets(0, 0.2, 100);
  const r = evaluatePlatform("meta", facts({ spend: 500, conversions: 0 }), none);
  assert.ok(!r.some((x) => x.id === "no_sales" || x.id === "below_breakeven"));
});

test("a platform that never reports sales is not told it sold nothing", () => {
  const allegro = facts({ spend: 208, conversions: 0, revenue: 0 }, {}, {}, null, { reportsSales: false });
  const r = evaluatePlatform("allegro", allegro, T);
  assert.deepEqual(r.map((x) => x.id), ["spend_only"]);
  assert.equal(r[0]!.status, "info");
  assert.match(r[0]!.action, /Attribution/);
  assert.ok(!r.some((x) => x.id === "no_sales" || x.id === "thin" || x.id === "ok"));
  const csv = evaluatePlatform("tiktok", facts({ spend: 300 }, {}, {}, null, { reportsSales: false }), T);
  assert.equal(csv[0]!.id, "spend_only");
  assert.match(csv[0]!.action, /report/);
  assert.equal(worst(r), "info");
});

test("without a saved margin there are no profit verdicts and no false all-clear", () => {
  const none = targets(0, 0.2, 100);
  const r = evaluatePlatform("meta", facts({ spend: 500, conversions: 0 }), none);
  assert.deepEqual(r.map((x) => x.id), ["need_margin"]);
  assert.equal(r[0]!.status, "info");
});

test("conversions with no value are flagged instead of passing as healthy", () => {
  const r = evaluatePlatform("google", facts({ spend: 200, conversions: 30, revenue: 0 }), T);
  assert.equal(r[0]!.id, "no_value");
  assert.equal(r[0]!.status, "watch");
});

test("an expired login or data that stops early is said out loud", () => {
  assert.equal(evaluatePlatform("meta", facts({ spend: 50, conversions: 5, revenue: 300 }, {}, {}, null, { needsReauth: true }), T)[0]!.id, "reauth");
  const stale = evaluatePlatform("meta", facts({ spend: 50, conversions: 5, revenue: 300 }, {}, {}, null, { staleSince: "2026-10-20" }), T);
  assert.equal(stale[0]!.id, "stale");
  assert.match(stale[0]!.detail, /2026-10-20/);
  assert.ok(!stale.some((x) => x.id === "ok"));
});

test("worst status wins", () => {
  assert.equal(worst([{ id: "a", platform: "meta", status: "ok", title: "", detail: "", action: "" }, { id: "b", platform: "meta", status: "watch", title: "", detail: "", action: "" }]), "watch");
});

test("ground floor grows with the channels chosen, and reflects what is connected", () => {
  const base = { adConnected: true, storeConnected: false, analyticsConnected: false, merchantConnected: false, searchConsoleConnected: false, ordersTagged: false, taggingNeeded: true, marginSaved: true };
  const small = foundations(base, ["meta_prospecting"]);
  const big = foundations(base, ["google_shopping", "seo_content"]);
  assert.ok(big.length > small.length);
  assert.equal(small.find((s) => s.key === "f:ads")!.done, true);
  assert.equal(small.find((s) => s.key === "f:store")!.done, false);
  assert.ok(big.some((s) => s.key === "f:merchant") && big.some((s) => s.key === "f:search"));
  assert.ok(small.some((s) => s.key === "f:tags"));
  assert.ok(!foundations({ ...base, taggingNeeded: false }, ["meta_prospecting"]).some((s) => s.key === "f:tags"));
});

test("weeks run Monday to Sunday and follow ISO numbering", () => {
  assert.equal(weekKey("2026-10-26"), "2026-W44");
  assert.equal(weekKey("2026-11-01"), "2026-W44");
  assert.equal(weekKey("2026-11-02"), "2026-W45");
  assert.equal(weekKey("2027-01-03"), "2026-W53");
  assert.equal(weekKey("2027-01-04"), "2027-W01");
});

test("the mission fits the channels in the plan", () => {
  const ids = (n: NodeId[]) => missionFor(n).map((m) => m.id);
  assert.ok(ids(["google_shopping"]).includes("feed"));
  assert.ok(!ids(["meta_prospecting"]).includes("feed"));
  assert.ok(ids(["meta_prospecting"]).includes("creative"));
  assert.ok(ids([]).includes("spend"));
});

test("a streak counts finished weeks in a row, and an unfinished week does not break it", () => {
  const tasks = ["a", "b"];
  const done = new Set<string>();
  const finish = (date: string) => tasks.forEach((t) => done.add(missionKey(weekKey(date), t)));
  finish("2026-10-12"); finish("2026-10-19");
  assert.equal(streak(done, tasks, "2026-10-28"), 2);            // this week unfinished, last two finished
  finish("2026-10-26");
  assert.equal(streak(done, tasks, "2026-10-28"), 3);            // this week counts once finished
  assert.equal(streak(done, tasks, "2026-11-10"), 0);            // a missed week in between ends it
  assert.equal(streak(done, [], "2026-10-28"), 0);
});

test("score weighs the ground floor, build steps, mission and health, and levels follow it", () => {
  assert.equal(strategyScore({ foundationDone: 0, foundationTotal: 5, buildDone: 0, buildTotal: 10, missionDone: 0, missionTotal: 5, actRules: 0, hasData: false }), 0);
  assert.equal(strategyScore({ foundationDone: 5, foundationTotal: 5, buildDone: 10, buildTotal: 10, missionDone: 5, missionTotal: 5, actRules: 0, hasData: true }), 100);
  assert.equal(strategyScore({ foundationDone: 5, foundationTotal: 5, buildDone: 0, buildTotal: 10, missionDone: 0, missionTotal: 5, actRules: 3, hasData: true }), 35);
  assert.deepEqual(levelFor(0), { name: "Rookie buyer", next: { name: "Optimizer", pointsToGo: 25 } });
  assert.deepEqual(levelFor(80), { name: "Strategist", next: null });
});

test("badges are earned from real state", () => {
  const b = badges({ foundationDone: 3, foundationTotal: 3, marginSaved: true, buildDone: 0, buildTotal: 5, streak: 0, actRules: 0, hasData: false, missionComplete: false });
  const earned = b.filter((x) => x.earned).map((x) => x.id);
  assert.deepEqual(earned, ["numbers", "ground"]);
});

test("orders per month use the days of history that exist", () => {
  assert.equal(monthlyOrders(67, "2026-09-09", "2026-10-30"), 39);      // 52 days of history, not 90
  assert.equal(monthlyOrders(90, "2026-07-01", "2026-10-30"), 30);      // capped at 90 days
  assert.equal(monthlyOrders(10, "2026-10-29", "2026-10-30"), 21);      // at least 14 days
  assert.equal(monthlyOrders(0, null, "2026-10-30"), 0);
});

test("margin from the seller's own figures needs every cost, and can be negative", () => {
  assert.equal(marginFromTotals({ revenue: 1000, fees: 300, goodsCost: 400 }, 0)!.toFixed(2), "0.30");
  assert.equal(marginFromTotals({ revenue: 1000, fees: 300, goodsCost: 400 }, 1), null);
  assert.equal(marginFromTotals({ revenue: 0, fees: 0, goodsCost: 0 }, 0), null);
  assert.ok(marginFromTotals({ revenue: 3108, fees: 1068, goodsCost: 2200 }, 0)! < 0);
  assert.equal(marginFromTotals(null, 0), null);
});
