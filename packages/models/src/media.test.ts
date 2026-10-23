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

import { creativeChecks, CREATIVE_PATH, ratioName } from "./media";
import { cleanBuilderInput } from "./ai";
const WS = "11111111-2222-3333-4444-555555555555";
const img = (name: string, w: number, h: number) => ({ path: `${WS}/${name}.jpg`, kind: "image" as const, name, w, h, seconds: null });
const vid = (w: number, h: number, seconds: number) => ({ path: `${WS}/clip.mp4`, kind: "video" as const, name: "clip.mp4", w, h, seconds });

test("ratios are named for the common ad shapes", () => {
  assert.deepEqual([ratioName(1080, 1080), ratioName(1080, 1350), ratioName(1080, 1920), ratioName(1200, 628), ratioName(1920, 1080), ratioName(500, 300)], ["1:1", "4:5", "9:16", "1.91:1", "16:9", "500×300"]);
});

test("TikTok needs a vertical video of 9 to 30 seconds", () => {
  assert.equal(creativeChecks("tiktok", "video", [])[0]!.ok, false);
  assert.ok(creativeChecks("tiktok", "video", [vid(1080, 1920, 14)]).every((c) => c.ok));
  const bad = creativeChecks("tiktok", "video", [vid(1920, 1080, 45)]);
  assert.equal(bad.filter((c) => !c.ok).length, 2);
});

test("Meta checks the ratio, and a carousel needs one image per card and no video", () => {
  assert.ok(creativeChecks("meta", "single", [img("a", 1080, 1080)]).every((c) => c.ok));
  assert.ok(creativeChecks("meta", "single", [img("a", 1600, 900)]).some((c) => !c.ok && /16:9/.test(c.text)));
  assert.ok(creativeChecks("meta", "carousel", [img("a", 1080, 1080), img("b", 1080, 1080)], { cards: 3 }).some((c) => !c.ok && /2 of 3/.test(c.text)));
  assert.ok(creativeChecks("meta", "carousel", [vid(1080, 1080, 10)], { cards: 2 }).some((c) => !c.ok && /images/.test(c.text)));
  assert.equal(creativeChecks("meta", "single", [])[0]!.ok, false);
});

test("Performance Max wants a square logo and a landscape image; Search needs no files", () => {
  const both = creativeChecks("google", "pmax", [img("logo", 512, 512), img("wide", 1200, 628)]);
  assert.ok(both.every((c) => c.ok));
  assert.equal(creativeChecks("google", "pmax", [img("logo", 512, 512)]).filter((c) => !c.ok).length, 1);
  assert.deepEqual(creativeChecks("google", "search", []), []);
});

test("uploaded file lists are cleaned: only the uploader's paths, one video or images, https product photos", () => {
  const base = { platform: "meta", goal: "traffic", format: "single", product: "Handmade leather wallets from Krakow" };
  const ok = cleanBuilderInput({ ...base, assets: JSON.stringify([{ path: `${WS}/a1.jpg`, name: "a.jpg", w: 1080, h: 1080 }, { path: "../../etc/passwd.jpg", name: "x", w: 10, h: 10 }, { path: `${WS}/a2.png`, name: "b.png", w: 0, h: 5 }]), productImages: JSON.stringify(["https://shop.pl/a.jpg", "http://shop.pl/b.jpg", "javascript:alert(1)"]) });
  assert.ok(ok.ok); if (!ok.ok) return;
  assert.deepEqual(ok.value.assets.map((a) => a.path), [`${WS}/a1.jpg`]); assert.deepEqual(ok.value.productImages, ["https://shop.pl/a.jpg"]);
  const mixed = cleanBuilderInput({ ...base, assets: JSON.stringify([{ path: `${WS}/a1.jpg`, name: "a", w: 10, h: 10 }, { path: `${WS}/v.mp4`, name: "v", w: 1080, h: 1920, seconds: 12 }]) });
  assert.ok(mixed.ok && mixed.value.assets.length === 1 && mixed.value.assets[0]!.kind === "video");
  assert.ok(CREATIVE_PATH.test(`${WS}/abc_DEF-1.webp`)); assert.ok(!CREATIVE_PATH.test(`${WS}/a/b.jpg`));
  assert.deepEqual(cleanBuilderInput({ ...base, assets: "not json" }).ok && (cleanBuilderInput({ ...base, assets: "not json" }) as { value: { assets: unknown[] } }).value.assets, []);
});
