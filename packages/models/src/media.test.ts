import { test } from "node:test";
import assert from "node:assert/strict";
import { adviseCampaign, budgetGuide, launchChecklist, MEDIA_SPECS, minSpendToJudge, roasTone, todaysDecisions } from "./media";

const C = { currency: "PLN" };

test("specs carry the platform limits the guide relies on", () => {
  assert.deepEqual(MEDIA_SPECS.meta.text, { primary: 125, headline: 40, description: 30 });
  assert.equal(MEDIA_SPECS.tiktok.text.caption, 100);
  assert.equal(MEDIA_SPECS.google.text.headline, 30); assert.equal(MEDIA_SPECS.google.text.description, 90);
  assert.deepEqual(MEDIA_SPECS.meta.formats.find((f) => f.id === "carousel")!.items, { min: 2, max: 10 });
  assert.equal(MEDIA_SPECS.meta.optimizations!.sales!.find((o) => o.recommended)!.id, "add_to_cart");
});

test("a budget guide is sized in the workspace currency, sales needs more on Meta, unknown currencies get none", () => {
  const sales = budgetGuide("meta", "sales", "PLN")!, visits = budgetGuide("meta", "traffic", "PLN")!;
  assert.ok(sales.floor > visits.floor); assert.ok(sales.recommended > sales.floor); assert.equal(sales.currency, "PLN");
  assert.ok(budgetGuide("tiktok", "sales", "PLN")!.floor > budgetGuide("google", "sales", "PLN")!.floor);
  assert.equal(budgetGuide("meta", "sales", "XYZ"), null);
});

test("the launch checklist asks for a pixel only when the goal needs one", () => {
  assert.ok(launchChecklist("meta", "single", "sales").some((r) => /Pixel/.test(r)));
  assert.ok(!launchChecklist("meta", "single", "traffic").some((r) => /Pixel/.test(r)));
  assert.ok(launchChecklist("meta", "carousel", "traffic").some((r) => /10 products/.test(r)));
  assert.ok(launchChecklist("google", "pmax", "sales").includes("A square logo"));
});

test("advice: stop losers, wait on small spend, scale clear winners, watch the middle, offer to restore good paused campaigns", () => {
  const min = minSpendToJudge("PLN");
  assert.equal(adviseCampaign({ status: "active", spend: 3, roas: 0.2 }, C).kind, "too_early");
  assert.equal(adviseCampaign({ status: "active", spend: min, roas: 0.9 }, C).kind, "stop");
  assert.equal(adviseCampaign({ status: "active", spend: min, roas: 2.5 }, C).kind, "scale");
  assert.equal(adviseCampaign({ status: "active", spend: min, roas: 1.8 }, C).kind, "watch");
  assert.equal(adviseCampaign({ status: "paused", spend: min * 2, roas: 3 }, C).kind, "restore");
  assert.equal(adviseCampaign({ status: "paused", spend: min * 2, roas: 1.4 }, C).kind, "paused");
  assert.equal(adviseCampaign({ status: "active", spend: min * 2, roas: null }, C).kind, "stop"); // no reported return counts as 0
});

test("today's decisions list only campaigns that need a person, biggest spend first, capped", () => {
  const min = minSpendToJudge("PLN");
  const cs = [
    { name: "a", status: "active", spend: min * 2, roas: 0.5 }, { name: "b", status: "active", spend: min * 5, roas: 3 }, { name: "c", status: "active", spend: min * 9, roas: 1.5 },
    { name: "d", status: "active", spend: 1, roas: 0 }, { name: "e", status: "paused", spend: min * 3, roas: 4 },
  ];
  assert.deepEqual(todaysDecisions(cs, { ...C }).map((x) => x.campaign.name), ["b", "e", "a"]);
  assert.equal(todaysDecisions(cs, { ...C, limit: 1 }).length, 1);
});

test("roas tones follow the 2x and 1x lines", () => {
  assert.deepEqual([roasTone(2.4), roasTone(1.2), roasTone(0.4), roasTone(null)], ["good", "ok", "bad", "none"]);
});
