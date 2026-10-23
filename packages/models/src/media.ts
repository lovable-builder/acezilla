/**
 * Media-buying rules. What each ad platform accepts, what a campaign needs before it can run, and what to do with a campaign
 * that is already running. Everything here is advice and checks: acezilla never creates or changes a campaign by itself.
 */
export type MediaPlatform = "meta" | "google" | "tiktok";

export interface MediaOption { id: string; label: string; hint: string; recommended?: boolean }
export interface PlatformSpec {
  label: string; short: string; pitch: string;
  formats: (MediaOption & { items?: { min: number; max: number } })[];
  /** Goals the platform offers. `needs` is something the account must already have set up. */
  goals: (MediaOption & { needs?: string })[];
  /** What the platform optimises delivery for, per goal id. */
  optimizations?: Record<string, MediaOption[]>;
  /** Character limits for the text fields of an ad. */
  text: { primary?: number; headline?: number; description?: number; caption?: number };
  ctas: string[];
  /** Plain requirements to meet before launch, by format id or "all". */
  requirements: Record<string, string[]>;
}

export const MEDIA_SPECS: Record<MediaPlatform, PlatformSpec> = {
  meta: {
    label: "Meta · Facebook & Instagram", short: "Meta", pitch: "Feed and Stories on Facebook and Instagram. The broadest reach for products people can see.",
    formats: [
      { id: "single", label: "Single image or video", hint: "One creative. The simplest way to start." },
      { id: "carousel", label: "Carousel of products", hint: "2 to 10 products in one ad.", items: { min: 2, max: 10 } },
    ],
    goals: [
      { id: "sales", label: "Sales", hint: "Optimise for purchases on your site.", needs: "Meta Pixel" },
      { id: "traffic", label: "Visits", hint: "Send people to your site." },
      { id: "engagement", label: "Engagement", hint: "Likes, comments, messages." },
      { id: "awareness", label: "Reach", hint: "Show the ad to as many people as possible." },
    ],
    optimizations: { sales: [
      { id: "add_to_cart", label: "Add to cart", hint: "Gives the platform more events to learn from, so it learns faster.", recommended: true },
      { id: "purchase", label: "Purchase", hint: "Best match to real sales, but needs more volume to learn." },
      { id: "initiate_checkout", label: "Started checkout", hint: "A middle step between cart and purchase." },
    ] },
    text: { primary: 125, headline: 40, description: 30 },
    ctas: ["Shop now", "Order now", "Learn more", "Get offer", "Sign up", "Contact us", "Send message", "Book now"],
    requirements: { all: ["An image at 1:1, 4:5 or 9:16, or a short video", "A Meta Pixel on your site if the goal is Sales"], carousel: ["At least 2 and at most 10 products, each with its own image"] },
  },
  tiktok: {
    label: "TikTok", short: "TikTok", pitch: "Short vertical video. Best when you have a video that feels native to the feed.",
    formats: [{ id: "video", label: "Vertical video", hint: "9:16, 9 to 30 seconds." }],
    goals: [
      { id: "sales", label: "Sales from your site", hint: "Optimise for purchases or the closest event your pixel records.", needs: "TikTok Pixel" },
      { id: "traffic", label: "Visits", hint: "Send people to your site." },
    ],
    optimizations: { sales: [
      { id: "purchase", label: "Complete payment", hint: "The strongest signal, if your pixel records it.", recommended: true },
      { id: "initiate_checkout", label: "Initiate checkout", hint: "Use it if purchases are still rare." },
      { id: "add_to_cart", label: "Add to cart", hint: "Use it for a new pixel with few events." },
      { id: "view_content", label: "View content", hint: "The weakest signal. Use it only to get started." },
    ] },
    text: { caption: 100 },
    ctas: [],
    requirements: { all: ["A vertical 9:16 video, 9 to 30 seconds long", "A TikTok Pixel on your site if the goal is Sales"] },
  },
  google: {
    label: "Google Ads", short: "Google", pitch: "Shows when people search, and across Google's sites and apps.",
    formats: [
      { id: "pmax", label: "Performance Max", hint: "Google places the ad across all its channels. Best for sales.", recommended: true },
      { id: "search", label: "Search", hint: "Text ads on search results for the keywords you choose." },
    ],
    goals: [{ id: "sales", label: "Sales", hint: "Optimise for purchases." }, { id: "traffic", label: "Visits", hint: "Send people to your site." }],
    text: { headline: 30, description: 90 },
    ctas: [],
    requirements: { pmax: ["A square logo", "Product or lifestyle images", "A product feed in Google Merchant Center helps"], search: ["Up to 20 keywords", "A maximum price per click"], all: [] },
  },
};

export const MEDIA_PLATFORMS = Object.keys(MEDIA_SPECS) as MediaPlatform[];
export const SEARCH_MAX_KEYWORDS = 20;

/**
 * Smallest daily budget worth setting, in US dollars, per platform and goal. Platforms enforce their own minimums and change
 * them, so these are a guide for a sensible test, not the platform's rule. Check the platform before launch.
 */
