/**
 * Media buyer strategy map. Pure maths and rules; the words live in the web app.
 * Everything here is a suggestion from the user's own numbers. Nothing is sent to an ad platform.
 * Numbers that are rules of thumb rather than facts are named as such in the constants below.
 */

export type Goal = "sales" | "profit" | "launch" | "stock";
export type Stage = "starting" | "growing" | "scaling";
export const GOALS: { id: Goal; label: string; hint: string }[] = [
  { id: "sales", label: "Sell more", hint: "More orders at a cost you can afford" },
  { id: "profit", label: "Earn more profit", hint: "Fewer, better-paying sales" },
  { id: "launch", label: "Launch a product", hint: "Get a new product known" },
  { id: "stock", label: "Clear stock", hint: "Turn what is on the shelf into cash" },
];
export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "starting", label: "Starting out", hint: "Under about 30 orders a month" },
  { id: "growing", label: "Growing", hint: "30 to 300 orders a month" },
  { id: "scaling", label: "Scaling", hint: "Over 300 orders a month" },
];

/** Suggested stage from monthly orders, so the page starts in the right place. The person can change it. */
export function stageFor(ordersPerMonth: number): Stage {
  return ordersPerMonth >= 300 ? "scaling" : ordersPerMonth >= 30 ? "growing" : "starting";
}

export type Lane = "find" | "win" | "close" | "keep";
export const LANES: { id: Lane; label: string; hint: string }[] = [
  { id: "find", label: "Find", hint: "People who have not heard of you" },
  { id: "win", label: "Win", hint: "People searching for what you sell" },
  { id: "close", label: "Close", hint: "People ready to buy" },
  { id: "keep", label: "Keep", hint: "People who already bought" },
];

export type NodeId = "meta_prospecting" | "tiktok_prospecting" | "seo_content" | "google_search" | "google_shopping" | "meta_retargeting" | "allegro_ads" | "store" | "email";
export type PlatformId = "meta" | "tiktok" | "google" | "allegro";
export interface NodeDef { id: NodeId; lane: Lane; name: string; platform: PlatformId | null; /** Takes ad budget. */ paid: boolean }
export const NODES: NodeDef[] = [
  { id: "meta_prospecting", lane: "find", name: "Facebook & Instagram: new people", platform: "meta", paid: true },
  { id: "tiktok_prospecting", lane: "find", name: "TikTok: new people", platform: "tiktok", paid: true },
  { id: "seo_content", lane: "find", name: "Google free results", platform: null, paid: false },
  { id: "google_search", lane: "win", name: "Google Search ads", platform: "google", paid: true },
  { id: "google_shopping", lane: "win", name: "Google Shopping", platform: "google", paid: true },
  { id: "meta_retargeting", lane: "close", name: "Facebook & Instagram: reminders", platform: "meta", paid: true },
  { id: "allegro_ads", lane: "close", name: "Allegro Ads", platform: "allegro", paid: true },
  { id: "store", lane: "close", name: "Your shop", platform: null, paid: false },
  { id: "email", lane: "keep", name: "Email to past buyers", platform: null, paid: false },
];
export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, NodeDef>;
export const PAID_NODES = NODES.filter((n) => n.paid).map((n) => n.id);

// ---- Break-even maths ----

/** Margin is the share of the net sale left after goods, fees and shipping, before ads. */
export interface Targets { breakEvenRoas: number | null; targetRoas: number | null; maxCpa: number | null; targetCpa: number | null }

/**
 * Break-even ROAS is 1 divided by the margin: at 40% margin every 1 of ads must bring back 2.5 of sales just to pay for itself.
 * The target adds a cushion so a bad week does not lose money. The most you can pay for one sale is order value times margin.
 */
export function targets(margin: number, cushion: number, aov: number): Targets {
  if (!(margin > 0 && margin < 1)) return { breakEvenRoas: null, targetRoas: null, maxCpa: null, targetCpa: null };
  const be = 1 / margin, c = Math.max(0, cushion);
  const maxCpa = aov > 0 ? aov * margin : null;
  return { breakEvenRoas: be, targetRoas: be * (1 + c), maxCpa, targetCpa: maxCpa === null ? null : maxCpa / (1 + c) };
}

