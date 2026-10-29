import { emptyDataset, type Dataset } from "./dataset";

export interface MetaOptions { accessToken: string; version?: string; fetch?: typeof fetch; maxRetries?: number }
export interface MetaAdAccount { id: string; name: string; currency: string; status: number }

export class MetaApiError extends Error {
  constructor(message: string, readonly code?: number, readonly retryable = false, readonly subcode?: number) { super(message); }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004]);
const BASE = "https://graph.facebook.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET with paging and retry on rate limits. Token goes in the Authorization header, never the URL. */
async function* getPages<T>(o: MetaOptions, path: string, params: Record<string, string>): AsyncGenerator<T> {
  const f = o.fetch ?? fetch;
  let url: string | undefined = `${BASE}/${o.version ?? "v23.0"}/${path}?${new URLSearchParams(params)}`;
  while (url) {
    let json: any;
    for (let attempt = 0; ; attempt++) {
      const res = await f(url, { headers: { Authorization: `Bearer ${o.accessToken}` } });
      json = await res.json().catch(() => ({}));
      if (res.ok && !json.error) break;
      const code: number | undefined = json.error?.code;
      const retryable = (code !== undefined && RATE_LIMIT_CODES.has(code)) || res.status === 429 || res.status >= 500;
      if (retryable && attempt < (o.maxRetries ?? 3)) { await sleep(2 ** attempt * 1000); continue; }
      throw new MetaApiError(json.error?.message ?? `Meta API HTTP ${res.status}`, code, retryable, json.error?.error_subcode);
    }
    for (const row of json.data ?? []) yield row as T;
    url = json.paging?.next;
  }
}

async function collect<T>(o: MetaOptions, path: string, params: Record<string, string>) {
  const out: T[] = [];
  for await (const r of getPages<T>(o, path, params)) out.push(r);
  return out;
}

export async function listMetaAdAccounts(o: MetaOptions): Promise<MetaAdAccount[]> {
  const rows = await collect<any>(o, "me/adaccounts", { fields: "account_id,name,currency,account_status", limit: "100" });
  return rows.map((r) => ({ id: String(r.account_id), name: r.name ?? `Account ${r.account_id}`, currency: r.currency ?? "USD", status: Number(r.account_status ?? 0) }));
}

const PURCHASE = ["omni_purchase", "purchase"];
/** Meta repeats the same purchase under several action types; take one, preferring the deduplicated omni type. */
function pick(list: { action_type: string; value: string }[] | undefined): number {
  for (const t of PURCHASE) { const hit = list?.find((a) => a.action_type === t); if (hit) return Number(hit.value) || 0; }
  return 0;
}
const status = (s?: string) => (s ?? "active").toLowerCase();

/** Pulls daily ad-level insights for the given accounts and normalises them into a Dataset. */
export async function fetchMetaDataset(o: MetaOptions, accounts: MetaAdAccount[], since: string, until: string): Promise<Dataset> {
  const ds = emptyDataset();
  const seen = { c: new Set<string>(), g: new Set<string>(), a: new Set<string>() };

  for (const acct of accounts) {
    const accId = `meta-acct-${acct.id}`;
    ds.accounts.push({ externalId: accId, platform: "meta", name: acct.name, currency: acct.currency });

    const meta = new Map<string, { objective: string; status: string; budget: number }>();
    for await (const c of getPages<any>(o, `act_${acct.id}/campaigns`, { fields: "id,objective,effective_status,daily_budget", limit: "200" }))
      meta.set(String(c.id), { objective: String(c.objective ?? "").toLowerCase(), status: status(c.effective_status), budget: Number(c.daily_budget ?? 0) / 100 });

    const params = {
      level: "ad", time_increment: "1", limit: "500",
      time_range: JSON.stringify({ since, until }),
      fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values,date_start",
    };
    for await (const r of getPages<any>(o, `act_${acct.id}/insights`, params)) {
      const cid = `meta-cmp-${r.campaign_id}`, gid = `meta-grp-${r.adset_id}`, aid = `meta-ad-${r.ad_id}`;
      if (!seen.c.has(cid)) { seen.c.add(cid); const m = meta.get(String(r.campaign_id));
        ds.campaigns.push({ externalId: cid, accountExternalId: accId, platform: "meta", name: r.campaign_name, objective: m?.objective ?? "", status: m?.status ?? "active", dailyBudget: m?.budget ?? 0 }); }
      if (!seen.g.has(gid)) { seen.g.add(gid); ds.adGroups.push({ externalId: gid, campaignExternalId: cid, platform: "meta", name: r.adset_name, status: "active" }); }
      if (!seen.a.has(aid)) { seen.a.add(aid); ds.ads.push({ externalId: aid, adGroupExternalId: gid, platform: "meta", name: r.ad_name, status: "active" }); }
      ds.insights.push({ adExternalId: aid, date: r.date_start, spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, conversions: pick(r.actions), revenue: pick(r.action_values) });
    }
  }
  return ds;
}

