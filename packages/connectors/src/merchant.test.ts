import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchMerchantPerformance, fetchMerchantProducts, listMerchantAccounts, merchantAuthUrl, MerchantApiError, registerMerchantDeveloper } from "./merchant";

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

test("auth URL asks for offline access and the Merchant Center scope", () => {
  const u = new URL(merchantAuthUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "s" }));
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/content");
  assert.equal(u.searchParams.get("state"), "s");
});

test("lists accounts across pages with GET only", async () => {
  const { f, calls } = router((c) => c.url.includes("pageToken=p2")
    ? ok({ accounts: [{ name: "accounts/222" }] })
    : ok({ accounts: [{ name: "accounts/111", accountId: "111", accountName: "Shop A" }], nextPageToken: "p2" }));
  const accounts = await listMerchantAccounts({ accessToken: "AT", fetch: f });
  assert.deepEqual(accounts, [{ id: "111", name: "Shop A" }, { id: "222", name: "Account 222" }]);
  assert.ok(calls.every((c) => c.method === "GET" && c.url.startsWith("https://merchantapi.googleapis.com/accounts/v1/accounts")));
  assert.equal(calls[0]!.headers.Authorization, "Bearer AT");
});

test("performance rows are split into free and ads, summed per day and read from Google's date and money shapes", async () => {
  const { f, calls } = router(() => ok({ results: [
    { productPerformanceView: { date: { year: 2026, month: 10, day: 5 }, marketingMethod: "ORGANIC", clicks: "40", impressions: "1000", conversions: 3, conversionValue: { amountMicros: "250500000", currencyCode: "PLN" } } },
    { productPerformanceView: { date: { year: 2026, month: 10, day: 5 }, marketingMethod: "ORGANIC", clicks: "10", impressions: "200", conversions: 1, conversionValue: { amountMicros: "49500000", currencyCode: "PLN" } } },
    { productPerformanceView: { date: { year: 2026, month: 10, day: 5 }, marketingMethod: "ADS", clicks: "7", impressions: "90" } },
    { productPerformanceView: { marketingMethod: "ADS", clicks: "9" } },
  ] }));
  const r = await fetchMerchantPerformance({ accessToken: "AT", fetch: f }, "111", "2026-10-01", "2026-10-27");
  assert.equal(r.currency, "PLN");
  assert.deepEqual(r.rows, [
    { date: "2026-10-05", source: "ads", clicks: 7, impressions: 90, conversions: 0, conversionValue: 0 },
    { date: "2026-10-05", source: "free", clicks: 50, impressions: 1200, conversions: 4, conversionValue: 300 },
  ]);
  assert.equal(calls[0]!.method, "POST");
  assert.match(calls[0]!.url, /reports\/v1\/accounts\/111\/reports:search$/);
  const q = JSON.parse(calls[0]!.body!).query as string;
  assert.match(q, /FROM product_performance_view WHERE date BETWEEN '2026-10-01' AND '2026-10-27'/);
});

test("products carry their Shopping status and issues, and follow paging", async () => {
  const { f, calls } = router((c) => JSON.parse(c.body!).pageToken
    ? ok({ results: [{ productView: { id: "online~pl~PL~2", offerId: "2", title: "Cup", aggregatedReportingContextStatus: "ELIGIBLE_LIMITED" } }] })
    : ok({ results: [{ productView: { id: "online~pl~PL~1", offerId: "1", title: "Mug", aggregatedReportingContextStatus: "NOT_ELIGIBLE_OR_DISAPPROVED", clickPotential: "LOW",
        itemIssues: [{ type: { code: "missing_gtin" }, severity: { aggregatedSeverity: "DISAPPROVED" }, resolution: "MERCHANT_ACTION" }] } }], nextPageToken: "n2" }));
  const p = await fetchMerchantProducts({ accessToken: "AT", fetch: f }, "111");
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { productId: "online~pl~PL~1", offerId: "1", title: "Mug", status: "disapproved", clickPotential: "low", issues: [{ code: "missing_gtin", severity: "disapproved", resolution: "merchant_action" }] });
  assert.equal(p[1]!.status, "limited");
  assert.match(JSON.parse(calls[0]!.body!).query, /FROM product_view$/);
});