// ---- Budget split ----

/** Starting weights for each paid node. A common way to begin, not a law; the person drags the sliders. */
const BASE: Record<string, number> = { meta_prospecting: 30, tiktok_prospecting: 15, google_shopping: 25, google_search: 15, meta_retargeting: 10, allegro_ads: 15 };

/** Whole percentages over the chosen paid nodes that add up to 100. */
export function defaultShares(goal: Goal, stage: Stage, chosen: NodeId[]): Partial<Record<NodeId, number>> {
  const w: Record<string, number> = {};
  for (const id of chosen) {
    if (!NODE_BY_ID[id]?.paid) continue;
    let v = BASE[id] ?? 10;
    const find = id === "meta_prospecting" || id === "tiktok_prospecting", capture = id === "google_shopping" || id === "google_search";
    if (goal === "launch" && find) v *= 1.4;
    if (goal === "stock" && (capture || id === "meta_retargeting")) v *= 1.3;
    if (goal === "profit" && capture) v *= 1.3;
    if (goal === "profit" && id === "tiktok_prospecting") v *= 0.7;
    // Reminders need an audience to remind: too few visitors means the money is wasted.
    if (id === "meta_retargeting") v *= stage === "starting" ? 0 : stage === "scaling" ? 1.5 : 1;
    w[id] = v;
  }
  return roundShares(w);
}

/** Scales weights to whole percentages that add up to exactly 100; the remainder goes to the biggest. */
export function roundShares(w: Record<string, number>): Partial<Record<NodeId, number>> {
  const ids = Object.keys(w).filter((k) => w[k]! > 0), total = ids.reduce((s, k) => s + w[k]!, 0);
  const out: Partial<Record<NodeId, number>> = {};
  if (!ids.length || total <= 0) return out;
  let used = 0;
  for (const k of ids) { const v = Math.floor((w[k]! / total) * 100); out[k as NodeId] = v; used += v; }
  const biggest = [...ids].sort((a, b) => w[b]! - w[a]!)[0]!;
  out[biggest as NodeId] = (out[biggest as NodeId] ?? 0) + (100 - used);
  return out;
}

/** Money per node. Shares are renormalised over the nodes in the plan, so the amounts always add up to the budget. */
export function splitBudget(budget: number, shares: Partial<Record<NodeId, number>>, chosen: NodeId[]): Partial<Record<NodeId, number>> {
  const ids = chosen.filter((id) => NODE_BY_ID[id]?.paid && (shares[id] ?? 0) > 0), total = ids.reduce((s, id) => s + shares[id]!, 0);
  const out: Partial<Record<NodeId, number>> = {};
  if (!(budget > 0) || total <= 0) return out;
  for (const id of ids) out[id] = Math.round((budget * shares[id]!) / total);
  return out;
}

// ---- What the platforms report ----

export interface Stats { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }
export interface PlatformFacts {
  /** Last 14 days and the 7 days before the last 7, for week-on-week changes. */
  d14: Stats; w1: Stats; w0: Stats;
  /**
   * Whether this platform ever tells us about sales. Allegro Ads reports spend only, and a TikTok CSV may have no sales column,
   * so for them "0 sales" means "not reported", never "none happened".
   */
  reportsSales: boolean;
  /** The login expired, so what we hold may be old. */ needsReauth?: boolean;
  /** Last day we hold data for, when it stops before the other platforms'. */ staleSince?: string | null;
  /** Return measured on real store orders (modeled ROAS). Null when no order carries this platform's tags. */ storeRoas: number | null;
}
export const ratios = (s: Stats) => ({
  ctr: s.impressions > 0 ? s.clicks / s.impressions : null,
  cpc: s.clicks > 0 ? s.spend / s.clicks : null,
  cpa: s.conversions > 0 ? s.spend / s.conversions : null,
  roas: s.spend > 0 && s.revenue > 0 ? s.revenue / s.spend : null,
});

