import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttribution, platformOfSource } from "./attribution";
import type { CampaignRow } from "./dashboard";
import type { OrderRow } from "./store";

const camp = (campaignId: string, name: string, platform: string, spend: number, revenue: number): CampaignRow => ({ campaignId, name, platform, status: "active", spend, revenue, conversions: 1, roas: spend > 0 ? revenue / spend : null, cpa: null });
const ord = (revenue: number, utm: Record<string, string> | null, customerId: string | null = null, clickIds: Record<string, string> | null = null): OrderRow => ({ createdAt: "2026-10-10T10:00:00Z", revenue, customerId, utm, clickIds });

test("maps marketing sources to ad platforms", () => {
  for (const [s, p] of [["facebook", "meta"], ["instagram", "meta"], ["google", "google"], ["tiktok", "tiktok"], ["allegro", "allegro"], ["newsletter", null]] as const) assert.equal(platformOfSource(s), p);
});

test("channels compare what the platform claims with what the store earned, and show the over-claim", () => {
  const a = buildAttribution({
    platforms: [{ platform: "meta", spend: 100, revenue: 400 }, { platform: "google", spend: 50, revenue: 0 }],
    campaigns: [camp("1", "Autumn Sale", "meta", 100, 400)],
    orders: [ord(100, { source: "facebook" }), ord(100, { source: "fb" }), ord(60, { source: "google" }), ord(40, null)],
  });
  const meta = a.channels.find((c) => c.platform === "meta")!;
  assert.deepEqual([meta.platformRoas, meta.storeRevenue, meta.storeRoas, meta.storeOrders], [4, 200, 2, 2]);
  assert.equal(meta.overclaim, 0.5);
  const g = a.channels.find((c) => c.platform === "google")!;
  assert.equal(g.platformRoas, null); assert.equal(g.overclaim, null, "a platform that reports no revenue cannot over-claim"); assert.equal(g.storeRoas, 1.2);
  assert.deepEqual(a.untagged, { orders: 1, revenue: 40, share: 40 / 300 });
});

test("orders are matched to campaigns by utm campaign: exact name, id, or a clear partial; others are listed unmatched", () => {
  const a = buildAttribution({
    platforms: [{ platform: "meta", spend: 300, revenue: 0 }],
    campaigns: [camp("c1", "Autumn Sale 2026", "meta", 100, 0), camp("23851", "Retargeting", "meta", 200, 0)],
    orders: [
      ord(50, { source: "facebook", campaign: "autumn-sale-2026" }), ord(50, { source: "facebook", campaign: "23851" }),
      ord(30, { source: "facebook", campaign: "autumn-sale" }), ord(70, { source: "facebook", campaign: "mystery" }), ord(10, { source: "facebook", campaign: "x" }),
    ],
  });
  assert.deepEqual(a.campaigns.get("c1"), { orders: 2, revenue: 80, modeledRoas: 0.8 });
  assert.deepEqual(a.campaigns.get("23851"), { orders: 1, revenue: 50, modeledRoas: 0.25 });
  assert.deepEqual(a.unmatched.map((u) => [u.campaign, u.revenue]), [["mystery", 70], ["x", 10]], "a one-letter tag is never matched by guessing");
});

test("a campaign tag only matches campaigns of the same platform", () => {
  const a = buildAttribution({ platforms: [{ platform: "google", spend: 10, revenue: 0 }, { platform: "meta", spend: 10, revenue: 0 }], campaigns: [camp("g", "Summer Promo", "google", 10, 0), camp("m", "Summer Promo", "meta", 10, 0)], orders: [ord(100, { source: "facebook", campaign: "summer-promo" })] });
  assert.equal(a.campaigns.get("m")!.orders, 1); assert.equal(a.campaigns.has("g"), false);
});

test("other sources, untagged revenue and repeat customers", () => {
  const a = buildAttribution({ platforms: [], campaigns: [], orders: [ord(10, { source: "newsletter" }, "c1"), ord(10, null, "c1"), ord(10, null, "c2"), ord(10, null, null)] });
  assert.deepEqual(a.otherSources, [{ source: "newsletter", orders: 1, revenue: 10 }]);
  assert.equal(a.untagged.orders, 3);
  assert.deepEqual(a.customers, { orders: 3, customers: 2, repeatShare: 2 / 3 });
  assert.equal(buildAttribution({ platforms: [], campaigns: [], orders: [] }).customers.repeatShare, null);
});

test("Allegro ads show cost against Allegro sales and make no claim about platform revenue", () => {
  const a = buildAttribution({ platforms: [{ platform: "allegro", spend: 100, revenue: 0 }], campaigns: [], orders: [ord(400, { source: "allegro", medium: "marketplace" })], nonReporting: ["allegro"] });
  const al = a.channels[0]!;
  assert.deepEqual([al.platformRoas, al.overclaim, al.storeRoas, al.storeRevenue], [null, null, 4, 400]);
});
