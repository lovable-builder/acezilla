/**
 * Google Merchant Center through the Merchant API (v1). The Content API for Shopping was switched off on 18 August 2026.
 * Google offers no read-only scope for Merchant Center: `auth/content` can also change products. acezilla only ever
 * calls GET accounts lists and the read-only `reports:search`, plus the one-time developer registration below, which runs only
 * when a person presses its button. The tests pin that down.
 */
export const MERCHANT_SCOPE = "https://www.googleapis.com/auth/content";
const BASE = "https://merchantapi.googleapis.com";

export class MerchantApiError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) { super(message); }
}

export interface MerchantOptions { accessToken: string; fetch?: typeof fetch; maxRetries?: number }
export interface MerchantAccount { id: string; name: string }
export type FeedStatus = "eligible" | "limited" | "pending" | "disapproved" | "unknown";
export interface MerchantIssue { code: string; severity: string; resolution: string }
export interface MerchantProduct { productId: string; offerId: string; title: string; status: FeedStatus; clickPotential: string; issues: MerchantIssue[] }
/** One day of free listings or ads traffic for the whole account. */
export interface MerchantDailyRow { date: string; source: "free" | "ads"; clicks: number; impressions: number; conversions: number; conversionValue: number }
export interface MerchantPerformance { currency: string; rows: MerchantDailyRow[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE = 100000;

/** Same Google login as Google Ads and Analytics, asking for Merchant Center. */
export function merchantAuthUrl(p: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: MERCHANT_SCOPE,
    access_type: "offline", prompt: "consent", state: p.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

function friendly(message: string, status?: number) {
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(message)) return "Turn on the Merchant API in your Google Cloud project, then try again.";
  if (/not registered|register.*(project|gcp|cloud)|GCP project|developer registration/i.test(message)) {
    return "Google says this Cloud project is not registered with your Merchant Center account. Register it in Merchant Center (Merchant API settings), then try again.";
  }
  return message || `Merchant API HTTP ${status}`;
}

async function call<T>(o: MerchantOptions, method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const f = o.fetch ?? fetch;
  const headers: Record<string, string> = { Authorization: `Bearer ${o.accessToken}` };
  if (body) headers["Content-Type"] = "application/json";
  for (let attempt = 0; ; attempt++) {
    const res = await f(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return json as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < (o.maxRetries ?? 3)) { await sleep(2 ** attempt * 1000); continue; }
    throw new MerchantApiError(friendly(json.error?.message ?? "", res.status), res.status, retryable);
  }
}

/** Every Merchant Center account the signed-in Google user can read. */
export async function listMerchantAccounts(o: MerchantOptions): Promise<MerchantAccount[]> {
  const out: MerchantAccount[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ pageSize: "250", ...(pageToken ? { pageToken } : {}) });
    const r = await call<{ accounts?: any[]; nextPageToken?: string }>(o, "GET", `${BASE}/accounts/v1/accounts?${qs}`);
    for (const a of r.accounts ?? []) {
      const id = String(a.accountId ?? String(a.name ?? "").replace("accounts/", ""));
      if (id) out.push({ id, name: a.accountName || `Account ${id}` });
    }
    pageToken = r.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

/** Runs a Merchant Center report query (read-only) and follows the paging. */
async function search(o: MerchantOptions, accountId: string, query: string): Promise<any[]> {
  const rows: any[] = [];
  let pageToken: string | undefined;
  do {
    const r = await call<{ results?: any[]; nextPageToken?: string }>(o, "POST", `${BASE}/reports/v1/accounts/${accountId}/reports:search`, { query, pageSize: PAGE, ...(pageToken ? { pageToken } : {}) });
    rows.push(...(r.results ?? []));
    pageToken = r.nextPageToken || undefined;
  } while (pageToken);
  return rows;
}

/**
 * One-time step Google requires before any Merchant API call: links this app's Google Cloud project to a Merchant Center account
 * and records a developer contact. The signed-in Google user must be an admin of that account. The contact gets the API developer
 * role (an invitation, valid for 14 days, if they are not a user yet). Calls work within about 5 minutes.
 */
export async function registerMerchantDeveloper(o: MerchantOptions, accountId: string, developerEmail: string): Promise<{ gcpIds: string[] }> {
  if (!/^\d{1,20}$/.test(accountId)) throw new MerchantApiError("The Merchant Center account ID is a number, like 123456789.");
  const r = await call<{ gcpIds?: string[] }>(o, "POST", `${BASE}/accounts/v1/accounts/${accountId}/developerRegistration:registerGcp`, { developerEmail });
  return { gcpIds: r.gcpIds ?? [] };
}

const two = (n: number) => String(n).padStart(2, "0");
/** Google writes dates as {year, month, day}. */
function isoDate(d: any): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d?.year ? `${d.year}-${two(d.month)}-${two(d.day)}` : "";
}
const micros = (m: any) => (m?.amountMicros !== undefined ? Number(m.amountMicros) / 1e6 : 0);

/** Daily clicks, impressions and conversions, split into free listings (organic) and ads. */
export async function fetchMerchantPerformance(o: MerchantOptions, accountId: string, since: string, until: string): Promise<MerchantPerformance> {
  const results = await search(o, accountId,
    `SELECT date, marketing_method, clicks, impressions, conversions, conversion_value FROM product_performance_view WHERE date BETWEEN '${since}' AND '${until}'`);
  let currency = "";
  const byKey = new Map<string, MerchantDailyRow>();
  for (const r of results) {
    const v = r.productPerformanceView ?? {};
    const date = isoDate(v.date);
    if (!date) continue;
    const source: "free" | "ads" = String(v.marketingMethod ?? "").toUpperCase() === "ADS" ? "ads" : "free";
    currency = currency || v.conversionValue?.currencyCode || "";
    const key = `${date}|${source}`;
    const row = byKey.get(key) ?? { date, source, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 };
    row.clicks += Number(v.clicks ?? 0); row.impressions += Number(v.impressions ?? 0);
    row.conversions += Number(v.conversions ?? 0); row.conversionValue += micros(v.conversionValue);
    byKey.set(key, row);
  }
  return { currency, rows: [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source)) };
}

