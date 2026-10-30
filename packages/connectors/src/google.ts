import { emptyDataset, type Dataset } from "./dataset";

export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const DEFAULT_VERSION = "v24";

export class GoogleApiError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) { super(message); }
}

export interface GoogleOptions { accessToken: string; version?: string; fetch?: typeof fetch; maxRetries?: number }
export interface GoogleAdAccount { id: string; name: string; currency: string; loginCustomerId?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digits = (s: string) => s.replace(/\D/g, "");

// ---- OAuth ----
export function googleAuthUrl(p: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: GOOGLE_ADS_SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: p.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** One Google consent screen for several services at once. The same login is then saved for each. */
export function googleScopesAuthUrl(p: { clientId: string; redirectUri: string; state: string; scopes: string[] }) {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: p.scopes.join(" "),
    access_type: "offline", prompt: "consent", state: p.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenCall(body: Record<string, string>, f: typeof fetch) {
  const res = await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new GoogleApiError(json.error_description ?? json.error ?? `Google token HTTP ${res.status}`, res.status);
  return json;
}

export async function exchangeGoogleCode(p: { clientId: string; clientSecret: string; redirectUri: string; code: string; fetch?: typeof fetch }) {
  const j = await tokenCall({ client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri, code: p.code, grant_type: "authorization_code" }, p.fetch ?? fetch);
  if (!j.refresh_token) throw new GoogleApiError("Google did not return a refresh token. Remove acezilla at myaccount.google.com/permissions and connect again.");
  return { refreshToken: String(j.refresh_token), accessToken: String(j.access_token ?? "") };
}

export async function refreshGoogleAccessToken(p: { clientId: string; clientSecret: string; refreshToken: string; fetch?: typeof fetch }) {
  const j = await tokenCall({ client_id: p.clientId, client_secret: p.clientSecret, refresh_token: p.refreshToken, grant_type: "refresh_token" }, p.fetch ?? fetch);
  return String(j.access_token);
}

// ---- REST helpers ----
async function call<T>(o: GoogleOptions, method: "GET" | "POST", path: string, opts: { body?: unknown; loginCustomerId?: string } = {}): Promise<T> {
  const f = o.fetch ?? fetch;
  const url = `https://googleads.googleapis.com/${o.version ?? DEFAULT_VERSION}/${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${o.accessToken}` };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.loginCustomerId) headers["login-customer-id"] = digits(opts.loginCustomerId);
  for (let attempt = 0; ; attempt++) {
    const res = await f(url, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return json as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < (o.maxRetries ?? 3)) { await sleep(2 ** attempt * 1000); continue; }
    const detail = json.error?.details?.flatMap((d: any) => d.errors ?? []).find((e: any) => e.message)?.message;
    throw new GoogleApiError(detail ?? json.error?.message ?? `Google Ads API HTTP ${res.status}`, res.status, retryable);
  }
}

async function gaql<T = any>(o: GoogleOptions, customerId: string, query: string, loginCustomerId?: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const r = await call<{ results?: T[]; nextPageToken?: string }>(o, "POST", `customers/${digits(customerId)}/googleAds:search`, { body: { query, ...(pageToken ? { pageToken } : {}) }, loginCustomerId });
    out.push(...(r.results ?? []));
    pageToken = r.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

/** Every non-manager ad account the signed-in user can reach, directly or through a manager (MCC) account. */
export async function listGoogleAdAccounts(o: GoogleOptions): Promise<GoogleAdAccount[]> {
  const r = await call<{ resourceNames?: string[] }>(o, "GET", "customers:listAccessibleCustomers");
  const ids = (r.resourceNames ?? []).map((n) => digits(n));
  const found = new Map<string, GoogleAdAccount>();
  let lastError: unknown;
  for (const id of ids) {
    try {
      const rows = await gaql<any>(o, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1");
      const c = rows[0]?.customer;
      if (!c) continue;
      if (!c.manager) { found.set(id, { id, name: c.descriptiveName || `Account ${id}`, currency: c.currencyCode ?? "USD" }); continue; }
      const kids = await gaql<any>(o, id, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.level <= 1 AND customer_client.status = 'ENABLED'", id);
      for (const k of kids) {
        const cc = k.customerClient;
        if (!cc || cc.manager) continue;
        const kid = digits(String(cc.id));
        if (!found.has(kid)) found.set(kid, { id: kid, name: cc.descriptiveName || `Account ${kid}`, currency: cc.currencyCode ?? "USD", loginCustomerId: id });
      }
    } catch (e) { lastError = e; /* an unreadable account is skipped, but if nothing is readable we report why */ }
  }
  if (found.size === 0 && lastError) throw lastError;
  return [...found.values()];
}

const STATUS: Record<string, string> = { ENABLED: "active", PAUSED: "paused", REMOVED: "removed" };

/** Daily campaign-level performance. Campaign level also covers Performance Max, which has no ad groups. */
export async function fetchGoogleDataset(o: GoogleOptions, accounts: GoogleAdAccount[], since: string, until: string): Promise<Dataset> {
  const ds = emptyDataset();
  const seen = new Set<string>();
  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  for (const a of accounts) {
    const acctId = `google-acct-${a.id}`;
    ds.accounts.push({ externalId: acctId, platform: "google", name: a.name, currency: a.currency });
    for (const r of await gaql<any>(o, a.id, query, a.loginCustomerId)) {
      const cid = String(r.campaign.id), campId = `google-cmp-${cid}`, grpId = `google-grp-${cid}`, adId = `google-ad-${cid}`;
      if (!seen.has(campId)) {
        seen.add(campId);
        ds.campaigns.push({ externalId: campId, accountExternalId: acctId, platform: "google", name: r.campaign.name, objective: String(r.campaign.advertisingChannelType ?? "").toLowerCase(), status: STATUS[r.campaign.status] ?? "active", dailyBudget: Number(r.campaignBudget?.amountMicros ?? 0) / 1e6 });
        ds.adGroups.push({ externalId: grpId, campaignExternalId: campId, platform: "google", name: "All ads", status: "active" });
        ds.ads.push({ externalId: adId, adGroupExternalId: grpId, platform: "google", name: "All ads", status: "active" });
      }
      const m = r.metrics ?? {};
      ds.insights.push({ adExternalId: adId, date: r.segments.date, spend: Number(m.costMicros ?? 0) / 1e6, impressions: Number(m.impressions ?? 0), clicks: Number(m.clicks ?? 0), conversions: Number(m.conversions ?? 0), revenue: Number(m.conversionsValue ?? 0) });
    }
  }
  return ds;
}
