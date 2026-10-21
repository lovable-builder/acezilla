import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePage } from "./analyze";
import { extractTerms } from "./keywords";
import { diffAudits, pageIssues, siteKeywords, weeklyVerdict } from "./report";
import { scoreAudit } from "./score";
import type { CrawlResult } from "./crawl";
import { GOOD_HOME, POOR_HOME } from "./fixtures";

const mk = (html: string, url = "https://acme.test/") => analyzePage(html, { url, status: 200, ms: 100, headers: {} });
const files = { robots: { present: true, blocksAll: false, blockedBots: [], sitemaps: [] }, sitemap: { present: true, urlCount: 3, url: "x" } };

test("extracts repeated words and phrases, ignoring filler words and numbers", () => {
  const text = "Emergency plumber in Leeds. Our emergency plumber team fixes boilers. Emergency plumber call-outs 2024 2024 2024. The boilers and the leaks are the thing.";
  const t = extractTerms(text).map((x) => x.t);
  assert.ok(t.includes("emergency plumber"), t.join());
  assert.ok(!t.includes("the") && !t.includes("2024") && !t.includes("and"));
  assert.ok(!t.includes("emergency"), "a word fully explained by its phrase is dropped");
  assert.deepEqual(extractTerms(""), []);
});

test("site keywords roll up across pages and show where the main terms appear", () => {
  const rows = siteKeywords([mk(GOOD_HOME), mk(GOOD_HOME, "https://acme.test/b")]);
  assert.ok(rows.length > 0 && rows.every((r) => r.pages >= 1 && r.count >= 2));
  assert.equal(rows[0]!.pages, 2);
  const html = `<html><head><title>Boiler repair Leeds</title><meta name="description" content="Boiler repair experts"></head><body><h1>Boiler repair</h1><p>${"Boiler repair is what we do every day in Leeds. ".repeat(4)}</p></body></html>`;
  const k = siteKeywords([mk(html)]).find((r) => r.term === "boiler repair")!;
  assert.deepEqual([k.inTitle, k.inH1, k.inDescription], [true, true, true]);
  const w = siteKeywords([mk(html.replace("<title>Boiler repair Leeds", "<title>Welcome"))]).find((r) => r.term === "boiler repair")!;
  assert.equal(w.inTitle, false);
});

test("page issues list what is wrong on a page, and a noindex page is only flagged as hidden", () => {
  const poor = pageIssues(mk(POOR_HOME)).map((i) => i.label);
  assert.ok(poor.includes("No description") && poor.includes("Several H1s"), poor.join());
  assert.deepEqual(pageIssues(mk(`<html><head><meta name="robots" content="noindex"></head><body></body></html>`)).map((i) => i.label), ["Hidden from search (noindex)"]);
  assert.equal(pageIssues(mk(GOOD_HOME)).filter((i) => i.level === "missing").length, 0);
});

test("the audit scores broken links: none is good, a few need attention, many are missing", () => {
  const base: Extract<CrawlResult, { ok: true }> = { ok: true, origin: "https://acme.test", startUrl: "https://acme.test/", pages: [mk(GOOD_HOME)], files, skippedByRobots: 0, capped: false };
  const sig = (c: Extract<CrawlResult, { ok: true }>) => scoreAudit(c).findings.find((f) => f.signal === "Broken internal links")!;
  const b = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://acme.test/x${i}`, status: 404, from: ["/"] }));
  assert.equal(sig({ ...base }).status, "not_measured");
  assert.equal(sig({ ...base, broken: [], linksChecked: 12 }).status, "good");
  assert.equal(sig({ ...base, broken: b(2), linksChecked: 12 }).status, "attention");
  const many = sig({ ...base, broken: b(3), linksChecked: 12 });
  assert.equal(many.status, "missing"); assert.match(many.finding, /\/x0 \(404\)/);
});

const F = (signal: string, status: string, weight = 2) => ({ signal, status, finding: `${signal} ${status}`, weight });
test("diff reports fixed and worse signals, new and removed pages, and changed titles", () => {
  const prev = { findings: [F("Title tag", "missing", 3), F("FAQ markup", "good"), F("Lists", "attention"), F("Gone", "not_measured")], pages: [{ url: "https://a.com/", title: "Old" }, { url: "https://a.com/x", title: "X" }] };
  const cur = { findings: [F("Title tag", "good", 3), F("FAQ markup", "missing"), F("Lists", "attention"), F("Gone", "good")], pages: [{ url: "https://a.com/", title: "New" }, { url: "https://a.com/y", title: "Y" }] };
  const d = diffAudits(prev, cur);
  assert.deepEqual(d.fixed.map((x) => x.signal), ["Title tag"]);
  assert.deepEqual(d.worse.map((x) => x.signal), ["FAQ markup"]);
  assert.deepEqual(d.pagesAdded, ["/y"]); assert.deepEqual(d.pagesRemoved, ["/x"]);
  assert.deepEqual(d.titlesChanged, [{ path: "/", from: "Old", to: "New" }]);
});

test("weekly email is sent for a score drop or a heavy regression, and stays quiet for small wobbles", () => {
  const none = diffAudits({ findings: [], pages: [] }, { findings: [], pages: [] });
  assert.equal(weeklyVerdict({ seo: 8, geo: 6, aeo: 7 }, { seo: 8, geo: 6, aeo: 7 }, none).send, false);
  const drop = weeklyVerdict({ seo: 8, geo: 6, aeo: 7 }, { seo: 7, geo: 6, aeo: 7 }, none);
  assert.ok(drop.send); assert.deepEqual(drop.drops, [{ dimension: "seo", from: 8, to: 7 }]);
  const heavy = diffAudits({ findings: [F("Indexability", "good", 3)], pages: [] }, { findings: [F("Indexability", "missing", 3)], pages: [] });
  const v = weeklyVerdict({ seo: 8, geo: 6, aeo: 7 }, { seo: 8, geo: 6, aeo: 7 }, heavy);
  assert.ok(v.send && v.reasons[0]!.startsWith("Indexability"));
  assert.equal(weeklyVerdict({ seo: 8, geo: 6, aeo: 7 }, { seo: 9, geo: 6, aeo: 7 }, none).send, false);
});

test("keywords ignore legal and login pages", () => {
  const home = mk(`<html><head><title>Shop</title></head><body><p>${"garden tools garden tools ".repeat(3)}</p></body></html>`);
  const legal = mk(`<html><body><p>${"liability clause liability clause ".repeat(5)}</p></body></html>`, "https://acme.test/terms");
  const terms = siteKeywords([home, legal]).map((k) => k.term);
  assert.ok(terms.includes("garden tools") && !terms.some((t) => t.includes("liability")));
});
