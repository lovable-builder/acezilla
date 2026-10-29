import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSearchQueries, listSearchSites, SEARCH_CONSOLE_SCOPE, searchConsoleAuthUrl, SearchConsoleApiError } from "./searchconsole";

const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
const err = (status: number, b: unknown) => ({ ok: false, status, json: async () => b }) as Response;
type Call = { url: string; method?: string; headers: Record<string, string>; body?: string };
function router(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const c: Call = { url, method: init?.method, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined };
    calls.push(c); return handler(c);
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("auth URL asks only for read access to Search Console", () => {
  const u = new URL(searchConsoleAuthUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "s" }));
  assert.equal(u.searchParams.get("scope"), SEARCH_CONSOLE_SCOPE);
  assert.match(SEARCH_CONSOLE_SCOPE, /webmasters\.readonly$/);
  assert.equal(u.searchParams.get("access_type"), "offline");
});

test("lists websites with GET only and leaves out unverified ones", async () => {
  const { f, calls } = router(() => ok({ siteEntry: [
    { siteUrl: "sc-domain:acme.pl", permissionLevel: "siteOwner" },
    { siteUrl: "https://shop.acme.pl/", permissionLevel: "siteFullUser" },
    { siteUrl: "https://other.com/", permissionLevel: "siteUnverifiedUser" },
  ] }));
  const sites = await listSearchSites({ accessToken: "AT", fetch: f });
  assert.deepEqual(sites, [{ url: "sc-domain:acme.pl", name: "acme.pl" }, { url: "https://shop.acme.pl/", name: "shop.acme.pl" }]);
  assert.ok(calls.every((c) => c.method === "GET"));
  assert.equal(calls[0]!.headers.Authorization, "Bearer AT");
});

test("search words come back with clicks, views and position, from the encoded site address", async () => {
  const { f, calls } = router(() => ok({ rows: [
    { keys: ["kubek termiczny"], clicks: 12, impressions: 400, ctr: 0.03, position: 8.4 },
    { keys: [], clicks: 1 },
  ] }));
  const rows = await fetchSearchQueries({ accessToken: "AT", fetch: f }, "https://shop.acme.pl/", "2026-10-01", "2026-10-28");
  assert.deepEqual(rows, [{ query: "kubek termiczny", clicks: 12, impressions: 400, ctr: 0.03, position: 8.4 }]);
  assert.equal(calls[0]!.url, "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fshop.acme.pl%2F/searchAnalytics/query");
  assert.deepEqual(JSON.parse(calls[0]!.body!), { startDate: "2026-10-01", endDate: "2026-10-28", dimensions: ["query"], rowLimit: 1000, dataState: "final" });
});

test("a disabled API gives a plain instruction, and 429 is retried", async () => {
  let n = 0;
  const flaky = router(() => (n++ === 0 ? err(429, { error: { message: "slow" } }) : ok({ siteEntry: [] })));
  assert.deepEqual(await listSearchSites({ accessToken: "AT", fetch: flaky.f, maxRetries: 1 }), []);
  const off = router(() => err(403, { error: { message: "Google Search Console API has not been used in project 1 before or it is disabled." } }));
  await assert.rejects(listSearchSites({ accessToken: "AT", fetch: off.f }), (e) => e instanceof SearchConsoleApiError && /Turn on the Google Search Console API/.test(e.message));
});
