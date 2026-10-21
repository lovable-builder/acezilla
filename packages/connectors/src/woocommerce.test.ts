import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWooConnection, fetchWooOrders, mapWooOrder, normalizeStoreUrl, parseWooGrant, WooApiError, wooAuthUrl } from "./woocommerce";

const creds = (f: typeof fetch) => ({ storeUrl: "https://shop.example.com", key: "ck_abc", secret: "cs_def", fetch: f });
const order = (over: Record<string, unknown> = {}) => ({
  id: 101, status: "completed", date_created_gmt: "2026-10-01T10:00:00", total: "130.00", total_tax: "20.00", shipping_total: "9.00", shipping_tax: "1.00", customer_id: 0,
  billing: { email: "Jane@Example.com " }, refunds: [], meta_data: [
    { key: "_wc_order_attribution_utm_source", value: "facebook" }, { key: "_wc_order_attribution_utm_campaign", value: "autumn" },
    { key: "_wc_order_attribution_session_entry", value: "https://shop.example.com/?utm_source=facebook&fbclid=IwAR123&gclid=" }, { key: "other", value: 1 },
  ], ...over,
});
const json = (body: unknown, headers: Record<string, string> = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("normalizes store addresses and only accepts https", () => {
  assert.equal(normalizeStoreUrl("shop.example.com/"), "https://shop.example.com");
  assert.equal(normalizeStoreUrl(" https://Shop.Example.com/blog/ "), "https://shop.example.com/blog");
  assert.equal(normalizeStoreUrl("https://shop.example.com/?x=1#y"), "https://shop.example.com");
  assert.throws(() => normalizeStoreUrl("http://shop.example.com"), /https/);
  assert.throws(() => normalizeStoreUrl("localhost"), /web address/);
  assert.throws(() => normalizeStoreUrl("   "), /Enter/);
  assert.throws(() => normalizeStoreUrl("ftp://shop.example.com"), /https/);
});

test("builds the WooCommerce approval link with read-only scope", () => {
  const u = new URL(wooAuthUrl({ storeUrl: "https://shop.example.com", appName: "acezilla", userId: "n".repeat(32), returnUrl: "https://app.test/connections", callbackUrl: "https://app.test/api/connect/woocommerce/callback" }));
  assert.equal(u.origin + u.pathname, "https://shop.example.com/wc-auth/v1/authorize");
  assert.equal(u.searchParams.get("scope"), "read");
  assert.equal(u.searchParams.get("callback_url"), "https://app.test/api/connect/woocommerce/callback");
});

test("accepts only well-formed key grants", () => {
  const ok = { key_id: 1, user_id: "n".repeat(32), consumer_key: "ck_abc123", consumer_secret: "cs_def456", key_permissions: "read" };
  assert.deepEqual(parseWooGrant(ok), { key: "ck_abc123", secret: "cs_def456", permissions: "read", userId: "n".repeat(32) });
  for (const bad of [null, "x", {}, { ...ok, consumer_key: "abc" }, { ...ok, consumer_secret: 5 }, { ...ok, user_id: "short" }, { ...ok, key_permissions: undefined }]) assert.equal(parseWooGrant(bad), null);
});

test("revenue excludes tax and shipping and subtracts refunds; attribution and hashed customer are captured", () => {
  const m = mapWooOrder(order({ refunds: [{ total: "-20.00" }] }))!;
  assert.equal(m.revenue, 80); // 130 - 20 tax - 9 shipping - 1 shipping tax - 20 refund
  assert.equal(m.externalId, "woo:101"); assert.equal(m.createdAt, "2026-10-01T10:00:00.000Z");
  assert.deepEqual(m.utm, { source: "facebook", campaign: "autumn" });
  assert.deepEqual(m.clickIds, { fbclid: "IwAR123" });
  assert.match(m.customerId, /^woo:h[0-9a-f]{16}$/);
  assert.ok(!JSON.stringify(m).includes("jane@example.com"), "no raw email is kept");
  assert.equal(mapWooOrder(order({ billing: { email: "JANE@example.com" } }))!.customerId, m.customerId, "same person, same id");
  assert.equal(mapWooOrder(order({ customer_id: 7 }))!.customerId, "woo:c7");
  assert.equal(mapWooOrder(order({ total: "5", total_tax: "9" }))!.revenue, 0, "never negative");
  assert.equal(mapWooOrder({ id: 1 }), null);
  assert.equal(mapWooOrder({ date_created_gmt: "2026-10-01T10:00:00" }), null);
});

test("fetches every page, counts only revenue statuses, and lists the rest for removal", async () => {
  const calls: { url: string; auth: string | null }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    const page = Number(new URL(url).searchParams.get("page"));
    return page === 1
      ? json([order({ id: 1 }), order({ id: 2, status: "cancelled" })], { "x-wp-totalpages": "2" })
      : json([order({ id: 3, status: "processing" }), order({ id: 4, status: "refunded", total: "0.00", total_tax: "0", shipping_total: "0", shipping_tax: "0" })], { "x-wp-totalpages": "2" });
  }) as unknown as typeof fetch;
  const r = await fetchWooOrders(creds(f), "2026-09-01");
  assert.deepEqual(r.orders.map((o) => o.externalId), ["woo:1", "woo:3"]);
  assert.deepEqual(r.uncounted, ["woo:2", "woo:4"]);
  assert.equal(r.truncated, false); assert.equal(calls.length, 2);
  assert.equal(calls[0]!.auth, `Basic ${Buffer.from("ck_abc:cs_def").toString("base64")}`);
  const q = new URL(calls[0]!.url).searchParams;
  assert.equal(q.get("modified_after"), "2026-09-01T00:00:00"); assert.equal(q.get("status"), "any");
  assert.ok(calls[0]!.url.startsWith("https://shop.example.com/wp-json/wc/v3/orders?"));
});

