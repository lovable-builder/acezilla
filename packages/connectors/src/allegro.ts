import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { emptyDataset, type Dataset } from "./dataset";

/**
 * Allegro (Polish marketplace): read-only. Orders, billing entries (fees and ad costs) and offers.
 * Allegro has no public API for ad clicks or impressions, so ads are measured by spend only.
 */
export const ALLEGRO_SCOPES = [
  "allegro:api:orders:read", "allegro:api:billing:read", "allegro:api:sale:offers:read", "allegro:api:ratings", "allegro:api:payments:read",
];
/** Bump when the scope list changes: connections made with an older version must reconnect. */
export const ALLEGRO_SCOPE_VERSION = 1;
export const ALLEGRO_ID_PREFIX = "allegro:";
const ACCEPT = "application/vnd.allegro.public.v1+json";

export const allegroHosts = (sandbox = false) => sandbox
  ? { authorize: "https://allegro.pl.allegrosandbox.pl/auth/oauth/authorize", token: "https://allegro.pl.allegrosandbox.pl/auth/oauth/token", api: "https://api.allegro.pl.allegrosandbox.pl" }
  : { authorize: "https://allegro.pl/auth/oauth/authorize", token: "https://allegro.pl/auth/oauth/token", api: "https://api.allegro.pl" };

export class AllegroApiError extends Error {
  constructor(message: string, readonly status: number, /** The login is no longer valid: the seller must reconnect. */ readonly needsReauth = false) { super(message); }
}

// ---------------- login (OAuth authorization code) ----------------
export function allegroAuthUrl(o: { clientId: string; redirectUri: string; state: string; sandbox?: boolean }): string {
  const q = new URLSearchParams({ response_type: "code", client_id: o.clientId, redirect_uri: o.redirectUri, scope: ALLEGRO_SCOPES.join(" "), state: o.state });
  return `${allegroHosts(o.sandbox).authorize}?${q}`;
}

// ---- signed state: proves the callback belongs to the same user and workspace and was issued recently ----
const STATE_TTL_MS = 10 * 60_000;
const mac = (secret: string, msg: string) => createHmac("sha256", secret).update(msg).digest("hex");
export function signAllegroState(secret: string, userId: string, workspaceId: string, nowMs = Date.now()): string {
  const payload = `${userId}.${workspaceId}.${nowMs + STATE_TTL_MS}.${randomUUID()}`;
  return `${payload}.${mac(secret, payload)}`;
}
export function verifyAllegroState(secret: string, state: string | null, userId: string, nowMs = Date.now()): { ok: true; workspaceId: string } | { ok: false } {
  if (!state) return { ok: false };
  const cut = state.lastIndexOf(".");
  if (cut < 0) return { ok: false };
  const payload = state.slice(0, cut), got = Buffer.from(state.slice(cut + 1)), want = Buffer.from(mac(secret, payload));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false };
  const [uid, ws, exp] = payload.split(".");
  return uid === userId && ws && Number(exp) > nowMs ? { ok: true, workspaceId: ws } : { ok: false };
}

export interface AllegroTokens { accessToken: string; refreshToken: string; expiresInSec: number }
interface TokenCtx { clientId: string; clientSecret: string; sandbox?: boolean; fetch?: typeof fetch }

async function tokenRequest(c: TokenCtx, body: Record<string, string>): Promise<AllegroTokens> {
  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
  const res = await (c.fetch ?? fetch)(allegroHosts(c.sandbox).token, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  if (!res.ok) throw new AllegroApiError(res.status === 400 || res.status === 401 ? "Allegro rejected the login" : `Allegro token request failed (HTTP ${res.status})`, res.status, res.status === 400 || res.status === 401);
  const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number } | null;
  if (!j?.access_token || !j.refresh_token || !j.expires_in) throw new AllegroApiError("Allegro returned an unexpected token response", 502);
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresInSec: j.expires_in };
}
export const exchangeAllegroCode = (c: TokenCtx & { code: string; redirectUri: string }) => tokenRequest(c, { grant_type: "authorization_code", code: c.code, redirect_uri: c.redirectUri });
/** Every refresh returns a NEW refresh token and invalidates the old one: always store the new pair. */
export const refreshAllegroToken = (c: TokenCtx & { refreshToken: string }) => tokenRequest(c, { grant_type: "refresh_token", refresh_token: c.refreshToken });