const FLOOR_USD: Record<MediaPlatform, { default: number; sales?: number }> = {
  meta: { default: 1, sales: 3 }, tiktok: { default: 4 }, google: { default: 1.2 },
};
/** Daily budget that gives a new campaign room to learn, in US dollars. */
const RECOMMENDED_USD: Record<MediaPlatform, number> = { meta: 6, tiktok: 8, google: 6 };
/** Approximate units of currency per US dollar. Only for sizing budgets, never for reporting money. */
const PER_USD: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, PLN: 3.9, EGP: 49, AED: 3.67, SAR: 3.75, CAD: 1.37, AUD: 1.5, CHF: 0.88, SEK: 10.5, NOK: 10.7, DKK: 6.9, CZK: 23, HUF: 360, RON: 4.6, TRY: 34, INR: 83, JPY: 150, BRL: 5 };
const roundUp = (n: number) => (n >= 100 ? Math.ceil(n / 10) * 10 : Math.ceil(n));

export interface BudgetGuide { floor: number; recommended: number; currency: string }
/** The smallest sensible and the recommended daily budget in the workspace currency, or null for a currency we cannot size. */
export function budgetGuide(platform: MediaPlatform, goal: string, currency: string): BudgetGuide | null {
  const rate = PER_USD[currency.toUpperCase()];
  if (!rate) return null;
  const f = FLOOR_USD[platform];
  return { floor: roundUp((goal === "sales" ? f.sales ?? f.default : f.default) * rate), recommended: roundUp(RECOMMENDED_USD[platform] * rate), currency: currency.toUpperCase() };
}
/** What a campaign must have before it can run, for the chosen platform and format. */
export function launchChecklist(platform: MediaPlatform, format: string, goal: string): string[] {
  const s = MEDIA_SPECS[platform];
  const needs = s.goals.find((g) => g.id === goal)?.needs;
  return [...(s.requirements.all ?? []), ...(s.requirements[format] ?? [])].filter((r) => !/Pixel/.test(r) || (!!needs && r.includes(needs)));
}

// ---------------- what to do with a running campaign ----------------

export type AdviceKind = "stop" | "scale" | "watch" | "too_early" | "restore" | "paused";
export interface Advice { kind: AdviceKind; label: string; reason: string }
export const ROAS_GOOD = 2, ROAS_SCALE = 2.5, ROAS_LOSING = 1, SCALE_STEP = 0.2;

/** A campaign has to spend this much (in US dollars) before there is enough to judge it. */
export const MIN_SPEND_TO_JUDGE_USD = 5;
export const minSpendToJudge = (currency: string) => roundUp(MIN_SPEND_TO_JUDGE_USD * (PER_USD[currency.toUpperCase()] ?? 1));

/**
 * The advice for one campaign over the period: stop what loses money, wait on what has not spent enough, scale what clearly
 * earns, and offer to bring back a paused campaign that used to earn. The numbers are the platform's own, so treat ROAS as a signal.
 */
export function adviseCampaign(c: { status: string; spend: number; roas: number | null }, o: { currency: string; minSpend?: number }): Advice {
  const min = o.minSpend ?? minSpendToJudge(o.currency);
  const active = c.status.toLowerCase() === "active";
  const enough = c.spend >= min;
  const roas = c.roas ?? 0;
  if (!active) {
    return enough && roas >= ROAS_SCALE
      ? { kind: "restore", label: "Bring back?", reason: `It is paused, but it earned ${roas.toFixed(1)}x on ${Math.round(c.spend)} spent.` }
      : { kind: "paused", label: "Paused", reason: "Paused, and nothing suggests restarting it." };
  }
  if (!enough) return { kind: "too_early", label: "Too early", reason: `Only ${Math.round(c.spend)} spent so far. Give it more before deciding.` };
  if (roas < ROAS_LOSING) return { kind: "stop", label: "Stop", reason: `It returns ${roas.toFixed(1)}x, so it loses money on what the platform reports.` };
  if (roas >= ROAS_SCALE) return { kind: "scale", label: `Scale +${SCALE_STEP * 100}%`, reason: `It returns ${roas.toFixed(1)}x. Raise the daily budget by about ${SCALE_STEP * 100}% and watch it.` };
  return { kind: "watch", label: "Watch", reason: `It returns ${roas.toFixed(1)}x. Not clearly losing, not clearly winning.` };
}

/** The campaigns that need a person today, biggest spenders first. Campaigns to watch or wait on are left out. */
export function todaysDecisions<T extends { name: string; status: string; spend: number; roas: number | null }>(cs: T[], o: { currency: string; limit?: number }): { campaign: T; advice: Advice }[] {
  return cs.map((campaign) => ({ campaign, advice: adviseCampaign(campaign, o) }))
    .filter((x) => x.advice.kind === "stop" || x.advice.kind === "scale" || x.advice.kind === "restore")
    .sort((a, b) => b.campaign.spend - a.campaign.spend).slice(0, o.limit ?? 8);
}
export const roasTone = (roas: number | null): "good" | "ok" | "bad" | "none" => (roas === null ? "none" : roas >= ROAS_GOOD ? "good" : roas >= ROAS_LOSING ? "ok" : "bad");
