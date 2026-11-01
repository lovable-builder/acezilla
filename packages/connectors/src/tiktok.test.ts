import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeTiktokCode, fetchTiktokDataset, listTiktokAdvertisers, purchaseValue, TiktokApiError, tiktokAuthUrl } from "./tiktok";

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ code: 0, message: "OK", data }) }) as Response;
const bad = (code: number, message: string, status = 200) => ({ ok: status < 400, status, json: async () => ({ code, message }) }) as Response;
/** Routes by URL substring (first match wins); records every call. */
function router(routes: Record<string, () => Response>) {
  const calls: { url: string; token?: string; method?: string; body?: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, token: (init?.headers as Record<string, string> | undefined)?.["Access-Token"], method: init?.method, body: init?.body as string | undefined });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unrouted ${url}`);
    return routes[key]!();
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("builds the advertiser authorization URL", () => {
  const u = new URL(tiktokAuthUrl({ appId: "123", redirectUri: "https://acezilla.vercel.app/api/connect/tiktok/callback", state: "abc" }));
  assert.equal(u.origin + u.pathname, "https://business-api.tiktok.com/portal/auth");
  assert.equal(u.searchParams.get("app_id"), "123");
  assert.equal(u.searchParams.get("state"), "abc");
  assert.equal(u.searchParams.get("redirect_uri"), "https://acezilla.vercel.app/api/connect/tiktok/callback");
});

test("exchanges the auth code with a JSON body", async () => {
  const { f, calls } = router({ "oauth2/access_token": () => ok({ access_token: "TOK", scope: [1, 2], advertiser_ids: [11, 22] }) });
  const r = await exchangeTiktokCode({ appId: "A", appSecret: "S", authCode: "CODE", fetch: f });
  assert.deepEqual(r, { accessToken: "TOK", advertiserIds: ["11", "22"] });
  assert.equal(calls[0]!.method, "POST");
  assert.deepEqual(JSON.parse(calls[0]!.body!), { app_id: "A", secret: "S", auth_code: "CODE" });
});

test("a rejected code becomes a clear error", async () => {
  const { f } = router({ "oauth2/access_token": () => bad(40002, "auth_code is invalid") });
  await assert.rejects(exchangeTiktokCode({ appId: "A", appSecret: "S", authCode: "x", fetch: f }), (e: unknown) => e instanceof TiktokApiError && e.message === "auth_code is invalid");
});

test("lists the granted advertisers with currency, token in the header only", async () => {
  const { f, calls } = router({
    "oauth2/advertiser/get": () => ok({ list: [{ advertiser_id: "11", advertiser_name: "Shop PL" }] }),
    "advertiser/info": () => ok({ list: [{ advertiser_id: "11", name: "Shop PL", currency: "PLN", status: "STATUS_ENABLE" }] }),
  });
  const a = await listTiktokAdvertisers({ accessToken: "TOKEN", appId: "A", appSecret: "S", fetch: f });
  assert.deepEqual(a, [{ id: "11", name: "Shop PL", currency: "PLN", status: "STATUS_ENABLE" }]);
  assert.equal(calls[0]!.token, "TOKEN");
  assert.ok(calls.every((c) => !c.url.includes("TOKEN")));
  assert.equal(new URL(calls[1]!.url).searchParams.get("advertiser_ids"), '["11"]');
});

test("refuses to list advertisers without the app credentials", async () => {
  await assert.rejects(listTiktokAdvertisers({ accessToken: "t" }), TiktokApiError);
});

const row = (over: Record<string, unknown> = {}) => ({
  dimensions: { ad_id: "A1", stat_time_day: "2026-10-01 00:00:00" },
  metrics: { campaign_id: "C1", campaign_name: "Prospecting", adgroup_id: "G1", adgroup_name: "Broad", ad_name: "Hook 1", spend: "12.50", impressions: "1000", clicks: "40", complete_payment: "3", total_complete_payment_rate: "150.00", ...over },
});
const acct = { id: "11", name: "Shop PL", currency: "PLN", status: "STATUS_ENABLE" };

test("builds a normalised dataset from ad-level reporting", async () => {
  const { f, calls } = router({
    "campaign/get": () => ok({ list: [{ campaign_id: "C1", objective_type: "WEB_CONVERSIONS", operation_status: "DISABLE", budget: 50 }], page_info: { total_page: 1 } }),
    "report/integrated/get": () => ok({ list: [row()], page_info: { total_page: 1 } }),
  });
  const ds = await fetchTiktokDataset({ accessToken: "t", fetch: f }, [acct], "2026-10-01", "2026-10-02");
  assert.equal(ds.accounts[0]!.currency, "PLN");
  assert.equal(ds.campaigns[0]!.status, "paused");
  assert.equal(ds.campaigns[0]!.dailyBudget, 50);
  assert.equal(ds.campaigns[0]!.externalId, "tiktok-cmp-C1");
  assert.equal(ds.ads[0]!.adGroupExternalId, "tiktok-grp-G1");
  assert.deepEqual(ds.insights[0], { adExternalId: "tiktok-ad-A1", date: "2026-10-01", spend: 12.5, impressions: 1000, clicks: 40, conversions: 3, revenue: 150 });
  const report = calls.find((c) => c.url.includes("report/integrated/get"))!;
  assert.equal(new URL(report.url).searchParams.get("data_level"), "AUCTION_AD");
});

test("reports of more than 30 days are asked for in windows of at most 30 days", async () => {
  const { f, calls } = router({
    "campaign/get": () => ok({ list: [], page_info: { total_page: 1 } }),
    "report/integrated/get": () => ok({ list: [], page_info: { total_page: 1 } }),
  });
  await fetchTiktokDataset({ accessToken: "t", fetch: f }, [acct], "2026-08-01", "2026-10-02");
  const spans = calls.filter((c) => c.url.includes("report/integrated/get")).map((c) => { const p = new URL(c.url).searchParams; return [p.get("start_date")!, p.get("end_date")!]; });
  assert.deepEqual(spans, [["2026-08-01", "2026-08-30"], ["2026-08-31", "2026-09-29"], ["2026-09-30", "2026-10-02"]]);
});

test("follows report pages", async () => {
  let n = 0;
  const { f } = router({
    "campaign/get": () => ok({ list: [], page_info: { total_page: 1 } }),
    "report/integrated/get": () => ok({ list: [row({ spend: String(++n) })], page_info: { total_page: 2 } }),
  });
  const ds = await fetchTiktokDataset({ accessToken: "t", fetch: f }, [acct], "2026-10-01", "2026-10-01");
  assert.equal(ds.insights.length, 2);
});

test("if TikTok refuses the purchase-value fields, asks again without them and reads sales as zero", async () => {
  const seen: string[] = [];
  const f = (async (url: string) => {
    if (url.includes("campaign/get")) return ok({ list: [], page_info: { total_page: 1 } });
    const metrics = new URL(url).searchParams.get("metrics")!;
    seen.push(metrics);
    return metrics.includes("total_complete_payment_rate") ? bad(40002, "Invalid metric field: total_complete_payment_rate") : ok({ list: [row({ total_complete_payment_rate: undefined })], page_info: { total_page: 1 } });
  }) as unknown as typeof fetch;
  const ds = await fetchTiktokDataset({ accessToken: "t", fetch: f }, [acct], "2026-10-01", "2026-10-01");
  assert.equal(seen.length, 2);
  assert.equal(ds.insights[0]!.revenue, 0);
  assert.equal(ds.insights[0]!.spend, 12.5);
});

test("a window that is too large is split in two", async () => {
  const f = (async (url: string) => {
    if (url.includes("campaign/get")) return ok({ list: [], page_info: { total_page: 1 } });
    const p = new URL(url).searchParams;
    return p.get("start_date") === "2026-10-01" && p.get("end_date") === "2026-10-04" ? bad(40067, "query too large") : ok({ list: [], page_info: { total_page: 1 } });
  }) as unknown as typeof fetch;
  const ds = await fetchTiktokDataset({ accessToken: "t", fetch: f }, [acct], "2026-10-01", "2026-10-04");
  assert.equal(ds.insights.length, 0);
});

test("an expired or revoked token needs a new login and is not retried", async () => {
  let n = 0;
  const f = (async () => { n++; return bad(40105, "Access token is incorrect or has been revoked"); }) as unknown as typeof fetch;
  await assert.rejects(fetchTiktokDataset({ accessToken: "t", fetch: f }, [acct], "2026-10-01", "2026-10-01"), (e: unknown) => e instanceof TiktokApiError && e.needsReauth);
  assert.equal(n, 1);
});

test("retries rate limits, then succeeds", async () => {
  let n = 0;
  const f = (async (url: string) => {
    if (url.includes("campaign/get")) return ok({ list: [], page_info: { total_page: 1 } });
    return n++ < 1 ? bad(40100, "Too many requests", 429) : ok({ list: [], page_info: { total_page: 1 } });
  }) as unknown as typeof fetch;
  const ds = await fetchTiktokDataset({ accessToken: "t", fetch: f, maxRetries: 2 }, [acct], "2026-10-01", "2026-10-01");
  assert.equal(ds.insights.length, 0);
  assert.equal(n, 2);
});

test("purchase value: the value field wins, else ROAS x spend, else nothing", () => {
  assert.equal(purchaseValue({ total_complete_payment_rate: "150" }, 10), 150);
  assert.equal(purchaseValue({ complete_payment_roas: "3.5" }, 10), 35);
  assert.equal(purchaseValue({}, 10), 0);
  assert.equal(purchaseValue({ total_complete_payment_rate: "abc" }, 10), 0);
});
