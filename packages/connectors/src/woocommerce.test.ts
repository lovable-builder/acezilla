import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPushedOrder, newPairingCode, normalizePairingCode, normalizeStoreUrl, parseWooPush, signWooBody, verifyWooSignature } from "./woocommerce";

const order = (over: Record<string, unknown> = {}) => ({
  id: 101, status: "completed", created_gmt: "2026-10-01T10:00:00+00:00", total: 130, tax: 20, shipping: 9, shipping_tax: 1, refunded: 0, currency: "EUR", customer_id: 0,
  email_hash: "a".repeat(64), utm: { source: "facebook", campaign: "autumn", evil: "x" }, click_ids: { fbclid: "IwAR123", other: "nope" }, ...over,
});

test("normalizes store addresses and only accepts https", () => {
  assert.equal(normalizeStoreUrl("shop.example.com/"), "https://shop.example.com");
  assert.equal(normalizeStoreUrl(" https://Shop.Example.com/blog/ "), "https://shop.example.com/blog");
  assert.equal(normalizeStoreUrl("https://shop.example.com/?x=1#y"), "https://shop.example.com");
  assert.throws(() => normalizeStoreUrl("http://shop.example.com"), /https/);
  assert.throws(() => normalizeStoreUrl("localhost"), /web address/);
  assert.throws(() => normalizeStoreUrl("   "), /Enter/);
  assert.equal(normalizeStoreUrl("http://127.0.0.1:9400", { allowLocalHttp: true }), "http://127.0.0.1:9400");
  assert.throws(() => normalizeStoreUrl("http://127.0.0.1:9400"), /https/, "off by default");
  assert.throws(() => normalizeStoreUrl("http://shop.example.com", { allowLocalHttp: true }), /https/, "only localhost");
  assert.throws(() => normalizeStoreUrl("http://169.254.169.254", { allowLocalHttp: true }), /https/, "not other internal addresses");
});

test("pairing codes have a fixed shape, never repeat, and tolerate how people type them", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) { const c = newPairingCode(); assert.match(c, /^AZ-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.ok(!/[01OIL]/.test(c.slice(3))); seen.add(c); }
  assert.equal(seen.size, 200);
  const c = newPairingCode();
  assert.equal(normalizePairingCode(c.toLowerCase().replace(/-/g, " ")), c);
  assert.equal(normalizePairingCode(`  ${c}  `), c);
  for (const bad of ["", "AZ-1111-1111-1111", "XX-ABCD-EFGH-JKMN", "AZ-ABCD-EFGH", 5, null, "AZ-ABCD-EFGH-JKMN-PQRS"]) assert.equal(normalizePairingCode(bad), null);
});

test("signature accepts a fresh correctly signed body and rejects everything else", () => {
  const secret = "s3cret", body = '{"type":"ping"}', now = 1_800_000_000_000, ts = String(now / 1000);
  const sig = signWooBody(secret, ts, body);
  assert.ok(verifyWooSignature({ secret, timestamp: ts, body, signature: sig, nowMs: now }));
  assert.ok(!verifyWooSignature({ secret, timestamp: ts, body: body + " ", signature: sig, nowMs: now }), "tampered body");
  assert.ok(!verifyWooSignature({ secret: "other", timestamp: ts, body, signature: sig, nowMs: now }), "wrong secret");
  assert.ok(!verifyWooSignature({ secret, timestamp: String(now / 1000 - 301), body, signature: signWooBody(secret, String(now / 1000 - 301), body), nowMs: now }), "too old");
  assert.ok(!verifyWooSignature({ secret, timestamp: String(now / 1000 + 301), body, signature: signWooBody(secret, String(now / 1000 + 301), body), nowMs: now }), "from the future");
  assert.ok(verifyWooSignature({ secret, timestamp: String(now / 1000 - 299), body, signature: signWooBody(secret, String(now / 1000 - 299), body), nowMs: now }));
  for (const [t, s] of [[null, sig], [ts, null], ["abc", sig], [ts, "sha256=" + "0".repeat(64)], [ts, sig.slice(0, -1)], [ts, ""]] as const) assert.ok(!verifyWooSignature({ secret, timestamp: t, body, signature: s, nowMs: now }));
});