test("if Google rejects the issues column, products are fetched again without it", async () => {
  const { f, calls } = router((c) => /item_issues/.test(c.body!)
    ? err(400, { error: { message: "Invalid field item_issues" } })
    : ok({ results: [{ productView: { id: "a", aggregatedReportingContextStatus: "ELIGIBLE" } }] }));
  const p = await fetchMerchantProducts({ accessToken: "AT", fetch: f }, "111");
  assert.equal(p[0]!.status, "eligible");
  assert.deepEqual(p[0]!.issues, []);
  assert.equal(calls.length, 2);
});

test("retries on 429; a disabled API and an unregistered project give plain instructions", async () => {
  let n = 0;
  const flaky = router(() => (n++ === 0 ? err(429, { error: { message: "slow down" } }) : ok({ accounts: [] })));
  assert.deepEqual(await listMerchantAccounts({ accessToken: "AT", fetch: flaky.f, maxRetries: 1 }), []);
  assert.equal(flaky.calls.length, 2);
  const off = router(() => err(403, { error: { message: "Merchant API has not been used in project 1 before or it is disabled." } }));
  await assert.rejects(listMerchantAccounts({ accessToken: "AT", fetch: off.f }), /Turn on the Merchant API/);
  const unreg = router(() => err(401, { error: { message: "GCP project 123 is not registered with the Merchant Center account." } }));
  await assert.rejects(listMerchantAccounts({ accessToken: "AT", fetch: unreg.f }), (e: unknown) => e instanceof MerchantApiError && e.status === 401 && /not registered with your Merchant Center/.test(e.message));
});

test("developer registration posts the contact email to the account's registerGcp method", async () => {
  const { f, calls } = router(() => ok({ name: "accounts/123/developerRegistration", gcpIds: ["99887766"] }));
  const r = await registerMerchantDeveloper({ accessToken: "AT", fetch: f }, "123", "me@shop.pl");
  assert.deepEqual(r, { gcpIds: ["99887766"] });
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "https://merchantapi.googleapis.com/accounts/v1/accounts/123/developerRegistration:registerGcp");
  assert.deepEqual(JSON.parse(calls[0]!.body!), { developerEmail: "me@shop.pl" });
  await assert.rejects(registerMerchantDeveloper({ accessToken: "AT", fetch: f }, "abc/../9", "me@shop.pl"), /number/);
  assert.equal(calls.length, 1);
});

import { fetchMerchantPrices } from "./merchant";

test("prices are read next to Google's benchmark, with money in micros, and rows without a benchmark are dropped", async () => {
  const { f, calls } = router(() => ok({ results: [
    { priceCompetitivenessProductView: { id: "en~PL~SKU-1", title: "Mug", brand: "Acme", price: { amountMicros: "59990000", currencyCode: "PLN" }, benchmarkPrice: { amountMicros: "49900000", currencyCode: "PLN" } } },
    { priceCompetitivenessProductView: { id: "en~PL~SKU-2", title: "Cup", price: { amountMicros: "20000000", currencyCode: "PLN" } } },
  ] }));
  const rows = await fetchMerchantPrices({ accessToken: "AT", fetch: f }, "111");
  assert.deepEqual(rows, [{ productId: "en~PL~SKU-1", offerId: "SKU-1", title: "Mug", brand: "Acme", price: 59.99, benchmark: 49.9, currency: "PLN" }]);
  assert.match(JSON.parse(calls[0]!.body!).query, /FROM price_competitiveness_product_view$/);
  assert.equal(calls[0]!.method, "POST");
});
