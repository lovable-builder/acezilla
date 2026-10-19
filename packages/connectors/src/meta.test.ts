import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeMetaCode, fetchMetaDataset, listMetaAdAccounts, metaAuthUrl, MetaApiError } from "./meta";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body }) as Response;
/** Routes by URL substring; records every call. */
function router(routes: Record<string, () => Response>) {
  const calls: { url: string; auth?: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unrouted ${url}`);
    return routes[key]!();
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("lists ad accounts and sends the token as a header, not in the URL", async () => {
  const { f, calls } = router({ "me/adaccounts": () => ok({ data: [{ account_id: "123", name: "Shop", currency: "EUR", account_status: 1 }] }) });
  const accts = await listMetaAdAccounts({ accessToken: "TOKEN", fetch: f });
  assert.deepEqual(accts, [{ id: "123", name: "Shop", currency: "EUR", status: 1 }]);
  assert.equal(calls[0]!.auth, "Bearer TOKEN");
  assert.ok(!calls[0]!.url.includes("TOKEN"));
});

test("follows paging links", async () => {
  let n = 0;
  const f = (async () => (n++ === 0 ? ok({ data: [{ account_id: "1" }], paging: { next: "https://graph.facebook.com/next" } }) : ok({ data: [{ account_id: "2" }] }))) as unknown as typeof fetch;
  assert.equal((await listMetaAdAccounts({ accessToken: "t", fetch: f })).length, 2);
});

test("builds a normalised dataset from ad-level insights (purchases only, no double counting)", async () => {
  const insight = { campaign_id: "C1", campaign_name: "Prospecting", adset_id: "S1", adset_name: "Broad", ad_id: "A1", ad_name: "Hook 1", date_start: "2026-10-01", spend: "12.50", impressions: "1000", clicks: "40",
    actions: [{ action_type: "link_click", value: "40" }, { action_type: "omni_purchase", value: "3" }, { action_type: "purchase", value: "3" }],
    action_values: [{ action_type: "omni_purchase", value: "150.00" }, { action_type: "purchase", value: "150.00" }] };
  const { f } = router({
    "/campaigns": () => ok({ data: [{ id: "C1", objective: "OUTCOME_SALES", effective_status: "PAUSED", daily_budget: "5000" }] }),
    "/insights": () => ok({ data: [insight] }),
  });
  const ds = await fetchMetaDataset({ accessToken: "t", fetch: f }, [{ id: "9", name: "Shop", currency: "USD", status: 1 }], "2026-10-01", "2026-10-02");
  assert.equal(ds.campaigns[0]!.dailyBudget, 50);
  assert.equal(ds.campaigns[0]!.status, "paused");
  assert.deepEqual(ds.insights[0], { adExternalId: "meta-ad-A1", date: "2026-10-01", spend: 12.5, impressions: 1000, clicks: 40, conversions: 3, revenue: 150 });
  assert.equal(ds.ads[0]!.adGroupExternalId, "meta-grp-S1");
});

test("retries rate limits, then succeeds", async () => {
  let n = 0;
  const f = (async () => (n++ < 1 ? fail(400, { error: { code: 17, message: "User request limit reached" } }) : ok({ data: [] }))) as unknown as typeof fetch;
  const t0 = Date.now();
  assert.deepEqual(await listMetaAdAccounts({ accessToken: "t", fetch: f }), []);
  assert.equal(n, 2);
  assert.ok(Date.now() - t0 >= 900);
});

test("surfaces permanent errors without retrying", async () => {
  let n = 0;
  const f = (async () => { n++; return fail(400, { error: { code: 190, message: "Invalid OAuth access token" } }); }) as unknown as typeof fetch;
  await assert.rejects(listMetaAdAccounts({ accessToken: "bad", fetch: f }), (e) => e instanceof MetaApiError && e.code === 190 && !e.retryable);
  assert.equal(n, 1);
});

test("OAuth helpers", async () => {
  const url = new URL(metaAuthUrl({ appId: "1", configId: "2", redirectUri: "http://localhost:3000/cb", state: "s" }));
  assert.equal(url.searchParams.get("config_id"), "2");
  assert.equal(url.searchParams.get("state"), "s");
  const f = (async () => ok({ access_token: "AT", expires_in: 5184000 })) as unknown as typeof fetch;
  assert.deepEqual(await exchangeMetaCode({ appId: "1", appSecret: "x", redirectUri: "r", code: "c", fetch: f }), { accessToken: "AT", expiresInSec: 5184000 });
  const bad = (async () => fail(400, { error: { message: "Code expired" } })) as unknown as typeof fetch;
  await assert.rejects(exchangeMetaCode({ appId: "1", appSecret: "x", redirectUri: "r", code: "c", fetch: bad }), /Code expired/);
});