const STATUS: Record<string, FeedStatus> = { ELIGIBLE: "eligible", ELIGIBLE_LIMITED: "limited", PENDING: "pending", NOT_ELIGIBLE_OR_DISAPPROVED: "disapproved" };

function parseIssues(list: any[] | undefined): MerchantIssue[] {
  return (list ?? []).map((i) => ({
    code: String(i.type?.code ?? i.code ?? "issue"),
    severity: String(i.severity?.aggregatedSeverity ?? (typeof i.severity === "string" ? i.severity : "")).toLowerCase(),
    resolution: String(i.resolution ?? "").toLowerCase(),
  }));
}

/** Every product with its approval status in Google Shopping and the problems Google found. */
export async function fetchMerchantProducts(o: MerchantOptions, accountId: string): Promise<MerchantProduct[]> {
  const base = "id, offer_id, title, aggregated_reporting_context_status, click_potential";
  let results: any[];
  try {
    results = await search(o, accountId, `SELECT ${base}, item_issues FROM product_view`);
  } catch (e) {
    // If Google rejects the issues column, the statuses are still worth having.
    if (!(e instanceof MerchantApiError) || e.status !== 400) throw e;
    results = await search(o, accountId, `SELECT ${base} FROM product_view`);
  }
  return results.map((r) => r.productView ?? {}).filter((v) => v.id).map((v) => ({
    productId: String(v.id), offerId: String(v.offerId ?? ""), title: String(v.title ?? ""),
    status: STATUS[String(v.aggregatedReportingContextStatus ?? "")] ?? "unknown",
    clickPotential: String(v.clickPotential ?? "").toLowerCase(), issues: parseIssues(v.itemIssues),
  }));
}

export interface MerchantPrice { productId: string; offerId: string; title: string; brand: string; price: number; benchmark: number; currency: string }

/** The offer ID is the last part of Google's product ID, such as en~PL~SKU-1. */
const offerOf = (id: string) => id.split("~").pop() ?? id;

/**
 * Each product's price next to Google's benchmark (the average price other merchants charge for the same product).
 * Google only fills this report for accounts and countries that qualify, so a 400 or 403 here means "not available", not a broken connection.
 */
export async function fetchMerchantPrices(o: MerchantOptions, accountId: string): Promise<MerchantPrice[]> {
  const results = await search(o, accountId, "SELECT id, title, brand, price, benchmark_price, report_country_code FROM price_competitiveness_product_view");
  const out: MerchantPrice[] = [];
  for (const r of results) {
    const v = r.priceCompetitivenessProductView ?? {};
    const price = micros(v.price), benchmark = micros(v.benchmarkPrice);
    if (!v.id || !(price > 0) || !(benchmark > 0)) continue;
    out.push({ productId: String(v.id), offerId: offerOf(String(v.id)), title: String(v.title ?? ""), brand: String(v.brand ?? ""), price, benchmark, currency: v.price?.currencyCode ?? v.benchmarkPrice?.currencyCode ?? "" });
  }
  return out;
}
