import { test } from "node:test";
import assert from "node:assert/strict";
import { adviseCampaign, budgetGuide, launchChecklist, matchProduct, MEDIA_SPECS, minSpendToJudge, roasTone, stockLevel, todaysDecisions } from "./media";

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

test("stock level: a quantity wins, then the store's flag, 1 to 5 is low", () => {
  assert.deepEqual([stockLevel({ qty: 0 }), stockLevel({ qty: 3 }), stockLevel({ qty: 5 }), stockLevel({ qty: 6 })], ["out", "low", "low", "ok"]);
  assert.deepEqual([stockLevel({ qty: null, status: "outofstock" }), stockLevel({ qty: null, status: "instock" }), stockLevel({ qty: null }), stockLevel({ qty: 40, status: "outofstock" })], ["out", "ok", "unknown", "out"]);
});

test("stock changes the advice: out of stock stops a winner, low stock holds back scaling, a paused winner is not restored without stock", () => {
  const min = minSpendToJudge("PLN");
  assert.equal(adviseCampaign({ status: "active", spend: min * 2, roas: 3, stock: "out" }, C).kind, "stop");
  assert.equal(adviseCampaign({ status: "active", spend: 1, roas: 0, stock: "out" }, C).kind, "stop", "even before it has spent enough");
  const low = adviseCampaign({ status: "active", spend: min * 2, roas: 3, stock: "low" }, C);
  assert.equal(low.kind, "watch"); assert.match(low.reason, /Restock/);
  assert.equal(adviseCampaign({ status: "active", spend: min * 2, roas: 3, stock: "ok" }, C).kind, "scale");
  assert.equal(adviseCampaign({ status: "paused", spend: min * 2, roas: 3, stock: "out" }, C).kind, "paused");
  assert.equal(adviseCampaign({ status: "paused", spend: min * 2, roas: 3, stock: "ok" }, C).kind, "restore");
});

test("matching a campaign to a product is strict: clear names match, brand-only and ambiguous names do not", () => {
  const P = [
    { channel: "allegro", productId: "1", name: "Gniotek piankowy antystresowy pierożek brokatowy 10 cm" },
    { channel: "allegro", productId: "2", name: "Lampka nocna LED RGB z ładowarką indukcyjną Qi RIMFYA" },
    { channel: "allegro", productId: "3", name: "RIMFYA LAMPKA LED NA MONITOR KOMPUTER BIURKO REGULOWANA" },
    { channel: "woocommerce", productId: "9", name: "Ramka LED RGB do TV", sku: "RAM-40" },
  ];
  assert.equal(matchProduct("Gniotek pierożek - autumn", P)?.productId, "1");
  assert.equal(matchProduct("RIMFYA LED - Test 1", P), null, "a brand in several names is not a match");
  assert.equal(matchProduct("Lampka LED", P), null, "two lamps match equally");
  assert.equal(matchProduct("Promo RAM-40 october", P)?.productId, "9", "a SKU in the name is a sure match");
  assert.equal(matchProduct("kids", P), null);
  assert.equal(matchProduct("", P), null);
});
