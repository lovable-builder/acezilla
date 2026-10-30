import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeGoogleCode, fetchGoogleDataset, googleAuthUrl, googleScopesAuthUrl, GoogleApiError, listGoogleAdAccounts, refreshGoogleAccessToken } from "./google";

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

test("auth URL asks for offline access, consent and the adwords scope only", () => {
  const u = new URL(googleAuthUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "s" }));
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/adwords");
  assert.equal(u.searchParams.get("state"), "s");
});

test("code exchange returns the refresh token; refusal without one is explicit", async () => {
  const good = router(() => ok({ access_token: "AT", refresh_token: "RT" }));
  assert.deepEqual(await exchangeGoogleCode({ clientId: "c", clientSecret: "s", redirectUri: "r", code: "x", fetch: good.f }), { refreshToken: "RT", accessToken: "AT" });
  assert.match(String(good.calls[0]!.body), /grant_type=authorization_code/);
  const none = router(() => ok({ access_token: "AT" }));
  await assert.rejects(exchangeGoogleCode({ clientId: "c", clientSecret: "s", redirectUri: "r", code: "x", fetch: none.f }), /refresh token/);
  const bad = router(() => err(400, { error: "invalid_grant", error_description: "Bad code" }));
  await assert.rejects(exchangeGoogleCode({ clientId: "c", clientSecret: "s", redirectUri: "r", code: "x", fetch: bad.f }), /Bad code/);
  const rt = router(() => ok({ access_token: "NEW" }));
  assert.equal(await refreshGoogleAccessToken({ clientId: "c", clientSecret: "s", refreshToken: "RT", fetch: rt.f }), "NEW");
  assert.match(String(rt.calls[0]!.body), /grant_type=refresh_token/);
});

test("lists leaf accounts directly and through a manager, sending login-customer-id only for children", async () => {
  const { f, calls } = router((c) => {
    if (c.url.endsWith("customers:listAccessibleCustomers")) return ok({ resourceNames: ["customers/4046215939", "customers/1112223333"] });
    const q = JSON.parse(c.body ?? "{}").query as string;
    if (c.url.includes("/4046215939/") && q.includes("FROM customer LIMIT")) return ok({ results: [{ customer: { id: "4046215939", descriptiveName: "acezilla", manager: true } }] });
    if (c.url.includes("/4046215939/") && q.includes("customer_client")) return ok({ results: [{ customerClient: { id: "5556667777", descriptiveName: "Client A", currencyCode: "EUR", manager: false } }, { customerClient: { id: "4046215939", manager: true } }] });
    if (c.url.includes("/1112223333/")) return ok({ results: [{ customer: { id: "1112223333", descriptiveName: "My shop", currencyCode: "USD", manager: false } }] });
    throw new Error("unrouted " + c.url);
  });
  const accts = await listGoogleAdAccounts({ accessToken: "AT", fetch: f });
  assert.deepEqual(accts.map((a) => [a.id, a.name, a.loginCustomerId]).sort(), [["1112223333", "My shop", undefined], ["5556667777", "Client A", "4046215939"]]);
  assert.ok(calls.every((c) => !("developer-token" in c.headers)));
  const kid = calls.find((c) => c.body?.includes("customer_client"))!;
  assert.equal(kid.headers["login-customer-id"], "4046215939");
});

test("builds a campaign-level dataset, converts micros, pages results", async () => {
  let page = 0;
  const { f, calls } = router(() => {
    const row = (id: string, date: string, cost: string) => ({ campaign: { id, name: `Camp ${id}`, status: "PAUSED", advertisingChannelType: "PERFORMANCE_MAX" }, campaignBudget: { amountMicros: "25000000" }, segments: { date }, metrics: { costMicros: cost, impressions: "1000", clicks: "50", conversions: 2.5, conversionsValue: 180.5 } });
    return page++ === 0 ? ok({ results: [row("7", "2026-10-01", "12340000")], nextPageToken: "p2" }) : ok({ results: [row("7", "2026-10-02", "5000000")] });
  });
  const ds = await fetchGoogleDataset({ accessToken: "AT", fetch: f }, [{ id: "123-456-7890", name: "Shop", currency: "USD", loginCustomerId: "999" }], "2026-10-01", "2026-10-02");
  assert.equal(ds.campaigns.length, 1);
  assert.equal(ds.campaigns[0]!.status, "paused");
  assert.equal(ds.campaigns[0]!.dailyBudget, 25);
  assert.equal(ds.campaigns[0]!.objective, "performance_max");
  assert.deepEqual(ds.insights.map((i) => [i.date, i.spend, i.conversions, i.revenue]), [["2026-10-01", 12.34, 2.5, 180.5], ["2026-10-02", 5, 2.5, 180.5]]);
  assert.match(calls[0]!.url, /customers\/1234567890\/googleAds:search/);
  assert.equal(JSON.parse(calls[1]!.body!).pageToken, "p2");
  assert.equal(calls[0]!.headers["login-customer-id"], "999");
});

test("retries rate limits and surfaces permanent errors", async () => {
  let n = 0;
  const flaky = router(() => (n++ < 1 ? err(429, { error: { message: "slow down" } }) : ok({ resourceNames: [] })));
  assert.deepEqual(await listGoogleAdAccounts({ accessToken: "t", fetch: flaky.f }), []);
  assert.equal(n, 2);
  const denied = router(() => err(403, { error: { message: "caller does not have permission" } }));
  await assert.rejects(listGoogleAdAccounts({ accessToken: "t", fetch: denied.f }), (e) => e instanceof GoogleApiError && e.status === 403 && !e.retryable);
  assert.equal(denied.calls.length, 1);
});

test("explains why when every accessible account is unreadable", async () => {
  const { f } = router((c) => c.url.endsWith("customers:listAccessibleCustomers")
    ? ok({ resourceNames: ["customers/3562281131"] })
    : err(403, { error: { message: "The caller does not have permission", details: [{ errors: [{ message: "The customer account can't be accessed because it is not yet enabled or has been deactivated." }] }] } }));
  await assert.rejects(listGoogleAdAccounts({ accessToken: "t", fetch: f }), /not yet enabled or has been deactivated/);
});

test("one consent screen can ask for several scopes, each separated by a space", () => {
  const u = new URL(googleScopesAuthUrl({ clientId: "c", redirectUri: "https://x/cb", state: "s", scopes: ["https://a/one", "https://a/two"] }));
  assert.equal(u.searchParams.get("scope"), "https://a/one https://a/two");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
});
