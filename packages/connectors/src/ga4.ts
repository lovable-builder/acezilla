export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export class Ga4ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) { super(message); }
}

export interface Ga4Options { accessToken: string; fetch?: typeof fetch; maxRetries?: number }
export interface Ga4Property { id: string; name: string; account: string }
/** One day of one traffic channel (Paid Search, Paid Social, Organic Search ...) on one property. */
export interface Ga4DailyRow { date: string; channel: string; sessions: number; conversions: number; revenue: number }
export interface Ga4Report { currency: string; rows: Ga4DailyRow[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE = 100000;

/** Same Google login as Google Ads, but asking only for read access to Analytics. */
export function ga4AuthUrl(p: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: GA4_SCOPE,
    access_type: "offline", prompt: "consent", state: p.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function call<T>(o: Ga4Options, method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const f = o.fetch ?? fetch;
  const headers: Record<string, string> = { Authorization: `Bearer ${o.accessToken}` };
  if (body) headers["Content-Type"] = "application/json";
  for (let attempt = 0; ; attempt++) {
    const res = await f(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return json as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < (o.maxRetries ?? 3)) { await sleep(2 ** attempt * 1000); continue; }
    const message: string = json.error?.message ?? `Google Analytics API HTTP ${res.status}`;
    const disabled = /has not been used|is disabled|SERVICE_DISABLED/i.test(message);
    throw new Ga4ApiError(disabled ? "Turn on the Google Analytics Admin API and Google Analytics Data API in your Google Cloud project, then try again." : message, res.status, retryable);
  }
}

/** Every GA4 property the signed-in Google user can read. */
export async function listGa4Properties(o: Ga4Options): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
    const r = await call<{ accountSummaries?: any[]; nextPageToken?: string }>(o, "GET", `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${qs}`);
    for (const a of r.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) {
        const id = String(p.property ?? "").replace("properties/", "");
        if (id) out.push({ id, name: p.displayName || `Property ${id}`, account: a.displayName ?? "" });
      }
    }
    pageToken = r.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

const yyyymmdd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/** Daily sessions, key events and purchase revenue per default channel group. Read-only Data API report. */
export async function fetchGa4Report(o: Ga4Options, propertyId: string, since: string, until: string): Promise<Ga4Report> {
  const rows: Ga4DailyRow[] = [];
  let currency = "";
  for (let offset = 0; ; offset += PAGE) {
    const r = await call<{ rows?: any[]; rowCount?: number; metadata?: { currencyCode?: string } }>(o, "POST", `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      dateRanges: [{ startDate: since, endDate: until }],
      dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }, { name: "purchaseRevenue" }],
      limit: PAGE, offset,
    });
    currency = currency || r.metadata?.currencyCode || "";
    for (const row of r.rows ?? []) {
      const [d, ch] = row.dimensionValues ?? [];
      const [s, c, v] = row.metricValues ?? [];
      rows.push({ date: yyyymmdd(String(d?.value ?? "")), channel: String(ch?.value || "Unassigned"), sessions: Number(s?.value ?? 0), conversions: Number(c?.value ?? 0), revenue: Number(v?.value ?? 0) });
    }
    if (offset + PAGE >= (r.rowCount ?? 0)) break;
  }
  return { currency, rows };
}