// ---- Rules: what to change, checked against the numbers ----

/** Rules of thumb, kept in one place so they can be seen and argued with. */
export const RULES = {
  /** Judge a platform only after it has spent this many times the most you can pay for one sale. */ evidenceCpa: 3,
  /** Sales in two weeks before ROAS is trusted enough to scale. */ scaleMinSales: 20,
  /** ROAS must be this steady week on week before scaling. */ steady: 0.15,
  /** Cost per click up this much week on week is worth a look. */ cpcUp: 0.25,
  /** Click rate down this much week on week suggests a tired ad. */ ctrDown: 0.2,
  /** Views and clicks needed before a week-on-week change means anything. */ minImpressions: 5000, minClicks: 100,
};

export type RuleStatus = "act" | "watch" | "info" | "ok" | "nodata";
export interface RuleResult { id: string; platform: PlatformId; status: RuleStatus; title: string; detail: string; action: string }

const pct = (n: number) => `${Math.abs(n * 100).toFixed(0)}%`;
const r2 = (n: number) => n.toFixed(2);
const change = (cur: number | null, prev: number | null) => (cur !== null && prev !== null && prev > 0 ? cur / prev - 1 : null);

/**
 * Checks one platform against the person's own break-even numbers.
 * Order matters: the most serious finding comes first. A platform that cannot be judged yet says so instead of guessing.
 */
