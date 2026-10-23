import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allegroAuthUrl, allegroGet, AllegroApiError, buildAllegroDataset, chargesAreNegative, classifyFee, decodeAllegroJwt, exchangeAllegroCode, loadAllegroFees,
  loadAllegroOffers, loadAllegroSales, refreshAllegroToken, salesToOrders, signAllegroState, summarizeFees, verifyAllegroState, ALLEGRO_SCOPES, type FeeEntry,
} from "./allegro";

const json = (b: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...h } });
const NOW = new Date("2026-10-21T12:00:00Z");
const ctx = (f: typeof fetch) => ({ accessToken: "tok", fetch: f, sleep: async () => {} });
const form = (id: string, items: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({ id, buyer: { id: "b-1" }, updatedAt: "2026-10-20T10:00:00Z", lineItems: items, ...extra });
const li = (offer: string, qty: number, price: string, boughtAt = "2026-10-20T10:00:00Z") => ({ offer: { id: offer, name: `Name ${offer}` }, quantity: qty, price: { amount: price, currency: "PLN" }, boughtAt });

test("authorize URL carries the read scopes and the state, and sandbox switches host", () => {
  const u = new URL(allegroAuthUrl({ clientId: "cid", redirectUri: "https://app.test/cb", state: "S" }));
  assert.equal(u.origin + u.pathname, "https://allegro.pl/auth/oauth/authorize");
  assert.equal(u.searchParams.get("scope"), ALLEGRO_SCOPES.join(" ")); assert.equal(u.searchParams.get("state"), "S"); assert.equal(u.searchParams.get("redirect_uri"), "https://app.test/cb");
  assert.ok(ALLEGRO_SCOPES.every((s) => /read$|ratings$/.test(s)), "read-only scopes");
  assert.match(allegroAuthUrl({ clientId: "c", redirectUri: "r", state: "s", sandbox: true }), /allegrosandbox/);
});

test("signed state binds user and workspace, expires, and rejects tampering", () => {
  const st = signAllegroState("secret", "user-1", "ws-1", 1_000_000);
  assert.deepEqual(verifyAllegroState("secret", st, "user-1", 1_000_000 + 60_000), { ok: true, workspaceId: "ws-1" });
  assert.equal(verifyAllegroState("secret", st, "user-2", 1_000_000).ok, false, "other user");
  assert.equal(verifyAllegroState("other", st, "user-1", 1_000_000).ok, false, "wrong secret");
  assert.equal(verifyAllegroState("secret", st, "user-1", 1_000_000 + 11 * 60_000).ok, false, "older than 10 minutes");
  assert.equal(verifyAllegroState("secret", st.slice(0, -1) + (st.endsWith("a") ? "b" : "a"), "user-1", 1_000_000).ok, false, "one character changed");
  assert.equal(verifyAllegroState("secret", st.replace("ws-1", "ws-2"), "user-1", 1_000_000).ok, false, "workspace swapped");
  for (const bad of [null, "", "x", "a.b.c"]) assert.equal(verifyAllegroState("secret", bad, "user-1").ok, false);
  assert.notEqual(signAllegroState("secret", "user-1", "ws-1", 1), signAllegroState("secret", "user-1", "ws-1", 1), "every state is unique");
});

test("token exchange and refresh use Basic auth, return the rotated pair, and flag dead logins", async () => {
  const seen: { url: string; auth: string | null; body: string }[] = [];
  const f = (async (url: string, init: RequestInit) => { seen.push({ url, auth: new Headers(init.headers).get("authorization"), body: String(init.body) }); return json({ access_token: "A2", refresh_token: "R2", expires_in: 43200 }); }) as unknown as typeof fetch;
  const t = await refreshAllegroToken({ clientId: "id", clientSecret: "sec", refreshToken: "R1", fetch: f });
  assert.deepEqual(t, { accessToken: "A2", refreshToken: "R2", expiresInSec: 43200 });
  assert.equal(seen[0]!.auth, `Basic ${Buffer.from("id:sec").toString("base64")}`);
  assert.match(seen[0]!.body, /grant_type=refresh_token/); assert.match(seen[0]!.body, /refresh_token=R1/);
  await exchangeAllegroCode({ clientId: "id", clientSecret: "sec", code: "C", redirectUri: "https://app.test/cb", fetch: f });
  assert.match(seen[1]!.body, /grant_type=authorization_code/); assert.match(seen[1]!.body, /code=C/);
  const dead = (async () => json({ error: "invalid_grant" }, 400)) as unknown as typeof fetch;
  const e = await refreshAllegroToken({ clientId: "i", clientSecret: "s", refreshToken: "x", fetch: dead }).catch((x) => x as AllegroApiError);
  assert.ok(e instanceof AllegroApiError && e.needsReauth && !/invalid_grant/.test(e.message), "reconnect needed, raw body hidden");
  const odd = (async () => json({ nope: 1 })) as unknown as typeof fetch;
  await assert.rejects(refreshAllegroToken({ clientId: "i", clientSecret: "s", refreshToken: "x", fetch: odd }), /unexpected/);
});

test("reads the seller name from the access token without trusting it", () => {
  const jwt = (p: object) => `h.${Buffer.from(JSON.stringify(p)).toString("base64url")}.s`;
  assert.deepEqual(decodeAllegroJwt(jwt({ user_name: "shop_pl", user_id: "123" })), { userName: "shop_pl", userId: "123" });
  assert.deepEqual(decodeAllegroJwt("garbage"), { userName: null, userId: null });
});

test("API calls send the required headers, retry rate limits, and map errors to friendly messages", async () => {
  let n = 0; const slept: number[] = []; let headers: Headers | undefined;
  const f = (async (_u: string, init: RequestInit) => { headers = new Headers(init.headers); return ++n < 3 ? json({}, 429, { "retry-after": "2" }) : json({ ok: 1 }); }) as unknown as typeof fetch;
  assert.deepEqual(await allegroGet({ accessToken: "T", fetch: f, sleep: async (ms) => { slept.push(ms); } }, "/x", { a: "1" }), { ok: 1 });
  assert.deepEqual(slept, [2000, 2000]); assert.equal(headers!.get("authorization"), "Bearer T"); assert.equal(headers!.get("accept"), "application/vnd.allegro.public.v1+json");
  const err = (status: number) => allegroGet(ctx((async () => json({ secret: "details" }, status)) as unknown as typeof fetch), "/x").catch((e) => e as AllegroApiError);
  assert.ok((await err(401)).needsReauth); assert.match((await err(403)).message, /Reconnect/); assert.match((await err(404)).message, /Not found/);
  assert.ok(!(await err(403)).needsReauth && !/details/.test((await err(500)).message), "no raw bodies");
});

test("loads paid orders page by page and maps each order's gross item revenue and a hashed buyer", async () => {
  const calls: URL[] = [];
  const page1 = Array.from({ length: 100 }, (_, i) => form(`o${i}`, [li("off1", 1, "10.00")]));
  const f = (async (u: string) => { calls.push(new URL(u)); return json({ checkoutForms: calls.length === 1 ? page1 : [form("last", [li("off1", 2, "25.50"), li("off2", 1, "4.00", "2026-10-21T08:00:00Z")]), form("old", [li("x", 1, "5", "2026-01-01T00:00:00Z")], { updatedAt: "2026-01-01T00:00:00Z" })] }); }) as unknown as typeof fetch;
  const { lines, truncated } = await loadAllegroSales(ctx(f), 30, NOW);
  assert.equal(truncated, false); assert.equal(calls.length, 2);
  assert.equal(calls[0]!.searchParams.get("status"), "READY_FOR_PROCESSING"); assert.equal(calls[1]!.searchParams.get("offset"), "100");
  assert.ok(!lines.some((l) => l.offerId === "x"), "items bought before the window are dropped");
  const orders = salesToOrders(lines.filter((l) => l.orderId === "last"));
  assert.equal(orders.length, 1); assert.equal(orders[0]!.externalId, "allegro:last"); assert.equal(orders[0]!.revenue, 55);
  assert.equal(orders[0]!.createdAt, "2026-10-20T10:00:00.000Z", "earliest item time");
  assert.match(orders[0]!.customerId, /^allegro:b[0-9a-f]{16}$/); assert.deepEqual(orders[0]!.utm, { source: "allegro", medium: "marketplace" });
  assert.ok(!JSON.stringify(orders).includes("b-1"), "the raw buyer id is not kept");
});

test("stops at the page cap and reports it", async () => {
  const f = (async () => json({ checkoutForms: Array.from({ length: 100 }, (_, i) => form(`o${Math.random()}${i}`, [li("a", 1, "1")])) })) as unknown as typeof fetch;
  const r = await loadAllegroSales(ctx(f), 30, NOW);
  assert.equal(r.truncated, true); assert.equal(r.lines.length, 2000);
});

test("fee types are classified; settlements are never costs; ad charges are found in Polish and English", () => {
  const cases: [string, FeeCategory][] = [
    ["Prowizja od sprzedaży", "commission"], ["Opłata za sprzedaż - commission", "commission"], ["Prowizja od oferty wyróżnionej", "commission"],
    ["Kampania reklamowa Allegro Ads", "ads"], ["Opłata za wyróżnienie oferty", "ads"], ["Sponsored offer", "ads"],
    ["Opłata za dostawę Smart", "delivery"], ["Przesyłka InPost Paczkomat", "delivery"], ["Fulfillment by Allegro", "fulfillment"],
    ["Pobranie opłat z wpływów", "settlement"], ["Wypłata środków", "settlement"], ["Abonament Standard", "other"],
  ];
  for (const [name, want] of cases) assert.equal(classifyFee("", name), want, name);
  type FeeCategory = ReturnType<typeof classifyFee>;
});

const fee = (id: string, typeName: string, amount: number, offerId: string | null = null, at = "2026-10-20T10:00:00Z"): FeeEntry => ({ id, at, typeId: "", typeName, offerId, amount, currency: "PLN" });

test("sign convention follows the real entries, and the summary lists every type without counting settlements", () => {
  const fees = [fee("1", "Prowizja od sprzedaży", -10), fee("2", "Kampania reklamowa", -5, "o1"), fee("3", "Kampania reklamowa", 1, "o1"), fee("4", "Pobranie opłat z wpływów", -16), fee("5", "Abonament", -3)];
  assert.equal(chargesAreNegative(fees), true);
  assert.equal(chargesAreNegative([fee("1", "Prowizja", 10), fee("2", "Kampania reklamowa", 5), fee("3", "Kampania reklamowa", -1)]), false);
  const s = summarizeFees(fees);
  assert.deepEqual(s.byCategory, { commission: 10, ads: 4, delivery: 0, fulfillment: 0, other: 3, settlement: 0 });
  assert.equal(s.types.find((t) => t.category === "settlement")?.total, 16, "listed so a wrong guess is visible");
  assert.equal(s.types.length, 4);
});

test("loads billing entries and offers with their counters", async () => {
  const f = (async (u: string) => u.includes("billing-entries")
    ? json({ billingEntries: [{ id: 1, occurredAt: "2026-10-20T10:00:00Z", type: { id: "SUC", name: "Prowizja" }, offer: { id: "o1" }, value: { amount: "-12.30", currency: "PLN" } }, { id: 2, occurredAt: "2026-10-20T11:00:00Z", type: { name: "Abonament" }, value: { amount: "-3", currency: "PLN" } }] })
    : json({ offers: [{ id: "o1", name: "Chair", sellingMode: { price: { amount: "99.00" } }, stats: { visitsCount: 120, watchersCount: 4 }, stock: { available: 7, unit: "UNIT" }, primaryImage: { url: "https://a.allegroimg.com/original/x" } }, { id: "o2", name: "Table", stats: {} }] })) as unknown as typeof fetch;
  const fees = await loadAllegroFees(ctx(f), 30, NOW);
  assert.deepEqual(fees.map((x) => [x.typeId, x.offerId, x.amount]), [["SUC", "o1", -12.3], ["", null, -3]]);
  const offers = await loadAllegroOffers(ctx(f));
  assert.deepEqual(offers[0], { offerId: "o1", name: "Chair", price: 99, visits: 120, watchers: 4, stock: 7, imageUrl: "https://a.allegroimg.com/original/x" });
  assert.deepEqual(offers[1], { offerId: "o2", name: "Table", price: null, visits: null, watchers: null, stock: null, imageUrl: null });
});

test("ad spend becomes daily spend per offer in the shared dataset; sales stay as orders", () => {
  const fees = [fee("1", "Kampania reklamowa", -5, "o1", "2026-10-20T08:00:00Z"), fee("2", "Kampania reklamowa", -7, "o1", "2026-10-20T20:00:00Z"), fee("3", "Kampania reklamowa", -2, "o1", "2026-10-21T01:00:00Z"), fee("4", "Kampania reklamowa", -1, null), fee("5", "Prowizja", -50, "o1")];
  const ds = buildAllegroDataset({ sellerId: "9", sellerName: "shop", currency: "PLN", fees, offers: [{ offerId: "o1", name: "Chair", price: 1, visits: null, watchers: null, stock: null, imageUrl: null }], orders: [] });
  assert.equal(ds.accounts[0]!.name, "Allegro (shop)"); assert.equal(ds.accounts[0]!.platform, "allegro");
  assert.deepEqual(ds.ads.map((a) => [a.externalId, a.name]), [["allegro-offer-o1", "Chair"], ["allegro-offer-account", "Account-level ad costs"]]);
  const day = (ad: string, d: string) => ds.insights.find((i) => i.adExternalId === ad && i.date === d)?.spend;
  assert.equal(day("allegro-offer-o1", "2026-10-20"), 12); assert.equal(day("allegro-offer-o1", "2026-10-21"), 2); assert.equal(day("allegro-offer-account", "2026-10-20"), 1);
  assert.ok(ds.insights.every((i) => i.revenue === 0 && i.clicks === 0), "no invented ad statistics");
  assert.equal(ds.insights.reduce((s, i) => s + i.spend, 0), 15, "commission is not ad spend");
});
