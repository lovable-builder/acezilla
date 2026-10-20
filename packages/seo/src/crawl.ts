import { analyzePage, type PageData } from "./analyze";
import { isAllowed, parseRobots, type RobotsRules } from "./robots";
import { BOT_UA, safeFetch, type SafeFetchOptions } from "./safe-fetch";

export const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot", "Googlebot", "Bingbot"];

export interface SiteFiles {
  robots: { present: boolean; blocksAll: boolean; blockedBots: string[]; sitemaps: string[] };
  sitemap: { present: boolean; urlCount: number; url: string | null };
}
export type CrawlResult =
  | { ok: true; origin: string; startUrl: string; pages: PageData[]; files: SiteFiles; skippedByRobots: number; capped: boolean }
  | { ok: false; error: string };

export interface CrawlOptions extends Pick<SafeFetchOptions, "fetch" | "lookup"> { maxPages?: number; concurrency?: number; delayMs?: number; onProgress?: (done: number, total: number) => void }

const STATIC_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|zip|gz|mp4|mp3|mov|woff2?|ttf|docx?|xlsx?|pptx?)$/i;
export const normUrl = (s: string) => { const u = new URL(s); u.hash = ""; u.hostname = u.hostname.toLowerCase(); if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1); return u.toString(); };
const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polite, capped, same-host crawl. Never leaves the starting host; obeys robots.txt for our user-agent. */
export async function crawlSite(startUrl: string, o: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = o.maxPages ?? 25, concurrency = o.concurrency ?? 3, delay = o.delayMs ?? 250;
  const fetchOpts = { fetch: o.fetch, lookup: o.lookup };
  const home = await safeFetch(startUrl, { ...fetchOpts, requireHtml: true });
  if (!home.ok) return { ok: false, error: home.error };
  if (home.status >= 400) return { ok: false, error: `The homepage returned HTTP ${home.status}, so there is nothing to audit` };
  const origin = new URL(home.url).origin, host = new URL(home.url).hostname;

  // robots.txt and sitemap
  const rob = await safeFetch(`${origin}/robots.txt`, fetchOpts);
  const rules: RobotsRules = rob.ok && rob.status === 200 ? parseRobots(rob.body) : { groups: [], sitemaps: [] };
  const robotsPresent = rob.ok && rob.status === 200 && /user-agent/i.test(rob.body);
  const blockedBots = AI_BOTS.filter((b) => !isAllowed(rules, b, "/"));
  const smUrl = rules.sitemaps[0] ?? `${origin}/sitemap.xml`;
  const sm = await safeFetch(smUrl, fetchOpts);
  let smUrls: string[] = [];
  if (sm.ok && sm.status === 200 && /<(urlset|sitemapindex)/i.test(sm.body)) {
    smUrls = locs(sm.body);
    if (/<sitemapindex/i.test(sm.body) && smUrls[0]) { const child = await safeFetch(smUrls[0], fetchOpts); smUrls = child.ok && child.status === 200 ? locs(child.body) : []; }
  }
  const sameHost = (u: string) => { try { return new URL(u).hostname.toLowerCase() === host.toLowerCase(); } catch { return false; } };
  const sitemapPages = smUrls.filter(sameHost);

  // crawl
  const homeKey = normUrl(home.url);
  const queue: string[] = [homeKey], seen = new Set<string>([homeKey]);
  const enqueue = (u: string) => { try { const k = normUrl(u); if (!seen.has(k) && sameHost(k) && !STATIC_EXT.test(new URL(k).pathname) && seen.size < maxPages * 3) { seen.add(k); queue.push(k); } } catch { /* ignore */ } };
  sitemapPages.forEach(enqueue);
  const pages: PageData[] = [];
  let skipped = 0, started = 0;
  const homeData = analyzePage(home.body, { url: home.url, status: home.status, ms: home.ms, headers: home.headers });
  pages.push(homeData); started++; queue.shift();
  homeData.internalLinks.forEach(enqueue);

  const worker = async () => {
    while (started < maxPages) {
      const next = queue.shift();
      if (!next) { if (queue.length === 0) await sleep(20); if (queue.length === 0) return; continue; }
      if (!isAllowed(rules, BOT_UA, new URL(next).pathname)) { skipped++; continue; }
      started++;
      await sleep(delay);
      const r = await safeFetch(next, { ...fetchOpts, requireHtml: true });
      if (r.ok && r.status < 400) {
        const d = analyzePage(r.body, { url: r.url, status: r.status, ms: r.ms, headers: r.headers });
        pages.push(d); d.internalLinks.forEach(enqueue); o.onProgress?.(pages.length, Math.min(maxPages, seen.size));
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    ok: true, origin, startUrl: home.url, pages, skippedByRobots: skipped, capped: pages.length >= maxPages && queue.length > 0,
    files: {
      robots: { present: robotsPresent, blocksAll: !isAllowed(rules, BOT_UA, "/"), blockedBots, sitemaps: rules.sitemaps },
      sitemap: { present: smUrls.length > 0, urlCount: smUrls.length, url: smUrls.length ? smUrl : null },
    },
  };
}