test("revenue excludes tax, shipping and refunds; only known tags are kept; the customer is a hash", () => {
  const m = mapPushedOrder(order({ refunded: 20 }));
  assert.ok(m && "keep" in m);
  assert.equal(m.keep.revenue, 80); // 130 - 20 - 9 - 1 - 20
  assert.equal(m.keep.externalId, "woo:101"); assert.equal(m.keep.createdAt, "2026-10-01T10:00:00.000Z");
  assert.deepEqual(m.keep.utm, { source: "facebook", campaign: "autumn" });
  assert.deepEqual(m.keep.clickIds, { fbclid: "IwAR123" });
  assert.match(m.keep.customerId, /^woo:h[0-9a-f]{16}$/);
  const reg = mapPushedOrder(order({ customer_id: 7 })); assert.ok(reg && "keep" in reg && reg.keep.customerId === "woo:c7");
  const anon = mapPushedOrder(order({ email_hash: "" })); assert.ok(anon && "keep" in anon && anon.keep.customerId === "");
  const raw = mapPushedOrder(order({ email_hash: "jane@example.com" })); assert.ok(raw && "keep" in raw && raw.keep.customerId === "", "an unhashed email is never trusted or stored");
});

test("orders that do not count are marked for removal; malformed ones are rejected", () => {
  for (const status of ["cancelled", "refunded", "failed", "pending", "trash", "checkout-draft"]) assert.deepEqual(mapPushedOrder(order({ status })), { remove: "woo:101" });
  assert.deepEqual(mapPushedOrder(order({ refunded: 130 })), { remove: "woo:101" }, "fully refunded");
  assert.deepEqual(mapPushedOrder(order({ total: 5, tax: 9 })), { remove: "woo:101" }, "never negative revenue");
  for (const bad of [null, "x", {}, order({ id: "101" }), order({ id: -1 }), order({ id: 1.5 }), order({ created_gmt: "nonsense" }), order({ created_gmt: undefined })]) assert.equal(mapPushedOrder(bad), null);
});

test("parses pings, single and batched orders, disconnects, and refuses junk", () => {
  const ping = parseWooPush({ type: "ping", info: { currency: "USD", site_name: "My Shop", plugin_version: "1.0.0", wc_version: "9.4.0", wp_version: "6.7", attribution: true, extra: "ignored" } });
  assert.deepEqual(ping, { type: "ping", info: { currency: "USD", siteName: "My Shop", pluginVersion: "1.0.0", wooVersion: "9.4.0", wpVersion: "6.7", attribution: true } });
  assert.deepEqual(parseWooPush({ type: "ping" }), { type: "ping", info: { currency: null, siteName: null, pluginVersion: null, wooVersion: null, wpVersion: null, attribution: null } });
  assert.deepEqual(parseWooPush({ type: "disconnect" }), { type: "disconnect" });
  const one = parseWooPush({ type: "order", order: order() });
  assert.ok(one && one.type === "orders" && one.orders.length === 1 && one.remove.length === 0 && one.currency === "EUR");
  const batch = parseWooPush({ type: "orders", orders: [order({ id: 1 }), order({ id: 2, status: "cancelled" }), order({ id: 3 })] });
  assert.ok(batch && batch.type === "orders" && batch.orders.length === 2 && batch.remove[0] === "woo:2");
  assert.equal(parseWooPush({ type: "orders", orders: [] }), null);
  assert.equal(parseWooPush({ type: "orders", orders: Array.from({ length: 101 }, (_, i) => order({ id: i + 1 })) }), null);
  assert.equal(parseWooPush({ type: "orders", orders: [order(), { id: "bad" }] }), null, "one bad order rejects the whole push");
  for (const junk of [null, "x", 5, {}, { type: "delete_everything" }, { type: "order" }]) assert.equal(parseWooPush(junk), null);
});
