import { test } from "node:test";
import assert from "node:assert/strict";
import { angleSummary, daysRunning, groupLibraryAds, guessAngle, libraryLink, pageMatches, rankAds, signalFor, websiteDomain, type CompetitorAd } from "./competitor";

const ad = (o: Partial<CompetitorAd> & { id: string }): CompetitorAd => ({ competitorId: "c1", platform: "meta", startedOn: null, endedOn: null, stillRunning: true, variants: 1, angle: "other", ...o });

test("days running counts both ends and runs to today while the ad is live", () => {
  assert.equal(daysRunning({ startedOn: "2026-10-01", endedOn: null, stillRunning: true }, "2026-10-10"), 10);
  assert.equal(daysRunning({ startedOn: "2026-10-01", endedOn: "2026-10-05", stillRunning: false }, "2026-10-28"), 5);
  assert.equal(daysRunning({ startedOn: "2026-10-01", endedOn: "2026-10-01", stillRunning: false }, "2026-10-28"), 1);
});

test("days running is unknown when a date is missing or the dates make no sense", () => {
  assert.equal(daysRunning({ startedOn: null, endedOn: null, stillRunning: true }, "2026-10-10"), null);
  assert.equal(daysRunning({ startedOn: "2026-10-01", endedOn: null, stillRunning: false }, "2026-10-10"), null);
  assert.equal(daysRunning({ startedOn: "2026-10-20", endedOn: "2026-10-10", stillRunning: false }, "2026-10-28"), null);
  assert.equal(daysRunning({ startedOn: "2026-11-01", endedOn: null, stillRunning: true }, "2026-10-10"), null);
});

test("signals follow the run length and whether the ad stopped", () => {
  assert.equal(signalFor(null, true), "unknown");
  assert.equal(signalFor(90, true), "long_runner");
  assert.equal(signalFor(60, false), "long_runner");
  assert.equal(signalFor(45, true), "holding");
  assert.equal(signalFor(10, true), "testing");
  assert.equal(signalFor(5, false), "stopped_early");
  assert.equal(signalFor(20, false), "short_run");
  assert.equal(signalFor(40, false), "holding");
});

test("ranking puts the longest runners first, then most variants, then undated ads", () => {
  const r = rankAds([ad({ id: "undated" }), ad({ id: "short", startedOn: "2026-10-20" }), ad({ id: "long", startedOn: "2026-06-01" }), ad({ id: "long-more", startedOn: "2026-06-01", variants: 4 })], "2026-10-28");
  assert.deepEqual(r.map((a) => a.id), ["long-more", "long", "short", "undated"]);
  assert.equal(r[0]!.signal, "long_runner");
  assert.equal(r[3]!.signal, "unknown");
});

test("angle summary counts ads, distinct competitors and long runners", () => {
  const ranked = rankAds([
    ad({ id: "1", angle: "discount", startedOn: "2026-10-20" }),
    ad({ id: "2", angle: "discount", competitorId: "c2", startedOn: "2026-10-25" }),
    ad({ id: "3", angle: "proof", startedOn: "2026-05-01" }),
  ], "2026-10-28");
  const s = angleSummary(ranked);
  assert.deepEqual(s[0], { angle: "proof", ads: 1, competitors: 1, longRunners: 1 });
  assert.deepEqual(s[1], { angle: "discount", ads: 2, competitors: 2, longRunners: 0 });
});

test("library links search by the competitor name where the platform allows it", () => {
  assert.match(libraryLink("meta", "Acme Home")!, /q=Acme%20Home/);
  assert.match(libraryLink("meta", "x", "PL")!, /country=PL/);
  assert.equal(libraryLink("allegro", "x"), null);
});

test("Google's library link searches by the website's domain when there is one", () => {
  assert.equal(websiteDomain("https://www.Acme.pl/shop?x=1"), "acme.pl");
  assert.equal(websiteDomain("acmehome.pl"), "acmehome.pl");
  assert.equal(websiteDomain("not a site"), null);
  assert.equal(websiteDomain(null), null);
  assert.equal(libraryLink("google", "Acme", "PL", "https://www.acme.pl"), "https://adstransparency.google.com/?region=PL&domain=acme.pl");
  assert.equal(libraryLink("google", "Acme"), "https://adstransparency.google.com/?region=PL");
});

test("a library page matches the competitor by name, ignoring case and punctuation", () => {
  assert.ok(pageMatches("ACME Home Poland", "Acme-Home"));
  assert.ok(pageMatches("Acme", "Acme Home"));
  assert.ok(!pageMatches("Other Shop", "Acme Home"));
  assert.ok(!pageMatches("ab", "ab"));
});

test("the message is guessed from Polish and English words", () => {
  assert.equal(guessAngle("Darmowa dostawa od 100 zł"), "free_shipping");
  assert.equal(guessAngle("-30% na wszystko"), "discount");
  assert.equal(guessAngle("Kup 3 za 2"), "bundle");
  assert.equal(guessAngle("Ostatnie sztuki, tylko dziś"), "urgency");
  assert.equal(guessAngle("Ponad 2000 opinii klientów"), "proof");
  assert.equal(guessAngle("Zobacz jak to działa"), "demo");
  assert.equal(guessAngle("Dzień dobry"), "other");
});

test("versions with the same words become one ad with variants, running while any version runs", () => {
  const v = (id: string, startedOn: string | null, endedOn: string | null, text = "-20% on mugs") => ({ id, startedOn, endedOn, text, headline: "", reach: 1000 });
  const [a, b] = groupLibraryAds([v("1", "2026-08-10", "2026-08-20"), v("2", "2026-08-01", null), v("3", "2026-08-05", "2026-08-30", "Free delivery today")]);
  assert.deepEqual([a!.variants, a!.startedOn, a!.endedOn, a!.stillRunning, a!.libraryId, a!.reach, a!.angle], [2, "2026-08-01", null, true, "2", 2000, "discount"]);
  assert.deepEqual([b!.variants, b!.endedOn, b!.stillRunning, b!.angle], [1, "2026-08-30", false, "free_shipping"]);
  assert.equal(a!.link, "https://www.facebook.com/ads/library/?id=2");
  assert.notEqual(a!.externalId, b!.externalId);
});