export function evaluatePlatform(platform: PlatformId, f: PlatformFacts | undefined, t: Targets, fmt: (n: number) => string = (n) => n.toFixed(0)): RuleResult[] {
  const out: RuleResult[] = [];
  const add = (id: string, status: RuleStatus, title: string, detail: string, action: string) => out.push({ id, platform, status, title, detail, action });
  if (!f || f.d14.spend <= 0) {
    add("nodata", "nodata", "No spend in the last 14 days", "There is nothing to judge yet.", "Start small, then come back after a week of data.");
    return out;
  }
  const a = ratios(f.d14), w1 = ratios(f.w1), w0 = ratios(f.w0);
  const enough = t.maxCpa !== null && f.d14.spend >= RULES.evidenceCpa * t.maxCpa;
  const claimed = a.roas;

  // What we cannot know comes first, so no verdict below pretends otherwise.
  if (f.needsReauth) add("reauth", "watch", "Login expired", "The numbers below may be out of date.", "Reconnect this platform on the Connections page.");
  else if (f.staleSince) add("stale", "watch", "Data stops early", `The newest data we hold for this platform is from ${f.staleSince}, older than your other platforms.`, "Press Sync now on the Connections page, and check the account is still running ads.");
  if (!f.reportsSales) {
    add("spend_only", "info", "Reports spend, not sales", `${fmt(f.d14.spend)} spent in the last 14 days. This platform does not report sales to acezilla, so there is no return to judge here.`,
      platform === "allegro" ? "Judge Allegro ads by cost of sale and profit per offer on the Attribution page." : "Upload a report that includes sales and revenue, or connect the platform, to get a verdict.");
  } else if (t.breakEvenRoas === null) {
    add("need_margin", "info", "Set your margin to get verdicts", "Break-even depends on what you keep from each sale, and it is not saved yet.", "Drag the margin slider in Your numbers, or press the button that uses your own figures.");
  }

  if (f.reportsSales && t.breakEvenRoas !== null && t.maxCpa !== null) {
    if (f.d14.conversions === 0 && f.d14.spend >= 2 * t.maxCpa) {
      add("no_sales", "act", "Money spent, no sales reported", `${fmt(f.d14.spend)} spent in 14 days and the platform counted no sale.`, "Check the tracking first. If it works, pause the campaigns and fix the offer or the page before spending more.");
    } else if (enough && claimed !== null && claimed < t.breakEvenRoas) {
      add("below_breakeven", "act", "Below break-even", `Return is ${r2(claimed)}x by the platform's own count, and you need ${r2(t.breakEvenRoas)}x just to break even.${f.storeRoas !== null ? ` Your store's orders confirm ${r2(f.storeRoas)}x.` : ""}`, "Cut the budget by 20 to 30% and pause the weakest campaigns. Fix the ad or the offer before you scale.");
    } else if (enough && claimed !== null && f.storeRoas !== null && f.storeRoas < t.breakEvenRoas) {
      // Platforms count more sales than the store can confirm. When the store's tagged orders say the money is not coming back, believe the store.
      add("overclaim", "watch", "The platform and your store disagree", `The platform counts ${r2(claimed)}x, but orders carrying its tags confirm only ${r2(f.storeRoas)}x, under your break-even of ${r2(t.breakEvenRoas)}x.`, "Do not scale yet. Check that your ads are tagged and the platform's counting window is not too long. Trust the store's figure when they differ.");
    } else if (claimed !== null && f.d14.conversions >= RULES.scaleMinSales && t.targetRoas !== null && claimed >= t.targetRoas && (f.storeRoas === null || f.storeRoas >= t.breakEvenRoas)) {
      const steady = change(w1.roas, w0.roas);
      if (steady !== null && Math.abs(steady) <= RULES.steady) {
        add("scale", "act", "Ready to scale", `Return is ${r2(claimed)}x against a target of ${r2(t.targetRoas)}x, with ${f.d14.conversions} sales, and steady week on week.${f.storeRoas !== null ? ` Your store's orders confirm ${r2(f.storeRoas)}x.` : ""}`, "Raise the budget by 15 to 20%, no more often than every 3 to 4 days. Watch the return after each rise.");
      }
    } else if (claimed === null && f.d14.conversions > 0) {
      // Some platforms count actions such as page views as conversions, with no money attached.
      add("no_value", "watch", "Sales counted, but no value", `${f.d14.conversions} conversions in 14 days with no sale value attached, so the return cannot be checked.`, "Make sure the conversion carries the order total as its value, then check again.");
    }
    if (!out.some((r) => r.status === "act" || r.status === "watch") && f.d14.conversions < RULES.scaleMinSales) {
      add("thin", "watch", "Too few sales to judge", `${f.d14.conversions} sales in 14 days. One lucky or unlucky week would change the picture.`, "Change little. Let it run, and keep the number of campaigns small so each one gets enough sales to learn.");
    }
  }
  const cpcUp = change(w1.cpc, w0.cpc);
  if (f.w1.clicks >= RULES.minClicks && f.w0.clicks >= RULES.minClicks && cpcUp !== null && cpcUp >= RULES.cpcUp) {
    add("cpc_up", "watch", "Clicks are getting dearer", `Cost per click is up ${pct(cpcUp)} on last week (${r2(w0.cpc!)} to ${r2(w1.cpc!)}).`, "Rivals may be bidding more, or the audience is tired. Try a fresh ad and check the audience before raising bids.");
  }
  const ctrDown = change(w1.ctr, w0.ctr);
  if (f.w1.impressions >= RULES.minImpressions && f.w0.impressions >= RULES.minImpressions && ctrDown !== null && ctrDown <= -RULES.ctrDown) {
    add("ctr_down", "watch", "Fewer people click", `Click rate is down ${pct(ctrDown)} on last week.`, "The ad is probably tired. Add one new picture, video or headline and let the old one rest.");
  }
  if (!out.length) add("ok", "ok", "Healthy", claimed !== null ? `Return is ${r2(claimed)}x by the platform's count${f.storeRoas !== null ? ` and ${r2(f.storeRoas)}x on your store's orders` : ""}.${t.breakEvenRoas !== null ? ` Break-even is ${r2(t.breakEvenRoas)}x.` : ""}` : "No problem found.", "Keep the routine: check weekly and change one thing at a time.");
  return out;
}

export const STATUS_ORDER: Record<RuleStatus, number> = { act: 0, watch: 1, info: 2, nodata: 3, ok: 4 };
/** The most serious result, used as the colour of a node on the map. */
export function worst(results: RuleResult[]): RuleStatus {
  return results.reduce<RuleStatus>((w, r) => (STATUS_ORDER[r.status] < STATUS_ORDER[w] ? r.status : w), "ok");
}

// ---- Ground floor: what must be in place before the plan can be judged ----

export interface Setup {
  adConnected: boolean; storeConnected: boolean; analyticsConnected: boolean; merchantConnected: boolean; searchConsoleConnected: boolean;
  /** Some website orders carry campaign tags, so ROAS can be measured on real orders. */ ordersTagged: boolean;
  /** Only a website can tag its orders. Allegro marks its own orders, so a seller on Allegro alone has nothing to tag. */ taggingNeeded: boolean;
  /** The person saved their margin. */ marginSaved: boolean;
}
export interface FoundationStep { key: string; label: string; why: string; done: boolean; href: string; needs?: NodeId[] }

export function foundations(s: Setup, chosen: NodeId[]): FoundationStep[] {
  const has = (id: NodeId) => chosen.includes(id);
  const all: FoundationStep[] = [
    { key: "f:margin", label: "Know your margin", why: "Without it there is no break-even, and every number below is a guess.", done: s.marginSaved, href: "#numbers" },
    { key: "f:ads", label: "Connect an ad platform", why: "So the map can show real spend and returns.", done: s.adConnected, href: "/connections" },
    { key: "f:store", label: "Connect your store", why: "Real orders are the only honest measure of what ads earn.", done: s.storeConnected, href: "/connections" },
    { key: "f:analytics", label: "Connect Google Analytics", why: "Shows what visitors do after the click.", done: s.analyticsConnected, href: "/connections" },
  ];
  if (s.taggingNeeded) all.splice(3, 0, { key: "f:tags", label: "Tag your ads so website orders can be traced", why: "Orders that carry the campaign name give a return you can trust, not the platform's own count.", done: s.ordersTagged, href: "/attribution" });
  if (has("google_shopping")) all.push({ key: "f:merchant", label: "Connect Merchant Center", why: "Shopping ads only run on products Google approves.", done: s.merchantConnected, href: "/connections", needs: ["google_shopping"] });
  if (has("seo_content") || has("google_search")) all.push({ key: "f:search", label: "Connect Search Console", why: "Shows the exact words shoppers use, for ads and for your pages.", done: s.searchConsoleConnected, href: "/connections", needs: ["seo_content"] });
  return all;
}

// ---- Weekly mission, streak, score, badges ----

export interface MissionTask { id: string; label: string; where: string; href: string; nodes?: NodeId[] }
const MISSION: MissionTask[] = [
  { id: "spend", label: "Compare this week's spend with the plan", where: "Command center", href: "/dashboard" },
  { id: "profit", label: "For each platform, check the return against break-even", where: "Attribution", href: "/attribution" },
  { id: "worst", label: "Pause or fix the weakest campaign. Give the best one a little more", where: "Command center", href: "/dashboard" },
  { id: "creative", label: "Add one new ad to test", where: "Campaign builder", href: "/builder", nodes: ["meta_prospecting", "tiktok_prospecting", "meta_retargeting"] },
  { id: "feed", label: "Fix blocked products in Google Shopping", where: "Products", href: "/products", nodes: ["google_shopping"] },
  { id: "words", label: "Read the search words and use three of them in ads or titles", where: "SEO", href: "/seo", nodes: ["google_search", "seo_content"] },
  { id: "rivals", label: "Look at one competitor's newest ads", where: "Competitor ads", href: "/competitors" },
];

/** This week's tasks: the always-on ones plus those for the channels in the plan. */
export function missionFor(chosen: NodeId[]): MissionTask[] {
  return MISSION.filter((m) => !m.nodes || m.nodes.some((n) => chosen.includes(n)));
}

/** ISO week such as 2026-W44. Weeks start on Monday. */
export function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;            // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3);           // the Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
export const missionKey = (week: string, taskId: string) => `w:${week}:${taskId}`;

/** Weeks in a row in which every task was done. This week counts once it is complete; an unfinished week does not break the run. */
export function streak(done: ReadonlySet<string>, taskIds: string[], today: string): number {
  if (!taskIds.length) return 0;
  const complete = (date: string) => taskIds.every((t) => done.has(missionKey(weekKey(date), t)));
  let n = complete(today) ? 1 : 0;
  for (let back = 7; back <= 7 * 104; back += 7) {
    const d = new Date(new Date(`${today}T00:00:00Z`).getTime() - back * 86400000).toISOString().slice(0, 10);
    if (!complete(d)) break;
    n += 1;
  }
  return n;
}

export interface ScoreInput { foundationDone: number; foundationTotal: number; buildDone: number; buildTotal: number; missionDone: number; missionTotal: number; actRules: number; hasData: boolean }
const share = (a: number, b: number) => (b > 0 ? a / b : 0);

/** 0 to 100: ground floor 35, build steps 30, this week's mission 20, health 15 (no rule saying act now). */
export function strategyScore(s: ScoreInput): number {
  const health = s.hasData ? (s.actRules === 0 ? 1 : Math.max(0, 1 - s.actRules * 0.34)) : 0;
  return Math.round(35 * share(s.foundationDone, s.foundationTotal) + 30 * share(s.buildDone, s.buildTotal) + 20 * share(s.missionDone, s.missionTotal) + 15 * health);
}

export const LEVELS = [
  { at: 0, name: "Rookie buyer" }, { at: 25, name: "Optimizer" }, { at: 50, name: "Scaler" }, { at: 75, name: "Strategist" },
] as const;
export function levelFor(score: number) {
  const i = LEVELS.reduce((idx, l, k) => (score >= l.at ? k : idx), 0), next = LEVELS[i + 1] ?? null;
  return { name: LEVELS[i]!.name, next: next ? { name: next.name, pointsToGo: next.at - score } : null };
}

export interface Badge { id: string; label: string; hint: string; earned: boolean }
export function badges(s: { foundationDone: number; foundationTotal: number; marginSaved: boolean; buildDone: number; buildTotal: number; streak: number; actRules: number; hasData: boolean; missionComplete: boolean }): Badge[] {
  return [
    { id: "numbers", label: "Know your numbers", hint: "Save your margin to unlock break-even.", earned: s.marginSaved },
    { id: "ground", label: "Ground floor laid", hint: "Finish every ground-floor step.", earned: s.foundationTotal > 0 && s.foundationDone === s.foundationTotal },
    { id: "map", label: "Full map built", hint: "Tick every build step for the channels in your plan.", earned: s.buildTotal > 0 && s.buildDone === s.buildTotal },
    { id: "week", label: "Week cleared", hint: "Finish all of this week's mission.", earned: s.missionComplete || s.streak >= 1 },
    { id: "streak3", label: "Three-week streak", hint: "Clear the mission three weeks in a row.", earned: s.streak >= 3 },
    { id: "green", label: "All green", hint: "No rule says act now, with real data behind it.", earned: s.hasData && s.actRules === 0 },
  ];
}

// ---- Numbers read from the seller's own data ----

const DAY_MS = 86400000;
/** Orders per 30 days over the days we really have (at least 14, at most 90), so a young store is not divided by three months it has not lived. */
export function monthlyOrders(orders: number, firstDate: string | null, lastDate: string): number {
  if (orders <= 0 || !firstDate) return 0;
  const span = Math.round((Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / DAY_MS) + 1;
  return Math.round((orders * 30) / Math.min(90, Math.max(14, span)));
}

/**
 * What is left of a sale after fees and the goods, before ads, as a share of net sales.
 * Null unless every sold offer has a cost entered, because a missing cost would make the margin look better than it is.
 * It can be negative: the offers lose money before a cent goes to ads.
 */
export function marginFromTotals(t: { revenue: number; fees: number; goodsCost: number } | null, missingCosts: number): number | null {
  if (!t || !(t.revenue > 0) || missingCosts > 0) return null;
  return (t.revenue - t.fees - t.goodsCost) / t.revenue;
}
