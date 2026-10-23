import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPushedOrder, mapPushedProduct, newPairingCode, normalizePairingCode, normalizeStoreUrl, parseWooPush, signWooBody, verifyWooSignature } from "./woocommerce";

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
  for (const status of ["cancelled", "refunded", "failed", "pending", "trash", "checkout-draft"]) assert.deepEqual(mapPushedOrder(order({ status })), { remove: "woo:101", reason: status });
  assert.deepEqual(mapPushedOrder(order({ refunded: 130 })), { remove: "woo:101", reason: "no revenue" }, "fully refunded");
  assert.deepEqual(mapPushedOrder(order({ total: 5, tax: 9 })), { remove: "woo:101", reason: "no revenue" }, "never negative revenue");
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
  assert.deepEqual(batch.type === "orders" && batch.removed, [{ id: "woo:2", reason: "cancelled" }], "skipped orders are listed with their status");
  assert.equal(parseWooPush({ type: "orders", orders: [] }), null);
  assert.equal(parseWooPush({ type: "orders", orders: Array.from({ length: 101 }, (_, i) => order({ id: i + 1 })) }), null);
  assert.equal(parseWooPush({ type: "orders", orders: [order(), { id: "bad" }] }), null, "one bad order rejects the whole push");
  for (const junk of [null, "x", 5, {}, { type: "delete_everything" }, { type: "order" }]) assert.equal(parseWooPush(junk), null);
});

test("products: only real products pass, trashed ones are removals, numbers are clamped", () => {
  const ok = mapPushedProduct({ id: 12, name: "  Lampka  ", sku: "L-1", price: "49.90", status: "publish", stock_status: "instock", stock_quantity: 4, type: "simple", total_sales: 3, image: "https://rimfya.pl/wp-content/uploads/lamp.jpg" });
  assert.ok(ok && "keep" in ok); if (!ok || !("keep" in ok)) return;
  assert.deepEqual(ok.keep, { externalId: "12", name: "Lampka", sku: "L-1", price: 49.9, status: "publish", stockStatus: "instock", stockQty: 4, productType: "simple", totalSales: 3, imageUrl: "https://rimfya.pl/wp-content/uploads/lamp.jpg" });
  assert.deepEqual(mapPushedProduct({ id: 5, name: "x", status: "trash" }), { remove: "5" });
  assert.equal(mapPushedProduct({ id: 0, name: "x" }), null); assert.equal(mapPushedProduct({ id: 3, name: "" }), null); assert.equal(mapPushedProduct("nope"), null);
  const odd = mapPushedProduct({ id: 7, name: "n", price: "", total_sales: -4 });
  assert.ok(odd && "keep" in odd && odd.keep.price === null && odd.keep.totalSales === 0);
});

test("a products push is parsed, and an empty or oversized one is refused", () => {
  const p = parseWooPush({ type: "products", products: [{ id: 1, name: "A" }, { id: 2, name: "B", status: "trash" }] });
  assert.ok(p && p.type === "products"); if (!p || p.type !== "products") return;
  assert.deepEqual([p.products.length, p.remove], [1, ["2"]]);
  assert.equal(parseWooPush({ type: "products", products: [] }), null);
  assert.equal(parseWooPush({ type: "products", products: Array.from({ length: 201 }, (_, i) => ({ id: i + 1, name: "x" })) }), null);
});

test("order lines come with a counted order: per-unit price before tax, bad lines dropped", () => {
  const m = mapPushedOrder({ id: 9, status: "completed", created_gmt: "2026-10-01T10:00:00Z", total: 120, tax: 20, items: [{ id: 1, product_id: 55, name: "Lampka", qty: 2, total: 80 }, { id: 2, product_id: 0, qty: 1, total: 5 }, { id: 3, product_id: 56, qty: 0, total: 5 }] });
  assert.ok(m && "keep" in m); if (!m || !("keep" in m)) return;
  assert.deepEqual(m.lines, [{ lineKey: "woo:9:1", orderExternalId: "woo:9", productId: "55", name: "Lampka", qty: 2, unitPrice: 40 }]);
  const gone = mapPushedOrder({ id: 10, status: "cancelled", created_gmt: "2026-10-01T10:00:00Z", total: 50, items: [{ id: 1, product_id: 55, qty: 1, total: 50 }] });
  assert.ok(gone && "remove" in gone);
});

test("image addresses are accepted only as plain https URLs", async () => {
  const { safeImageUrl } = await import("./image-url");
  assert.equal(safeImageUrl("https://cdn.shop.pl/a.jpg"), "https://cdn.shop.pl/a.jpg");
  for (const bad of ["http://cdn.shop.pl/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "https://user:pw@cdn.shop.pl/a.jpg", "https://localhost/a.jpg", "not a url", 42, null, "https://x.pl/" + "a".repeat(600)]) assert.equal(safeImageUrl(bad), null, String(bad));
});
