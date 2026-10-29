/** Google Search Console: which words people typed into Google before they reached your website. Read-only scope. */
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const BASE = "https://www.googleapis.com/webmasters/v3";

export class SearchConsoleApiError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) { super(message); }
}

export interface SearchConsoleOptions { accessToken: string; fetch?: typeof fetch; maxRetries?: number }
export interface SearchSite { url: string; name: string }
export interface SearchQueryRow { query: string; clicks: number; impressions: number; ctr: number; position: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function searchConsoleAuthUrl(p: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: SEARCH_CONSOLE_SCOPE,
    access_type: "offline", prompt: "consent", state: p.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function call<T>(o: SearchConsoleOptions, method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const f = o.fetch ?? fetch;
  const headers: Record<string, string> = { Authorization: `Bearer ${o.accessToken}` };
  if (body) headers["Content-Type"] = "application/json";
  for (let attempt = 0; ; attempt++) {
    const res = await f(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return json as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < (o.maxRetries ?? 3)) { await sleep(2 ** attempt * 1000); continue; }
    const message: string = json.error?.message ?? `Search Console API HTTP ${res.status}`;
    const disabled = /has not been used|is disabled|SERVICE_DISABLED/i.test(message);
    throw new SearchConsoleApiError(disabled ? "Turn on the Google Search Console API in your Google Cloud project, then try again." : message, res.status, retryable);
  }
}

/** Websites the signed-in Google user may read. Sites where they are only an unverified user return no data, so they are left out. */
export async function listSearchSites(o: SearchConsoleOptions): Promise<SearchSite[]> {
  const r = await call<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(o, "GET", `${BASE}/sites`);
  return (r.siteEntry ?? [])
    .filter((s) => s.siteUrl && s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ url: s.siteUrl, name: s.siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "") }));
}

/** The words people searched on Google between two dates, with clicks, views and average position. Best-selling words first. */
export async function fetchSearchQueries(o: SearchConsoleOptions, siteUrl: string, since: string, until: string, limit = 1000): Promise<SearchQueryRow[]> {
  const r = await call<{ rows?: any[] }>(o, "POST", `${BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    startDate: since, endDate: until, dimensions: ["query"], rowLimit: limit, dataState: "final",
  });
  return (r.rows ?? []).filter((x) => x.keys?.[0]).map((x) => ({
    query: String(x.keys[0]), clicks: Number(x.clicks ?? 0), impressions: Number(x.impressions ?? 0), ctr: Number(x.ctr ?? 0), position: Number(x.position ?? 0),
  }));
}
