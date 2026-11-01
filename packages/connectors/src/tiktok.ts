import { emptyDataset, type Dataset } from "./dataset";

export interface TiktokOptions { accessToken: string; appId?: string; appSecret?: string; fetch?: typeof fetch; maxRetries?: number }
export interface TiktokAdvertiser { id: string; name: string; currency: string; status: string }

export class TiktokApiError extends Error {
  constructor(message: string, readonly code?: number, readonly status?: number, readonly retryable = false) { super(message); }
  /** The token was revoked, is missing, or was never valid: the person has to log in again. */
  get needsReauth() { return this.code === 40105 || this.code === 40104 || this.status === 401; }
}

const BASE = "https://business-api.tiktok.com/open_api/v1.3";
const RATE_LIMIT_CODES = new Set([40100, 40016, 40133]);
const RETRY_CODES = new Set([50000, 60001, 51001, 51002, 51004, 51041, 51043]);
/** TikTok answers 40067 when a daily report asks for too long a window. */
const QUERY_TOO_LARGE = 40067;
const WINDOW_DAYS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every call answers {code, message, data}; code 0 is success. The token goes in the Access-Token header (no "Bearer"), never the URL. */
async function call<T = any>(o: TiktokOptions, method: "GET" | "POST", path: string, params: Record<string, string | number> = {}, body?: unknown): Promise<T> {
  const f = o.fetch ?? fetch;
  const url = `${BASE}/${path}${method === "GET" ? `?${new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]))}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { "Access-Token": o.accessToken };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await f(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.code === 0) return json.data as T;
    const code: number | undefined = typeof json.code === "number" ? json.code : undefined;
    const retryable = (code !== undefined && (RATE_LIMIT_CODES.has(code) || RETRY_CODES.has(code))) || res.status === 429 || res.status >= 500;
    if (retryable && attempt < (o.maxRetries ?? 3)) { await sleep(2 ** attempt * 1000); continue; }
    throw new TiktokApiError(json.message ?? `TikTok API HTTP ${res.status}`, code, res.status, retryable);
  }
}

/** Walks page=1.. until the last page. */
async function* pages<T>(o: TiktokOptions, path: string, params: Record<string, string | number>, pageSize: number): AsyncGenerator<T> {
  for (let page = 1; ; page++) {
    const data = await call<any>(o, "GET", path, { ...params, page, page_size: pageSize });
    for (const row of data?.list ?? []) yield row as T;
    const total = Number(data?.page_info?.total_page ?? 1);
    if (page >= total || !(data?.list?.length > 0)) return;
  }
}

// ---- OAuth (advertiser authorization) ----
export function tiktokAuthUrl(p: { appId: string; redirectUri: string; state: string }) {
  return `https://business-api.tiktok.com/portal/auth?${new URLSearchParams({ app_id: p.appId, state: p.state, redirect_uri: p.redirectUri })}`;
}

/** The auth_code is single-use and lives for an hour. TikTok only accepts a JSON body here. */
export async function exchangeTiktokCode(p: { appId: string; appSecret: string; authCode: string; fetch?: typeof fetch }) {
  const res = await (p.fetch ?? fetch)(`${BASE}/oauth2/access_token/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: p.appId, secret: p.appSecret, auth_code: p.authCode }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0 || !json.data?.access_token) throw new TiktokApiError(json.message ?? "Could not exchange the TikTok login code", json.code, res.status);
  return { accessToken: String(json.data.access_token), advertiserIds: ((json.data.advertiser_ids ?? []) as unknown[]).map(String) };
}

/** Best effort. The endpoint is documented only by third parties, so a failure here must never block disconnecting. */
export async function revokeTiktokToken(p: { appId: string; appSecret: string; accessToken: string; fetch?: typeof fetch }) {
  await (p.fetch ?? fetch)(`${BASE}/oauth2/revoke_token/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: p.appId, secret: p.appSecret, access_token: p.accessToken }),
  });
}

// ---- Ad accounts ----
/** The ad accounts the person ticked on TikTok's consent screen, with currency (needed so money is never read in the wrong currency). */
export async function listTiktokAdvertisers(o: TiktokOptions): Promise<TiktokAdvertiser[]> {
  if (!o.appId || !o.appSecret) throw new TiktokApiError("TikTok is not configured (app ID and secret missing)");
  const granted = await call<any>(o, "GET", "oauth2/advertiser/get/", { app_id: o.appId, secret: o.appSecret });
  const ids: string[] = (granted?.list ?? []).map((a: any) => String(a.advertiser_id));
  const out: TiktokAdvertiser[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const info = await call<any>(o, "GET", "advertiser/info/", { advertiser_ids: JSON.stringify(ids.slice(i, i + 100)) });
    for (const a of info?.list ?? []) out.push({ id: String(a.advertiser_id), name: String(a.name ?? `Account ${a.advertiser_id}`), currency: String(a.currency ?? ""), status: String(a.status ?? "") });
  }
  return out;
}

// ---- Insights ----
const status = (s?: string) => ({ ENABLE: "active", DISABLE: "paused", DELETE: "deleted" } as Record<string, string>)[String(s)] ?? String(s ?? "active").toLowerCase();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Names and ids come back as "metrics" too; the purchase fields are what tell us about sales. */
const BASE_METRICS = ["campaign_id", "campaign_name", "adgroup_id", "adgroup_name", "ad_name", "spend", "impressions", "clicks", "complete_payment"];
/** Purchase value and ROAS from website purchases. Names were taken from third-party field lists, so a failure retries without them. */
const VALUE_METRICS = ["total_complete_payment_rate", "complete_payment_roas"];

