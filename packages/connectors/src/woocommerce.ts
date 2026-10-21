import { createHash } from "node:crypto";
import type { Dataset } from "./dataset";

/** WooCommerce keys are issued per store: the URL, a consumer key and a consumer secret, all read-only. */
export interface WooCreds { storeUrl: string; key: string; secret: string; fetch?: typeof fetch }
type Order = Dataset["orders"][number];

export class WooApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Statuses that count as revenue. Everything else (pending, cancelled, failed, refunded, draft) does not. */
export const COUNTED_STATUSES = ["completed", "processing", "on-hold"];
export const WOO_ID_PREFIX = "woo:";
const CLICK_IDS = ["gclid", "wbraid", "gbraid", "fbclid", "ttclid", "msclkid"];
const MAX_PAGES = 50, PER_PAGE = 100;

/** Reduces whatever the user typed to the store's origin. Only https is accepted: the keys would otherwise travel in clear text. */
export function normalizeStoreUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new Error("Enter your store address");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("That does not look like a web address"); }
  if (u.protocol !== "https:") throw new Error("Your store must use https:// so the keys are protected in transit");
  if (!u.hostname.includes(".")) throw new Error("That does not look like a web address");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

/** WooCommerce's built-in approval screen: the owner signs in to their own store and approves read access. */
export function wooAuthUrl(o: { storeUrl: string; appName: string; userId: string; returnUrl: string; callbackUrl: string }): string {
  const q = new URLSearchParams({ app_name: o.appName, scope: "read", user_id: o.userId, return_url: o.returnUrl, callback_url: o.callbackUrl });
  return `${o.storeUrl}/wc-auth/v1/authorize?${q}`;
}

export interface WooKeyGrant { key: string; secret: string; permissions: string; userId: string }
/** Reads the body WooCommerce posts to our callback. Returns null if it is not a valid grant. */
export function parseWooGrant(body: unknown): WooKeyGrant | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return null;
  const { consumer_key: key, consumer_secret: secret, key_permissions: permissions, user_id: userId } = b;
  if (typeof key !== "string" || typeof secret !== "string" || typeof permissions !== "string" || typeof userId !== "string") return null;
  if (!/^ck_[A-Za-z0-9]+$/.test(key) || !/^cs_[A-Za-z0-9]+$/.test(secret) || userId.length < 16 || userId.length > 128) return null;
  return { key, secret, permissions, userId };
}

async function wooGet(c: WooCreds, path: string, params: Record<string, string>): Promise<{ json: unknown; totalPages: number }> {
  const f = c.fetch ?? fetch;
  const url = `${c.storeUrl}/wp-json/wc/v3/${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await f(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { accept: "application/json", authorization: `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString("base64")}` } });
  } catch (e) {
    if (e instanceof Error && /unsafe|private|internal|not allowed/i.test(e.message)) throw new WooApiError(0, e.message);
    throw new WooApiError(0, "Could not reach the store");
  }
  if (res.status >= 300 && res.status < 400) throw new WooApiError(res.status, "The store redirected the request. Reconnect using the exact address your store loads at (check www and https).");
  if (res.status === 401 || res.status === 403) throw new WooApiError(res.status, "WooCommerce refused the keys. They may have been revoked. Reconnect to create new ones.");
  if (res.status === 404) throw new WooApiError(404, "The WooCommerce REST API was not found at this address. Check the store address and that permalinks are not set to Plain.");
  if (!res.ok) throw new WooApiError(res.status, `WooCommerce answered with HTTP ${res.status}`);
  let json: unknown;
  try { json = await res.json(); } catch { throw new WooApiError(res.status, "The store did not return JSON. A security plugin or cache may be blocking the API."); }
  return { json, totalPages: Number(res.headers.get("x-wp-totalpages") ?? 1) || 1 };
}

/** Confirms the keys work, without reading any customer data. */
export async function checkWooConnection(c: WooCreds): Promise<void> {
  await wooGet(c, "orders", { per_page: "1", _fields: "id" });
}

const num = (v: unknown) => { const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN; return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const metaMap = (meta: unknown) => new Map((Array.isArray(meta) ? meta : []).filter((m): m is { key: string; value: unknown } => !!m && typeof (m as { key?: unknown }).key === "string").map((m) => [m.key, m.value]));

interface RawOrder {
  id?: number; status?: string; date_created_gmt?: string; date_created?: string; total?: string; total_tax?: string; shipping_total?: string; shipping_tax?: string;
  customer_id?: number; billing?: { email?: string }; refunds?: { total?: string }[]; meta_data?: unknown;
}

/** Maps one WooCommerce order. Revenue is the order total minus tax, shipping and refunds, so it is comparable to ad-platform revenue. */
export function mapWooOrder(o: RawOrder): Order | null {
  if (typeof o.id !== "number") return null;
  const created = o.date_created_gmt ? `${o.date_created_gmt}Z` : o.date_created;
  const t = created ? new Date(created) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const refunds = (o.refunds ?? []).reduce((a, r) => a + num(r.total), 0); // refund totals are negative
  const revenue = Math.max(0, round2(num(o.total) - num(o.total_tax) - num(o.shipping_total) - num(o.shipping_tax) + refunds));
  const m = metaMap(o.meta_data);
  const attr = (k: string) => { const v = m.get(`_wc_order_attribution_${k}`); return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null; };
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) { const v = attr(k); if (v) utm[k.replace("utm_", "")] = v; }
  const clickIds: Record<string, string> = {};
  const entry = attr("session_entry");
  if (entry) { try { const q = new URL(entry).searchParams; for (const id of CLICK_IDS) { const v = q.get(id); if (v) clickIds[id] = v.slice(0, 200); } } catch { /* ignore */ } }
  const email = o.billing?.email?.trim().toLowerCase();
  const customerId = o.customer_id && o.customer_id > 0 ? `${WOO_ID_PREFIX}c${o.customer_id}` : email ? `${WOO_ID_PREFIX}h${createHash("sha256").update(email).digest("hex").slice(0, 16)}` : "";
  return { externalId: `${WOO_ID_PREFIX}${o.id}`, createdAt: t.toISOString(), revenue, customerId, utm, clickIds };
}

export interface WooOrders {
  /** Orders that count as revenue. */ orders: Order[];
  /** Orders seen that no longer count (cancelled, fully refunded, failed): remove them if stored earlier. */ uncounted: string[];
  /** True when the page cap was reached, so older orders were left for the next sync. */ truncated: boolean;
}

/** Orders created or changed since `since` (YYYY-MM-DD). Using the modified date picks up refunds and cancellations too. */
export async function fetchWooOrders(c: WooCreds, since: string): Promise<WooOrders> {
  const out: WooOrders = { orders: [], uncounted: [], truncated: false };
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { json, totalPages } = await wooGet(c, "orders", {
      modified_after: `${since}T00:00:00`, dates_are_gmt: "true", status: "any", orderby: "id", order: "desc", per_page: String(PER_PAGE), page: String(page),
      _fields: "id,status,date_created_gmt,date_created,total,total_tax,shipping_total,shipping_tax,customer_id,billing,refunds,meta_data",
    });
    if (!Array.isArray(json)) throw new WooApiError(200, "Unexpected answer from the store");
    for (const raw of json as RawOrder[]) {
      const mapped = mapWooOrder(raw);
      if (!mapped) continue;
      if (COUNTED_STATUSES.includes(raw.status ?? "") && mapped.revenue > 0) out.orders.push(mapped); else out.uncounted.push(mapped.externalId);
    }
    if (page >= totalPages) return out;
  }
  out.truncated = true;
  return out;
}
