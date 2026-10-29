import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGa4Report, ga4AuthUrl, Ga4ApiError, listGa4Properties } from "./ga4";

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

test("auth URL asks for offline access and the read-only Analytics scope only", () => {
  const u = new URL(ga4AuthUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "s" }));
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/analytics.readonly");
  assert.equal(u.searchParams.get("state"), "s");
});

test("lists properties across accounts and follows pagination", async () => {
  const { f, calls } = router((c) => c.url.includes("pageToken=p2")
    ? ok({ accountSummaries: [{ displayName: "Shop B", propertySummaries: [{ property: "properties/222" }] }] })
    : ok({ accountSummaries: [{ displayName: "Shop A", propertySummaries: [{ property: "properties/111", displayName: "Store" }] }], nextPageToken: "p2" }));
  const props = await listGa4Properties({ accessToken: "AT", fetch: f });
  assert.deepEqual(props, [{ id: "111", name: "Store", account: "Shop A" }, { id: "222", name: "Property 222", account: "Shop B" }]);
  assert.equal(calls[0]!.headers.Authorization, "Bearer AT");
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("report maps dates, channels and metrics, and reads the currency", async () => {
  const { f, calls } = router(() => ok({
    metadata: { currencyCode: "PLN" }, rowCount: 2,
    rows: [
      { dimensionValues: [{ value: "20261020" }, { value: "Paid Search" }], metricValues: [{ value: "120" }, { value: "6" }, { value: "840.5" }] },
      { dimensionValues: [{ value: "20261021" }, { value: "" }], metricValues: [{ value: "30" }, { value: "0" }, { value: "0" }] },
    ],
  }));
  const r = await fetchGa4Report({ accessToken: "AT", fetch: f }, "111", "2026-10-01", "2026-10-26");
  assert.equal(r.currency, "PLN");
  assert.deepEqual(r.rows, [
    { date: "2026-10-20", channel: "Paid Search", sessions: 120, conversions: 6, revenue: 840.5 },
    { date: "2026-10-21", channel: "Unassigned", sessions: 30, conversions: 0, revenue: 0 },
  ]);
  assert.match(calls[0]!.url, /properties\/111:runReport$/);
  const body = JSON.parse(calls[0]!.body!);
  assert.deepEqual(body.dateRanges, [{ startDate: "2026-10-01", endDate: "2026-10-26" }]);
  assert.deepEqual(body.metrics.map((m: any) => m.name), ["sessions", "keyEvents", "purchaseRevenue"]);
});

test("retries on 429 and then succeeds; other errors are reported with Google's message", async () => {
  let n = 0;
  const flaky = router(() => (n++ === 0 ? err(429, { error: { message: "slow down" } }) : ok({ rows: [], rowCount: 0 })));
  const r = await fetchGa4Report({ accessToken: "AT", fetch: flaky.f, maxRetries: 1 }, "111", "2026-10-01", "2026-10-02");
  assert.deepEqual(r.rows, []);
  assert.equal(flaky.calls.length, 2);
  const denied = router(() => err(403, { error: { message: "User does not have sufficient permissions" } }));
  await assert.rejects(fetchGa4Report({ accessToken: "AT", fetch: denied.f }, "111", "a", "b"), (e: unknown) => e instanceof Ga4ApiError && e.status === 403 && /sufficient permissions/.test(e.message));
});

test("a disabled API gives a plain instruction", async () => {
  const off = router(() => err(403, { error: { message: "Google Analytics Data API has not been used in project 1 before or it is disabled." } }));
  await assert.rejects(listGa4Properties({ accessToken: "AT", fetch: off.f }), /Turn on the Google Analytics/);
});