/** Website purchase value: the value field when TikTok sends one, else ROAS x spend. 0 when TikTok reports neither. */
export function purchaseValue(m: Record<string, unknown>, spend: number): number {
  const value = num(m.total_complete_payment_rate);
  if (value > 0) return value;
  const roas = num(m.complete_payment_roas);
  return roas > 0 ? Math.round(roas * spend * 100) / 100 : 0;
}

/** Windows of at most 30 days, oldest first. */
function windows(since: string, until: string): [string, string][] {
  const out: [string, string][] = [];
  let from = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (from <= end) {
    const to = new Date(Math.min(from.getTime() + (WINDOW_DAYS - 1) * 86400000, end.getTime()));
    out.push([iso(from), iso(to)]);
    from = new Date(to.getTime() + 86400000);
  }
  return out;
}

async function report(o: TiktokOptions, advertiserId: string, from: string, to: string, metrics: string[]) {
  const rows: any[] = [];
  for await (const r of pages<any>(o, "report/integrated/get/", {
    advertiser_id: advertiserId, report_type: "BASIC", service_type: "AUCTION", data_level: "AUCTION_AD",
    dimensions: JSON.stringify(["ad_id", "stat_time_day"]), metrics: JSON.stringify(metrics), start_date: from, end_date: to,
  }, 1000)) rows.push(r);
  return rows;
}

/** One window. If TikTok refuses the purchase-value fields, ask again without them: spend and clicks are still right, sales then read as unreported. */
async function reportWindow(o: TiktokOptions, advertiserId: string, from: string, to: string): Promise<any[]> {
  try {
    return await report(o, advertiserId, from, to, [...BASE_METRICS, ...VALUE_METRICS]);
  } catch (e) {
    if (e instanceof TiktokApiError && !e.needsReauth && !e.retryable && e.code !== QUERY_TOO_LARGE && /metric|field|param/i.test(e.message)) return report(o, advertiserId, from, to, BASE_METRICS);
    if (e instanceof TiktokApiError && e.code === QUERY_TOO_LARGE && from !== to) {
      const mid = new Date((new Date(`${from}T00:00:00Z`).getTime() + new Date(`${to}T00:00:00Z`).getTime()) / 2);
      const left = iso(mid), right = iso(new Date(mid.getTime() + 86400000));
      return [...(await reportWindow(o, advertiserId, from, left)), ...(await reportWindow(o, advertiserId, right, to))];
    }
    throw e;
  }
}

/** Pulls daily ad-level insights for the given accounts and normalises them into a Dataset. */
export async function fetchTiktokDataset(o: TiktokOptions, accounts: TiktokAdvertiser[], since: string, until: string): Promise<Dataset> {
  const ds = emptyDataset();
  const seen = { c: new Set<string>(), g: new Set<string>(), a: new Set<string>() };

  for (const acct of accounts) {
    const accId = `tiktok-acct-${acct.id}`;
    ds.accounts.push({ externalId: accId, platform: "tiktok", name: acct.name, currency: acct.currency });

    const meta = new Map<string, { objective: string; status: string; budget: number }>();
    for await (const c of pages<any>(o, "campaign/get/", { advertiser_id: acct.id, fields: JSON.stringify(["campaign_id", "campaign_name", "objective_type", "operation_status", "budget"]) }, 100))
      meta.set(String(c.campaign_id), { objective: String(c.objective_type ?? "").toLowerCase(), status: status(c.operation_status), budget: num(c.budget) });

    for (const [from, to] of windows(since, until)) {
      for (const r of await reportWindow(o, acct.id, from, to)) {
        const m = r.metrics ?? {}, d = r.dimensions ?? {};
        const cid = `tiktok-cmp-${m.campaign_id}`, gid = `tiktok-grp-${m.adgroup_id}`, aid = `tiktok-ad-${d.ad_id}`;
        if (!seen.c.has(cid)) { seen.c.add(cid); const k = meta.get(String(m.campaign_id));
          ds.campaigns.push({ externalId: cid, accountExternalId: accId, platform: "tiktok", name: String(m.campaign_name ?? `Campaign ${m.campaign_id}`), objective: k?.objective ?? "", status: k?.status ?? "active", dailyBudget: k?.budget ?? 0 }); }
        if (!seen.g.has(gid)) { seen.g.add(gid); ds.adGroups.push({ externalId: gid, campaignExternalId: cid, platform: "tiktok", name: String(m.adgroup_name ?? `Ad group ${m.adgroup_id}`), status: "active" }); }
        if (!seen.a.has(aid)) { seen.a.add(aid); ds.ads.push({ externalId: aid, adGroupExternalId: gid, platform: "tiktok", name: String(m.ad_name ?? `Ad ${d.ad_id}`), status: "active" }); }
        const spend = num(m.spend);
        ds.insights.push({ adExternalId: aid, date: String(d.stat_time_day).slice(0, 10), spend, impressions: num(m.impressions), clicks: num(m.clicks), conversions: num(m.complete_payment), revenue: purchaseValue(m, spend) });
      }
    }
  }
  return ds;
}
