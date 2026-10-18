import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMockDataset } from "./mock";

const ds = generateMockDataset({ endDate: "2026-10-18", days: 60 });

test("is deterministic", () => {
  assert.deepEqual(generateMockDataset({ endDate: "2026-10-18" }), ds);
});

test("covers three platforms with consistent references", () => {
  assert.deepEqual([...new Set(ds.campaigns.map((c) => c.platform))].sort(), ["google", "meta", "tiktok"]);
  const ads = new Set(ds.ads.map((a) => a.externalId));
  assert.ok(ds.insights.every((i) => ads.has(i.adExternalId)));
  assert.equal(ds.insights.length, ds.ads.length * 60);
  assert.equal(ds.insights.at(-1)!.date <= "2026-10-18", true);
});

test("platform-claimed revenue exceeds store revenue (overlap to dedupe later)", () => {
  const claimed = ds.insights.reduce((s, i) => s + i.revenue, 0);
  const store = ds.orders.reduce((s, o) => s + o.revenue, 0);
  assert.ok(store < claimed && store > claimed * 0.6);
});

test("injected spike lowers ROAS on the Lookalike campaign in the last 3 days", () => {
  const ids = new Set(ds.ads.filter((a) => a.adGroupExternalId === "mock-cmp-5-g1").map((a) => a.externalId));
  const roas = (from: string, to: string) => {
    const r = ds.insights.filter((i) => ids.has(i.adExternalId) && i.date >= from && i.date <= to);
    return r.reduce((s, i) => s + i.revenue, 0) / r.reduce((s, i) => s + i.spend, 0);
  };
  assert.ok(roas("2026-10-16", "2026-10-18") < roas("2026-09-20", "2026-10-10") * 0.6);
});