/** Allegro access tokens are JWTs; the payload names the seller. Read for display only, never trusted for access decisions. */
export function decodeAllegroJwt(accessToken: string): { userName: string | null; userId: string | null } {
  try {
    const p = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    return { userName: typeof p.user_name === "string" ? p.user_name : null, userId: typeof p.user_id === "string" ? p.user_id : null };
  } catch { return { userName: null, userId: null }; }
}

// ---------------- API calls ----------------
export interface AllegroCtx { accessToken: string; sandbox?: boolean; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET with the headers Allegro requires. Retries rate limits (429) and server errors a few times; raw bodies never reach the caller. */
export async function allegroGet(c: AllegroCtx, path: string, params: Record<string, string> = {}): Promise<any> {
  const url = `${allegroHosts(c.sandbox).api}${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    const res = await (c.fetch ?? fetch)(url, { headers: { Authorization: `Bearer ${c.accessToken}`, Accept: ACCEPT } });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const ra = Number(res.headers.get("retry-after"));
      await (c.sleep ?? wait)(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2 ** attempt * 1000, 20_000));
      continue;
    }
    const m: Record<number, string> = { 401: "The Allegro login expired", 403: "Allegro does not allow this data for your account. Reconnect to grant permissions", 404: "Not found on Allegro", 429: "Allegro is rate limiting requests, try again later" };
    throw new AllegroApiError(m[res.status] ?? `Allegro is unavailable (HTTP ${res.status})`, res.status, res.status === 401);
  }
}
const amount = (v: any) => Number(v?.amount) || 0;
const iso = (d: Date) => d.toISOString();

// ---------------- orders ----------------
export interface SaleLine { orderId: string; buyerId: string | null; offerId: string; name: string; qty: number; unitPrice: number; currency: string | null; at: string }
const MAX_ORDER_PAGES = 20;

/** Paid, not cancelled orders from the last `days` days, one entry per line item. `truncated` is true when the page cap was hit. */
export async function loadAllegroSales(c: AllegroCtx, days: number, now = new Date()): Promise<{ lines: SaleLine[]; truncated: boolean }> {
  const from = new Date(now.getTime() - days * 86_400_000);
  const lines: SaleLine[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_ORDER_PAGES; page++) {
    const res = await allegroGet(c, "/order/checkout-forms", { limit: "100", offset: String(page * 100), status: "READY_FOR_PROCESSING", "lineItems.boughtAt.gte": iso(from) });
    const forms: any[] = res?.checkoutForms ?? [];
    for (const f of forms) for (const li of f.lineItems ?? []) {
      const at = String(li.boughtAt ?? f.updatedAt ?? "");
      if (at && new Date(at) < from) continue;
      lines.push({ orderId: String(f.id), buyerId: f.buyer?.id ? String(f.buyer.id) : null, offerId: String(li.offer?.id ?? ""), name: String(li.offer?.name ?? ""), qty: Number(li.quantity) || 0, unitPrice: amount(li.price), currency: li.price?.currency ? String(li.price.currency) : null, at });
    }
    if (forms.length < 100) break;
    if (page === MAX_ORDER_PAGES - 1) truncated = true;
  }
  return { lines: lines.filter((s) => s.offerId && s.qty > 0 && s.at), truncated };
}

/** One order per checkout form. Revenue is the gross price the buyer paid for the items (delivery excluded). */
export function salesToOrders(lines: SaleLine[]): Dataset["orders"] {
  const byOrder = new Map<string, SaleLine[]>();
  for (const l of lines) (byOrder.get(l.orderId) ?? byOrder.set(l.orderId, []).get(l.orderId)!).push(l);
  return [...byOrder].map(([id, ls]) => {
    const t = ls.map((l) => new Date(l.at).getTime()).filter(Number.isFinite);
    const buyer = ls.find((l) => l.buyerId)?.buyerId;
    return {
      externalId: `${ALLEGRO_ID_PREFIX}${id}`, createdAt: new Date(Math.min(...t)).toISOString(),
      revenue: Math.round(ls.reduce((s, l) => s + l.unitPrice * l.qty, 0) * 100) / 100,
      customerId: buyer ? `${ALLEGRO_ID_PREFIX}b${createHash("sha256").update(buyer).digest("hex").slice(0, 16)}` : "",
      utm: { source: "allegro", medium: "marketplace" }, clickIds: {},
    };
  }).filter((o) => o.revenue > 0 && Number.isFinite(new Date(o.createdAt).getTime()));
}

// ---------------- billing: fees and ad costs ----------------
export interface FeeEntry { id: string; at: string; typeId: string; typeName: string; offerId: string | null; amount: number; currency: string | null }
export type FeeCategory = "commission" | "ads" | "delivery" | "fulfillment" | "other" | "settlement";
const MAX_FEE_PAGES = 30;

export async function loadAllegroFees(c: AllegroCtx, days: number, now = new Date()): Promise<FeeEntry[]> {
  const from = new Date(now.getTime() - days * 86_400_000);
  const out: FeeEntry[] = [];
  for (let page = 0; page < MAX_FEE_PAGES; page++) {
    const res = await allegroGet(c, "/billing/billing-entries", { limit: "100", offset: String(page * 100), "occurredAt.gte": iso(from), "occurredAt.lte": iso(now) });
    const entries: any[] = res?.billingEntries ?? [];
    for (const e of entries) out.push({ id: String(e.id), at: String(e.occurredAt ?? ""), typeId: String(e.type?.id ?? ""), typeName: String(e.type?.name ?? ""), offerId: e.offer?.id ? String(e.offer.id) : null, amount: amount(e.value), currency: e.value?.currency ? String(e.value.currency) : null });
    if (entries.length < 100) break;
  }
  return out;
}

/** Which kind of charge an entry is. Settlement lines only repeat fees that have their own entries, so they are never costs. */
export function classifyFee(typeId: string, typeName: string): FeeCategory {
  const t = `${typeId} ${typeName}`.toLowerCase();
  if (/pobranie op[łl]at|z wp[łl]yw|rozlicz|wyp[łl]at|wp[łl]at|podsumowanie miesi|saldo|przelew|settlement|payout|top-?up|do[łl]adowan/.test(t)) return "settlement";
  if (/prowizj|commission|success fee|\bsuc\b/.test(t)) return "commission";
  if (/fulfillment|magazynow|logistyk/.test(t)) return "fulfillment";
  if (/reklam|kampani|\bads\b|sponsor|promowan|promocj|wyr[óo][żz]ni|featured|promo/.test(t)) return "ads";
  if (/dostaw|przesy[łl]|shipping|delivery|smart|kurier|paczkomat|inpost|orlen|dhl|dpd|one box/.test(t)) return "delivery";
  return "other";
}

/** Charges are normally negative and refunds positive, but go by the majority sign of the real entries rather than assuming. */
export function chargesAreNegative(fees: FeeEntry[]): boolean {
  let neg = 0, pos = 0;
  for (const f of fees) { if (classifyFee(f.typeId, f.typeName) === "settlement") continue; if (f.amount < 0) neg++; else if (f.amount > 0) pos++; }
  return neg >= pos;
}
/** Positive = a cost, negative = a refund. */
export const feeCost = (e: FeeEntry, negativeCharges: boolean) => (negativeCharges ? -e.amount : e.amount);

export interface FeeTypeRow { name: string; category: FeeCategory; count: number; total: number }
/** Every distinct charge type with its category and total, so a wrong guess is visible. Settlements are listed but never counted. */
export function summarizeFees(fees: FeeEntry[]): { types: FeeTypeRow[]; byCategory: Record<FeeCategory, number>; chargesNegative: boolean } {
  const neg = chargesAreNegative(fees);
  const rows = new Map<string, FeeTypeRow>();
  const byCategory: Record<FeeCategory, number> = { commission: 0, ads: 0, delivery: 0, fulfillment: 0, other: 0, settlement: 0 };
  for (const f of fees) {
    const cat = classifyFee(f.typeId, f.typeName), name = f.typeName || f.typeId || "Unnamed charge";
    const r = rows.get(`${cat}|${name}`) ?? { name, category: cat, count: 0, total: 0 };
    r.count++; r.total += feeCost(f, neg); rows.set(`${cat}|${name}`, r);
    if (cat !== "settlement") byCategory[cat] += feeCost(f, neg);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  for (const k of Object.keys(byCategory) as FeeCategory[]) byCategory[k] = round(byCategory[k]);
  return { types: [...rows.values()].map((r) => ({ ...r, total: round(r.total) })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 60), byCategory, chargesNegative: neg };
}

// ---------------- offers ----------------
export interface OfferInfo { offerId: string; name: string; price: number | null; visits: number | null; watchers: number | null }
export async function loadAllegroOffers(c: AllegroCtx): Promise<OfferInfo[]> {
  const out: OfferInfo[] = [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  for (let page = 0; page < 5; page++) {
    const res = await allegroGet(c, "/sale/offers", { limit: "1000", offset: String(page * 1000), "publication.status": "ACTIVE" });
    const offers: any[] = res?.offers ?? [];
    for (const o of offers) { const price = Number(o.sellingMode?.price?.amount); out.push({ offerId: String(o.id), name: String(o.name ?? ""), price: price > 0 ? price : null, visits: num(o.stats?.visitsCount), watchers: num(o.stats?.watchersCount) }); }
    if (offers.length < 1000) break;
  }
  return out;
}

// ---------------- into the shared dataset ----------------
/** Ad spend per offer per day, from billing entries classified as ads. Revenue is not attributed here (Allegro does not report it per ad); real sales come in as orders. */
export function buildAllegroDataset(o: { sellerId: string; sellerName: string; currency: string; fees: FeeEntry[]; offers: OfferInfo[]; orders: Dataset["orders"] }): Dataset {
  const ds = emptyDataset();
  const P = "allegro" as const, acct = `allegro-acct-${o.sellerId}`, camp = "allegro-ads", grp = "allegro-ads-group";
  ds.accounts.push({ externalId: acct, platform: P, name: o.sellerName ? `Allegro (${o.sellerName})` : "Allegro", currency: o.currency });
  ds.campaigns.push({ externalId: camp, accountExternalId: acct, platform: P, name: "Allegro Ads", objective: "SALES", status: "active", dailyBudget: 0 });
  ds.adGroups.push({ externalId: grp, campaignExternalId: camp, platform: P, name: "Promoted offers", status: "active" });
  const names = new Map(o.offers.map((x) => [x.offerId, x.name]));
  const neg = chargesAreNegative(o.fees);
  const spend = new Map<string, number>();
  for (const f of o.fees) {
    if (classifyFee(f.typeId, f.typeName) !== "ads" || !f.at) continue;
    const day = f.at.slice(0, 10), ad = `allegro-offer-${f.offerId ?? "account"}`;
    if (!ads(ds, ad)) ds.ads.push({ externalId: ad, adGroupExternalId: grp, platform: P, name: f.offerId ? names.get(f.offerId) || `Offer ${f.offerId}` : "Account-level ad costs", status: "active" });
    spend.set(`${ad}|${day}`, (spend.get(`${ad}|${day}`) ?? 0) + feeCost(f, neg));
  }
  for (const [k, v] of spend) { const [ad, date] = k.split("|"); ds.insights.push({ adExternalId: ad!, date: date!, spend: Math.round(v * 100) / 100, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }); }
  ds.orders = o.orders;
  return ds;
}
const ads = (ds: Dataset, id: string) => ds.ads.some((a) => a.externalId === id);
