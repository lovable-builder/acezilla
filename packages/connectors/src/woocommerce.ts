import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Dataset } from "./dataset";

/**
 * WooCommerce connects through the acezilla plugin installed on the store. The plugin pairs with a one-time code,
 * then pushes each order to us, signed with a secret only the store and acezilla know. We never get a key to the store.
 */
type Order = Dataset["orders"][number];

/** Statuses that count as revenue. Everything else (pending, cancelled, failed, refunded, draft) does not. */
export const COUNTED_STATUSES = ["completed", "processing", "on-hold"];
export const WOO_ID_PREFIX = "woo:";
export const SIGNATURE_MAX_SKEW_S = 300;
export const MAX_ORDERS_PER_PUSH = 100;
const CLICK_IDS = ["gclid", "wbraid", "gbraid", "fbclid", "ttclid", "msclkid"];
const UTM_KEYS = ["source", "medium", "campaign", "content", "term"];

/** Reduces an address to the store's origin. Only https is accepted (plain http on localhost only when `allowLocalHttp` is set, for development). */
export function normalizeStoreUrl(input: string, o: { allowLocalHttp?: boolean } = {}): string {
  let raw = input.trim();
  if (!raw) throw new Error("Enter your store address");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("That does not look like a web address"); }
  const local = !!o.allowLocalHttp && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !local) throw new Error("Your store must use https:// so order data is protected in transit");
  if (!local && !u.hostname.includes(".")) throw new Error("That does not look like a web address");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

// ---- pairing code: shown once in acezilla, typed into the plugin ----
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O, 1/I/L, U
export function newPairingCode(): string {
  const c = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `AZ-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
/** Accepts the code however it was typed (case, spaces, dashes). Returns the canonical form, or null. */
export function normalizePairingCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^AZ[A-Z0-9]{12}$/.test(s) || ![...s.slice(2)].every((ch) => ALPHABET.includes(ch))) return null;
  return `AZ-${s.slice(2, 6)}-${s.slice(6, 10)}-${s.slice(10)}`;
}

// ---- request signing ----
export const signWooBody = (secret: string, timestamp: string, body: string) => `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

/** True only for a fresh request signed with this secret. Compares in constant time. */
export function verifyWooSignature(o: { secret: string; timestamp: string | null; body: string; signature: string | null; nowMs?: number }): boolean {
  if (!o.timestamp || !o.signature || !/^\d{9,12}$/.test(o.timestamp)) return false;
  const skew = Math.abs((o.nowMs ?? Date.now()) / 1000 - Number(o.timestamp));
  if (skew > SIGNATURE_MAX_SKEW_S) return false;
  const want = Buffer.from(signWooBody(o.secret, o.timestamp, o.body)), got = Buffer.from(o.signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ---- what the plugin sends ----
export interface WooInfo { currency: string | null; siteName: string | null; pluginVersion: string | null; wooVersion: string | null; wpVersion: string | null; attribution: boolean | null }
export type WooPush =
  | { type: "ping"; info: WooInfo }
  | { type: "orders"; orders: Order[]; remove: string[]; currency: string | null }
  | { type: "disconnect" };

const num = (v: unknown) => { const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN; return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const pick = (o: unknown, keys: string[]) => {
  const out: Record<string, string> = {};
  if (o && typeof o === "object") for (const k of keys) { const v = str((o as Record<string, unknown>)[k]); if (v) out[k] = v; }
  return out;
};

/** One order from the plugin. Revenue is total minus tax, shipping and refunds, so it is comparable to ad-platform revenue. */
export function mapPushedOrder(raw: unknown): { keep: Order } | { remove: string } | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.id !== "number" || !Number.isInteger(o.id) || o.id <= 0) return null;
  const t = typeof o.created_gmt === "string" ? new Date(o.created_gmt) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const externalId = `${WOO_ID_PREFIX}${o.id}`;
  const revenue = Math.max(0, round2(num(o.total) - num(o.tax) - num(o.shipping) - num(o.shipping_tax) - Math.abs(num(o.refunded))));
  if (!COUNTED_STATUSES.includes(String(o.status)) || revenue <= 0) return { remove: externalId };
  const cid = typeof o.customer_id === "number" ? o.customer_id : 0;
  const hash = typeof o.email_hash === "string" && /^[0-9a-f]{64}$/.test(o.email_hash) ? o.email_hash : null;
  const customerId = cid > 0 ? `${WOO_ID_PREFIX}c${cid}` : hash ? `${WOO_ID_PREFIX}h${createHash("sha256").update(hash).digest("hex").slice(0, 16)}` : "";
  return { keep: { externalId, createdAt: t.toISOString(), revenue, customerId, utm: pick(o.utm, UTM_KEYS), clickIds: pick(o.click_ids, CLICK_IDS) } };
}

/** Validates a signed request body. Returns null if it is not something the plugin would send. */
export function parseWooPush(body: unknown): WooPush | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return null;
  if (b.type === "disconnect") return { type: "disconnect" };
  if (b.type === "ping") {
    const i = (b.info ?? {}) as Record<string, unknown>;
    return { type: "ping", info: { currency: str(i.currency, 8), siteName: str(i.site_name, 120), pluginVersion: str(i.plugin_version, 20), wooVersion: str(i.wc_version, 20), wpVersion: str(i.wp_version, 20), attribution: typeof i.attribution === "boolean" ? i.attribution : null } };
  }
  if (b.type === "order" || b.type === "orders") {
    const list = b.type === "order" ? [b.order] : b.orders;
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ORDERS_PER_PUSH) return null;
    const mapped = list.map(mapPushedOrder);
    if (mapped.some((m) => m === null)) return null;
    const first = list[0] as Record<string, unknown> | undefined;
    return {
      type: "orders",
      orders: mapped.flatMap((m) => (m && "keep" in m ? [m.keep] : [])),
      remove: mapped.flatMap((m) => (m && "remove" in m ? [m.remove] : [])),
      currency: str(first?.currency, 8),
    };
  }
  return null;
}
