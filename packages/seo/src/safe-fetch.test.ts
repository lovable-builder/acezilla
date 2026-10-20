import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFetch } from "./safe-fetch";
import { isAllowed, parseRobots } from "./robots";

const pub = async () => ["93.184.216.34"];
const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });
const mk = (routes: Record<string, () => Response>) => {
  const calls: string[] = [];
  const f = (async (url: string) => { calls.push(url); const r = routes[url]; if (!r) throw new Error("unrouted " + url); return r(); }) as unknown as typeof fetch;
  return { f, calls };
};

test("fetches a page, reports timing and lowercase headers", async () => {
  const { f } = mk({ "https://a.com/": () => html("<h1>hi</h1>", { headers: { "content-type": "text/html", "X-Test": "1" } }) });
  const r = await safeFetch("https://a.com/", { fetch: f, lookup: pub, requireHtml: true });
  assert.ok(r.ok && r.body.includes("hi") && r.headers["x-test"] === "1");
});

test("follows redirects but validates every hop", async () => {
  const { f, calls } = mk({ "https://a.com/": () => new Response(null, { status: 301, headers: { location: "https://b.com/x" } }), "https://b.com/x": () => html("ok") });
  const r = await safeFetch("https://a.com/", { fetch: f, lookup: pub });
  assert.ok(r.ok && r.url === "https://b.com/x" && r.redirects.length === 1);
  assert.deepEqual(calls, ["https://a.com/", "https://b.com/x"]);
});

test("a redirect to an internal address is blocked before it is requested", async () => {
  const { f, calls } = mk({ "https://a.com/": () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }) });
  const r = await safeFetch("https://a.com/", { fetch: f, lookup: pub });
  assert.ok(!r.ok && r.unsafe);
  assert.deepEqual(calls, ["https://a.com/"]);                    // the metadata URL was never fetched
  const { f: f2 } = mk({ "https://a.com/": () => new Response(null, { status: 302, headers: { location: "https://rebind.example/" } }) });
  const r2 = await safeFetch("https://a.com/", { fetch: f2, lookup: async (h) => (h === "rebind.example" ? ["10.0.0.9"] : ["93.184.216.34"]) });
  assert.ok(!r2.ok && r2.unsafe);
});

test("redirect loops, oversized pages and non-HTML are rejected", async () => {
  const loop = mk({ "https://a.com/": () => new Response(null, { status: 302, headers: { location: "https://a.com/" } }) });
  assert.match((await safeFetch("https://a.com/", { fetch: loop.f, lookup: pub, maxRedirects: 3 }) as { error: string }).error, /redirects/);
  const big = mk({ "https://a.com/": () => html("x".repeat(5000)) });
  assert.match((await safeFetch("https://a.com/", { fetch: big.f, lookup: pub, maxBytes: 1000 }) as { error: string }).error, /too large/);
  const pdf = mk({ "https://a.com/": () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }) });
  assert.match((await safeFetch("https://a.com/", { fetch: pdf.f, lookup: pub, requireHtml: true }) as { error: string }).error, /Not an HTML/);
});

test("timeouts and network failures return clear errors instead of throwing", async () => {
  const slow = (async (_u: string, init: RequestInit) => new Promise((_, rej) => { init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))); })) as unknown as typeof fetch;
  assert.match((await safeFetch("https://a.com/", { fetch: slow, lookup: pub, timeoutMs: 30 }) as { error: string }).error, /too long/);
  const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
  assert.match((await safeFetch("https://a.com/", { fetch: down, lookup: pub }) as { error: string }).error, /Could not reach/);
});

test("robots.txt: longest match wins, agent groups, wildcards, sitemaps", () => {
  const r = parseRobots(`User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://a.com/sitemap.xml\n`);
  assert.equal(isAllowed(r, "acezilla-seo-bot", "/"), true);
  assert.equal(isAllowed(r, "acezilla-seo-bot", "/private/x"), false);
  assert.equal(isAllowed(r, "acezilla-seo-bot", "/private/public/page"), true);
  assert.equal(isAllowed(r, "GPTBot", "/anything"), false);
  assert.deepEqual(r.sitemaps, ["https://a.com/sitemap.xml"]);
  assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow: /*.pdf$"), "x", "/a/file.pdf"), false);
  assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow:"), "x", "/a"), true);
  assert.equal(isAllowed(parseRobots(""), "x", "/a"), true);
});
