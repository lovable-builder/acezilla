import type { DailyRow } from "./dashboard";

/** One day of one traffic channel from Google Analytics. */
export interface GaRow { date: string; channel: string; sessions: number; conversions: number; revenue: number }

/** Analytics sorts visits into default channel groups. These are the groups that ads produce, and which ad platforms feed them. */
export interface PaidGroup { id: string; label: string; gaChannels: string[]; adPlatforms: string[] }
export const PAID_GROUPS: PaidGroup[] = [
  // Meta and TikTok both arrive as "Paid Social", so they can only be compared together.
  { id: "paid-social", label: "Paid social (Meta and TikTok)", gaChannels: ["Paid Social"], adPlatforms: ["meta", "tiktok"] },
  { id: "google", label: "Google Ads", gaChannels: ["Paid Search", "Paid Shopping", "Paid Video", "Display", "Cross-network"], adPlatforms: ["google"] },
];

/** Share of ad clicks that normally show up as visits. Below this, too many clicks are lost before the page loads or tracking is broken. */
export const HEALTHY_MIN = 0.6;
/** Above this, Analytics counts more visits than the platform has clicks, which usually means tagging or attribution is off. */
export const HEALTHY_MAX = 1.3;
/** Fewer clicks than this say nothing: the share would be noise. */
export const MIN_CLICKS = 30;

export type Verdict = "ok" | "lost" | "over" | "too_little" | "no_visits" | "no_ad_data";
export interface CompareRow {
  id: string; label: string; spend: number; clicks: number; visits: number;
  /** Visits divided by clicks. Null when there are no clicks. */ ratio: number | null;
  costPerVisit: number | null; keyEvents: number; verdict: Verdict;
}
export interface ChannelTraffic { channel: string; visits: number; share: number; keyEvents: number; keyEventRate: number | null; revenue: number }
export interface Traffic {
  visits: number; keyEvents: number; keyEventRate: number | null; revenue: number;
  /** True when Analytics recorded any purchase revenue. */ hasRevenue: boolean;
  channels: ChannelTraffic[]; compare: CompareRow[];
  /** Visits per day, oldest first, for the whole period. */ series: { date: string; visits: number }[];
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function verdictFor(clicks: number, visits: number): Verdict {
  // Visits from paid channels but no clicks at all: the ad platform data is missing for these days, so there is nothing to compare.
  if (clicks === 0 && visits > 0) return "no_ad_data";
  if (clicks < MIN_CLICKS) return "too_little";
  if (visits === 0) return "no_visits";
  const r = visits / clicks;
  return r < HEALTHY_MIN ? "lost" : r > HEALTHY_MAX ? "over" : "ok";
}

/** Analytics visits for a period next to the clicks the ad platforms report for the same days. Both lists are filtered to [start, end]. */
export function buildTraffic(o: { ga: GaRow[]; ads: DailyRow[]; start: string; end: string }): Traffic {
  const ga = o.ga.filter((r) => r.date >= o.start && r.date <= o.end);
  const ads = o.ads.filter((r) => r.date >= o.start && r.date <= o.end);
  const by = new Map<string, { visits: number; keyEvents: number; revenue: number }>();
  const day = new Map<string, number>();
  for (const r of ga) {
    const c = by.get(r.channel) ?? { visits: 0, keyEvents: 0, revenue: 0 };
    c.visits += r.sessions; c.keyEvents += r.conversions; c.revenue += r.revenue; by.set(r.channel, c);
    day.set(r.date, (day.get(r.date) ?? 0) + r.sessions);
  }
  const visits = [...by.values()].reduce((s, c) => s + c.visits, 0), keyEvents = [...by.values()].reduce((s, c) => s + c.keyEvents, 0), revenue = [...by.values()].reduce((s, c) => s + c.revenue, 0);
  const channels = [...by].map(([channel, c]) => ({ channel, visits: c.visits, share: visits > 0 ? c.visits / visits : 0, keyEvents: c.keyEvents, keyEventRate: div(c.keyEvents, c.visits), revenue: c.revenue })).sort((a, b) => b.visits - a.visits);
  const compare = PAID_GROUPS.map((g) => {
    const mine = ads.filter((r) => g.adPlatforms.includes(r.platform));
    const clicks = mine.reduce((s, r) => s + r.clicks, 0), spend = mine.reduce((s, r) => s + r.spend, 0);
    const v = g.gaChannels.reduce((s, ch) => s + (by.get(ch)?.visits ?? 0), 0), ke = g.gaChannels.reduce((s, ch) => s + (by.get(ch)?.keyEvents ?? 0), 0);
    return { id: g.id, label: g.label, spend, clicks, visits: v, ratio: div(v, clicks), costPerVisit: div(spend, v), keyEvents: ke, verdict: verdictFor(clicks, v) };
  }).filter((r) => r.clicks > 0 || r.visits > 0);
  return { visits, keyEvents, keyEventRate: div(keyEvents, visits), revenue, hasRevenue: revenue > 0, channels, compare, series: [...day].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, visits: v })) };
}