test("stops at the page cap and says so", async () => {
  let n = 0;
  const f = (async () => { n++; return json([order({ id: n })], { "x-wp-totalpages": "999" }); }) as unknown as typeof fetch;
  const r = await fetchWooOrders(creds(f), "2026-09-01");
  assert.equal(r.truncated, true); assert.equal(n, 50);
});

test("gives clear errors for revoked keys, missing API, redirects, non-JSON and network failure", async () => {
  const err = async (res: () => Response | Promise<Response>) => checkWooConnection(creds((async () => res()) as unknown as typeof fetch)).then(() => null, (e: unknown) => e as WooApiError);
  const a = await err(() => json({ code: "woocommerce_rest_cannot_view" }, {}, 401));
  assert.ok(a instanceof WooApiError && a.status === 401 && /revoked/.test(a.message));
  assert.match((await err(() => json({}, {}, 404)))!.message, /REST API was not found/);
  assert.match((await err(() => new Response("", { status: 301, headers: { location: "https://www.shop.example.com" } })))!.message, /redirected/);
  assert.match((await err(() => new Response("<html>blocked</html>", { status: 200 })))!.message, /JSON/);
  assert.match((await err(() => json({}, {}, 500)))!.message, /HTTP 500/);
  const net = await checkWooConnection(creds((async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch)).then(() => null, (e: unknown) => e as WooApiError);
  assert.equal(net!.message, "Could not reach the store");
  assert.equal(await checkWooConnection(creds((async () => json([])) as unknown as typeof fetch)), undefined);
});

test("a guarded fetch that refuses an unsafe address is reported, not retried", async () => {
  const e = await checkWooConnection(creds((async () => { throw new Error("That host resolves to a private or internal address"); }) as unknown as typeof fetch)).then(() => null, (x: unknown) => x as WooApiError);
  assert.match(e!.message, /private or internal/);
});
