import { assertSafeUrl, defaultLookup, UnsafeUrlError, type Lookup } from "./ssrf";

export const BOT_UA = "acezilla-seo-bot/1.0 (+https://acezilla.vercel.app/bot)";

export interface SafeFetchOptions {
  fetch?: typeof fetch; lookup?: Lookup; userAgent?: string;
  timeoutMs?: number; maxBytes?: number; maxRedirects?: number;
  /** When true, non-HTML responses are rejected after the headers arrive. */
  requireHtml?: boolean;
}
export type SafeFetchResult =
  | { ok: true; url: string; status: number; headers: Record<string, string>; body: string; ms: number; redirects: string[] }
  | { ok: false; error: string; unsafe?: boolean; status?: number; url?: string };

/** GET a public web page: every hop is validated, redirects are followed manually, size and time are capped. */
export async function safeFetch(startUrl: string, o: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const f = o.fetch ?? fetch, lookup = o.lookup ?? defaultLookup;
  const maxRedirects = o.maxRedirects ?? 5, maxBytes = o.maxBytes ?? 2 * 1024 * 1024, timeout = o.timeoutMs ?? 10_000;
  const redirects: string[] = [];
  let current = startUrl;
  const t0 = Date.now();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u: URL;
    try { u = await assertSafeUrl(current, lookup); } catch (e) { return { ok: false, error: e instanceof UnsafeUrlError ? e.message : "Invalid URL", unsafe: true, url: current }; }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await f(u.toString(), { redirect: "manual", signal: ctl.signal, headers: { "user-agent": o.userAgent ?? BOT_UA, accept: o.requireHtml ? "text/html,application/xhtml+xml" : "*/*" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        redirects.push(u.toString());
        current = new URL(res.headers.get("location")!, u).toString();
        continue;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      if (o.requireHtml && res.ok && !/html|xml/i.test(headers["content-type"] ?? "")) return { ok: false, error: "Not an HTML page", status: res.status, url: u.toString() };
      const declared = Number(headers["content-length"] ?? 0);
      if (declared > maxBytes) return { ok: false, error: "Page is too large", status: res.status, url: u.toString() };
      const body = await readCapped(res, maxBytes);
      if (body === null) return { ok: false, error: "Page is too large", status: res.status, url: u.toString() };
      return { ok: true, url: u.toString(), status: res.status, headers, body, ms: Date.now() - t0, redirects };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { ok: false, error: aborted ? "The site took too long to respond" : "Could not reach the site", url: u.toString() };
    } finally { clearTimeout(timer); }
  }
  return { ok: false, error: "Too many redirects", url: current };
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