// ---- OAuth (Facebook Login for Business) ----
export function metaAuthUrl(p: { appId: string; configId: string; redirectUri: string; state: string; version?: string }) {
  const q = new URLSearchParams({ client_id: p.appId, config_id: p.configId, redirect_uri: p.redirectUri, state: p.state, response_type: "code", override_default_response_type: "true" });
  return `https://www.facebook.com/${p.version ?? "v23.0"}/dialog/oauth?${q}`;
}

export async function exchangeMetaCode(p: { appId: string; appSecret: string; redirectUri: string; code: string; version?: string; fetch?: typeof fetch }) {
  const q = new URLSearchParams({ client_id: p.appId, client_secret: p.appSecret, redirect_uri: p.redirectUri, code: p.code });
  const res = await (p.fetch ?? fetch)(`${BASE}/${p.version ?? "v23.0"}/oauth/access_token?${q}`);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error || !json.access_token) throw new MetaApiError(json.error?.message ?? "Could not exchange the Meta login code", json.error?.code);
  return { accessToken: String(json.access_token), expiresInSec: json.expires_in ? Number(json.expires_in) : null };
}

// ---- Ad Library (public ads of other advertisers; read-only) ----
export interface MetaLibraryAd { id: string; pageName: string; startedOn: string | null; endedOn: string | null; text: string; headline: string; reach: number | null }

const day = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const LIBRARY_FIELDS = "id,page_name,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,eu_total_reach";

/** Meta's identity and terms step for the Ad Library API is per Facebook account, separate from having an app. */
const NOT_APPROVED = "Meta has not approved your Facebook account for the Ad Library API yet. Finish the steps at facebook.com/ads/library/api, wait for Meta to confirm, then try again.";

/**
 * Public ads that reached a country (EU ads come with start and stop dates). Searches by words, so the caller keeps only the ads of the right page.
 * We read the ad ID and build our own library link: Meta's own snapshot link carries the access token, which must never be stored.
 */
export async function fetchMetaLibraryAds(o: MetaOptions, p: { search: string; country: string; maxAds?: number }): Promise<MetaLibraryAd[]> {
  const max = p.maxAds ?? 200, out: MetaLibraryAd[] = [];
  try {
    for await (const r of getPages<any>(o, "ads_archive", {
      search_terms: p.search, ad_type: "ALL", ad_reached_countries: JSON.stringify([p.country]), ad_active_status: "ALL", fields: LIBRARY_FIELDS, limit: "50",
    })) {
      if (!r.id) continue;
      out.push({
        id: String(r.id), pageName: String(r.page_name ?? ""), startedOn: day(r.ad_delivery_start_time), endedOn: day(r.ad_delivery_stop_time),
        text: String(r.ad_creative_bodies?.[0] ?? ""), headline: String(r.ad_creative_link_titles?.[0] ?? ""),
        reach: Number.isFinite(Number(r.eu_total_reach)) && r.eu_total_reach !== undefined ? Number(r.eu_total_reach) : null,
      });
      if (out.length >= max) break;
    }
  } catch (e) {
    if (e instanceof MetaApiError && e.code === 10 && (e.subcode === 2332002 || e.subcode === 2332004)) throw new MetaApiError(NOT_APPROVED, e.code, false, e.subcode);
    throw e;
  }
  return out;
}
