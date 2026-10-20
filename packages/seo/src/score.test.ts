import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePage } from "./analyze";
import { scoreAudit } from "./score";
import type { CrawlResult } from "./crawl";
import { GOOD_HOME, POOR_HOME } from "./fixtures";

const H = { "strict-transport-security": "1", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };
const mkPage = (html: string, url = "https://acme.test/", headers: Record<string, string> = H) => analyzePage(html, { url, status: 200, ms: 200, headers });
const crawl = (pages: ReturnType<typeof mkPage>[], files: Partial<Extract<CrawlResult, { ok: true }>["files"]> = {}, startUrl = pages[0]!.url): Extract<CrawlResult, { ok: true }> => ({
  ok: true, origin: new URL(startUrl).origin, startUrl, pages, skippedByRobots: 0, capped: false,
  files: { robots: { present: true, blocksAll: false, blockedBots: [], sitemaps: [], ...files.robots }, sitemap: { present: true, urlCount: 5, url: "x", ...files.sitemap } },
});
const sig = (r: ReturnType<typeof scoreAudit>, s: string) => r.findings.find((f) => f.signal === s)!;

test("a well-built site scores high and explains each result", () => {
  const extra = ["/about", "/contact", "/privacy", "/terms", "/services", "/blog"].map((p) => mkPage(GOOD_HOME.replace("<title>", `<title>${p} `), `https://acme.test${p}`));
  const r = scoreAudit(crawl([mkPage(GOOD_HOME), ...extra]));
  assert.ok(r.scores.seo >= 8, `seo ${r.scores.seo}`); assert.ok(r.scores.geo >= 7, `geo ${r.scores.geo}`); assert.ok(r.scores.aeo >= 8, `aeo ${r.scores.aeo}`);
  assert.equal(sig(r, "Title tag").status, "good");
  assert.equal(sig(r, "FAQ markup").status, "good");
  assert.equal(sig(r, "About page / who is behind the site").status, "good");
  assert.ok(r.findings.every((f) => f.finding.length > 5 && f.weight > 0));
});

test("a poor site scores low and the biggest problems are named", () => {
  const r = scoreAudit(crawl([mkPage(POOR_HOME, "https://thing.vercel.app/", {})], { robots: { present: false, blocksAll: false, blockedBots: [], sitemaps: [] }, sitemap: { present: false, urlCount: 0, url: null } }));
  assert.ok(r.scores.seo <= 4, `seo ${r.scores.seo}`); assert.ok(r.scores.geo <= 3, `geo ${r.scores.geo}`); assert.ok(r.scores.aeo <= 4, `aeo ${r.scores.aeo}`);
  assert.equal(sig(r, "Meta description").status, "missing");
  assert.equal(sig(r, "Headings (H1)").status, "attention");   // exists, but twice
  assert.equal(sig(r, "Contact information").status, "attention");
  assert.match(sig(r, "Contact information").finding, /being set up|coming soon/i);
  assert.equal(sig(r, "Custom domain").status, "attention");
  assert.match(r.summary, /Biggest opportunities/);
});

test("noindex and a robots.txt block are treated as critical", () => {
  const noindex = scoreAudit(crawl([mkPage(GOOD_HOME.replace("<head>", '<head><meta name="robots" content="noindex">'))]));
  assert.equal(sig(noindex, "Indexability").status, "missing");
  const blocked = scoreAudit(crawl([mkPage(GOOD_HOME)], { robots: { present: true, blocksAll: true, blockedBots: [], sitemaps: [] } }));
  assert.equal(sig(blocked, "Indexability").status, "missing");
});

test("blocking AI crawlers is flagged without punishing Googlebot-only rules", () => {
  const r = scoreAudit(crawl([mkPage(GOOD_HOME)], { robots: { present: true, blocksAll: false, blockedBots: ["GPTBot", "ClaudeBot"], sitemaps: [] } }));
  assert.equal(sig(r, "AI crawlers allowed").status, "attention");
  assert.match(sig(r, "AI crawlers allowed").finding, /GPTBot/);
  const g = scoreAudit(crawl([mkPage(GOOD_HOME)], { robots: { present: true, blocksAll: false, blockedBots: ["Googlebot"], sitemaps: [] } }));
  assert.equal(sig(g, "AI crawlers allowed").status, "good");
});

test("single-page sites cannot be checked for duplicates, and scores stay within 1-10", () => {
  const r = scoreAudit(crawl([mkPage(GOOD_HOME)]));
  assert.equal(sig(r, "Unique titles and descriptions").status, "not_measured");
  for (const s of Object.values(r.scores)) assert.ok(s >= 1 && s <= 10);
  const worst = scoreAudit(crawl([mkPage("<html></html>", "http://x.test/", {})], { robots: { present: false, blocksAll: false, blockedBots: [], sitemaps: [] }, sitemap: { present: false, urlCount: 0, url: null } }));
  for (const s of Object.values(worst.scores)) assert.ok(s >= 1 && s <= 10);
});

test("duplicate descriptions across pages are caught", () => {
  const a = mkPage(GOOD_HOME), b = mkPage(GOOD_HOME.replace("<title>", "<title>Other "), "https://acme.test/b");
  assert.notEqual(sig(scoreAudit(crawl([a, b])), "Unique titles and descriptions").status, "good");
});

test("query-string variants and noindex pages do not cause false duplicate or size findings", () => {
  const a = mkPage(GOOD_HOME), login = mkPage(GOOD_HOME.replace("<head>", '<head><meta name="robots" content="noindex">'), "https://acme.test/login"), login2 = mkPage(GOOD_HOME.replace("<head>", '<head><meta name="robots" content="noindex">'), "https://acme.test/login?mode=signup");
  const r = scoreAudit(crawl([a, login, login2]));
  assert.equal(sig(r, "Unique titles and descriptions").status, "not_measured");           // only one indexable page
  assert.match(sig(r, "Site size").finding, /^1 indexable/);
});

test("the word 'review' alone is not a trust signal", () => {
  const p = mkPage(GOOD_HOME.replace(/testimonials|case study/g, "pages").replace(/Customers trust us\./g, "We work with platform reviews."), "https://acme.test/");
  assert.equal(sig(scoreAudit(crawl([p])), "Trust signals (proof)").status, "missing");
});

test("10 is reserved for sites with nothing to improve; heavy gaps cap a dimension at 8", () => {
  const full = (): Parameters<typeof crawl>[0] => ["/about", "/contact", "/privacy", "/terms", "/services", "/blog", "/a", "/b", "/c", "/d"].map((p) => mkPage(GOOD_HOME.replace("<title>", `<title>${p} `).replace('content="Fast,', `content="${p} Fast,`), `https://acme.test${p}`));
  const r = scoreAudit(crawl([mkPage(GOOD_HOME), ...full()]));
  const bad = r.findings.filter((f) => f.status !== "good" && f.status !== "not_measured");
  for (const d of ["seo", "geo", "aeo"] as const) if (r.findings.some((f) => f.dimension === d && f.status !== "good" && f.status !== "not_measured")) assert.ok(r.scores[d] <= 9, `${d} ${r.scores[d]} with ${bad.length} imperfect signals`);
  const noAbout = scoreAudit(crawl([mkPage(GOOD_HOME.replace(/<a href="\/about">About<\/a>/, "").replace(/<a href="\/contact">Contact<\/a>/, ""))]));
  assert.ok(noAbout.scores.geo <= 8);
});
