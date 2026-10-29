/** What people typed into Google before they reached the website (Google Search Console). */

export interface SearchQuery { query: string; clicks: number; impressions: number; position: number }

export interface SearchSummary { clicks: number; impressions: number; ctr: number | null; position: number | null; queries: number }

/** Totals over the words. Average position is weighted by views, because a word seen 10,000 times matters more than one seen twice. */
export function searchSummary(rows: SearchQuery[]): SearchSummary {
  let clicks = 0, impressions = 0, weighted = 0;
  for (const r of rows) { clicks += r.clicks; impressions += r.impressions; weighted += r.position * r.impressions; }
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null, position: impressions > 0 ? weighted / impressions : null, queries: rows.length };
}

export const NEAR_TOP_FROM = 5.5, NEAR_TOP_TO = 20, NEAR_TOP_MIN_VIEWS = 30;

/**
 * Words where the site already shows up, but not on the first page of results: average position 6 to 20 and seen at least 30 times.
 * A small push (a better title, a page about that exact word) moves these up, so the most seen come first.
 */
export function nearTop(rows: SearchQuery[], limit = 12): SearchQuery[] {
  return rows.filter((r) => r.position >= NEAR_TOP_FROM && r.position <= NEAR_TOP_TO && r.impressions >= NEAR_TOP_MIN_VIEWS)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position).slice(0, limit);
}

/** Words that brought the most visitors. */
export function topByClicks(rows: SearchQuery[], limit = 12): SearchQuery[] {
  return rows.filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, limit);
}
