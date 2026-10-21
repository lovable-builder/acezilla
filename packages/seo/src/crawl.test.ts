import { test } from "node:test";
import assert from "node:assert/strict";
import { crawlSite } from "./crawl";

const pub = async () => ["93.184.216.34"];
const page = (links: string[], t = "T") => new Response(`<html lang="en"><head><title>${t}</title></head><body><h1>${t}</h1>${links.map((l) => `<a href="${l}">x</a>`).join("")}</body></html>`, { headers: { "content-type": "text/html" } });
function site(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const f = (async (url: string) => { calls.push(url); const r = routes[url]; return r ? r() : new Response("nope", { status: 404 }); }) as unknown as typeof fetch;
  return { f, calls };
}

test("crawls same-host pages from links and the sitemap, skipping robots-blocked and non-HTML", async () => {
  const { f, calls } = site({
    "https://a.com/": () => page(["/about", "/private/x", "/file.pdf", "https://other.com/z", "/about#frag"]),
    "https://a.com/about": () => page(["/"], "About"),
    "https://a.com/pricing": () => page([], "Pricing"),
    "https://a.com/robots.txt": () => new Response("User-agent: *\nDisallow: /private\nSitemap: https://a.com/sitemap.xml\n"),
    "https://a.com/sitemap.xml": () => new Response("<urlset><url><loc>https://a.com/pricing</loc></url><url><loc>https://elsewhere.com/x</loc></url></urlset>"),
  });
  const r = await crawlSite("https://a.com/", { fetch: f, lookup: pub, delayMs: 0 });
  assert.ok(r.ok);
  assert.deepEqual(r.pages.map((p) => new URL(p.url).pathname).sort(), ["/", "/about", "/pricing"]);
  assert.ok(!calls.some((c) => c.includes("/private") || c.includes("other.com") || c.includes("elsewhere")));
  assert.ok(!r.pages.some((p) => p.url.endsWith(".pdf")), "a PDF is checked as a link, never parsed as a page");
  assert.equal(r.skippedByRobots, 1);
  assert.equal(r.files.robots.present, true); assert.equal(r.files.sitemap.urlCount, 2);
});

test("respects the page cap and reports it", async () => {
  const routes: Record<string, () => Response> = { "https://a.com/": () => page(Array.from({ length: 30 }, (_, i) => `/p${i}`)) };
  for (let i = 0; i < 30; i++) routes[`https://a.com/p${i}`] = () => page([], `P${i}`);
  const { f } = site(routes);
  const r = await crawlSite("https://a.com/", { fetch: f, lookup: pub, delayMs: 0, maxPages: 5 });
  assert.ok(r.ok && r.pages.length === 5 && r.capped);
});

test("detects AI crawlers blocked in robots.txt and a missing sitemap", async () => {
  const { f } = site({ "https://a.com/": () => page([]), "https://a.com/robots.txt": () => new Response("User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\n") });
  const r = await crawlSite("https://a.com/", { fetch: f, lookup: pub, delayMs: 0 });
  assert.ok(r.ok && r.files.robots.blockedBots.includes("GPTBot") && !r.files.robots.blockedBots.includes("Googlebot") && !r.files.sitemap.present);
});

test("a start URL that is unsafe or unreachable returns a clear error", async () => {
  const bad = await crawlSite("http://169.254.169.254/", { lookup: pub, delayMs: 0 });
  assert.ok(!bad.ok && /private|internal/i.test(bad.error));
  const { f } = site({});
  const none = await crawlSite("https://a.com/", { fetch: f, lookup: pub, delayMs: 0 });
  assert.ok(none.ok === false);
});

test("follows a www redirect and stays on the final host", async () => {
  const { f } = site({ "https://a.com/": () => new Response(null, { status: 301, headers: { location: "https://www.a.com/" } }), "https://www.a.com/": () => page(["/x", "https://a.com/y"]), "https://www.a.com/x": () => page([]) });
  const r = await crawlSite("https://a.com/", { fetch: f, lookup: pub, delayMs: 0 });
  assert.ok(r.ok && r.origin === "https://www.a.com" && r.pages.length === 2);
});

test("finds broken internal links, including pages beyond the crawl cap, and says which page links to them", async () => {
  const { f } = site({
    "https://a.com/": () => page(["/gone", "/ok", "/deep1", "/deep2"]),
    "https://a.com/ok": () => page(["/gone2"], "OK"),
    "https://a.com/deep1": () => page([], "D1"),
    "https://a.com/deep2": () => new Response("x", { status: 500 }),
  });
  const r = await crawlSite("https://a.com/", { fetch: f, lookup: pub, delayMs: 0, maxPages: 2 });
  assert.ok(r.ok);
  const urls = Object.fromEntries((r.broken ?? []).map((b) => [new URL(b.url).pathname, b]));
  assert.equal(urls["/gone"]?.status, 404); assert.deepEqual(urls["/gone"]?.from, ["/"]);
  assert.equal(urls["/deep2"]?.status, 500);
  assert.ok(!urls["/ok"] && !urls["/deep1"], "healthy pages are not reported");
  assert.ok((r.linksChecked ?? 0) >= 4);
});

test("a private redirect target is not reported as a broken link and never fetched", async () => {
  const calls: string[] = [];
  const f = (async (url: string) => { calls.push(url); if (url === "https://a.com/") return page(["/jump"]); if (url === "https://a.com/jump") return new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } }); return new Response("nope", { status: 404 }); }) as unknown as typeof fetch;
  const r = await crawlSite("https://a.com/", { fetch: f, lookup: pub, delayMs: 0 });
  assert.ok(r.ok && !(r.broken ?? []).some((b) => b.url.includes("jump")));
  assert.ok(!calls.some((c) => c.includes("169.254")));
});
