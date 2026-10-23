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
const CAROUSEL_MIN = 2;

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

// ---------------- stock and the product a campaign sells ----------------

export type StockLevel = "out" | "low" | "ok" | "unknown";
/** From 1 to this many units counts as low stock. */
export const LOW_STOCK_MAX = 5;
/** Out, low, fine or not known. A quantity wins when the store reports one; otherwise the store's own in-stock flag. */
export function stockLevel(s: { qty: number | null | undefined; status?: string | null }): StockLevel {
  if (s.status === "outofstock") return "out";
  if (typeof s.qty === "number") return s.qty <= 0 ? "out" : s.qty <= LOW_STOCK_MAX ? "low" : "ok";
  return s.status === "instock" || s.status === "onbackorder" ? "ok" : "unknown";
}

export interface ProductRef { channel: string; productId: string; name: string; sku?: string | null }
const STOP = new Set(["the", "and", "for", "with", "dla", "oraz", "test", "set", "szt", "pcs", "new", "nowy", "nowa", "sale", "campaign", "kampania", "ads", "ad", "group", "grupa"]);
const words = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/gi, "l").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w)));

/**
 * Guesses which product a campaign sells from its name. Strict on purpose: at least two thirds of the campaign's meaningful
 * words must appear in one product's name, and no other product may match as well. A shop or brand name that is in every
 * product therefore never produces a match. A person's own link always wins over this.
 */
export function matchProduct(campaignName: string, products: ProductRef[]): ProductRef | null {
  const cw = words(campaignName);
  if (cw.size === 0) return null;
  const scored = products.map((p) => {
    if (p.sku && p.sku.length >= 3 && campaignName.toLowerCase().includes(p.sku.toLowerCase())) return { p, score: 1.01 };
    const pw = words(p.name);
    let hit = 0; for (const w of cw) if (pw.has(w)) hit++;
    return { p, score: hit / cw.size };
  }).filter((x) => x.score >= 0.66).sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[1]!.score >= scored[0]!.score) return null;
  return scored[0]!.p;
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
export function adviseCampaign(c: { status: string; spend: number; roas: number | null; stock?: StockLevel }, o: { currency: string; minSpend?: number }): Advice {
  const min = o.minSpend ?? minSpendToJudge(o.currency);
  const active = c.status.toLowerCase() === "active";
  const enough = c.spend >= min;
  const roas = c.roas ?? 0;
  if (!active) {
    return enough && roas >= ROAS_SCALE && c.stock !== "out" && c.stock !== "low"
      ? { kind: "restore", label: "Bring back?", reason: `It is paused, but it earned ${roas.toFixed(1)}x on ${Math.round(c.spend)} spent.` }
      : { kind: "paused", label: "Paused", reason: "Paused, and nothing suggests restarting it." };
  }
  if (c.stock === "out") return { kind: "stop", label: "Stop", reason: "Its product is out of stock, so the ad would send shoppers to something they cannot buy. Pause it until you restock." };
  if (!enough) return { kind: "too_early", label: "Too early", reason: `Only ${Math.round(c.spend)} spent so far. Give it more before deciding.` };
  if (roas < ROAS_LOSING) return { kind: "stop", label: "Stop", reason: `It returns ${roas.toFixed(1)}x, so it loses money on what the platform reports.` };
  if (roas >= ROAS_SCALE && c.stock === "low") return { kind: "watch", label: "Watch", reason: `It returns ${roas.toFixed(1)}x, but only a few units are left. Restock before you raise the budget.` };
  if (roas >= ROAS_SCALE) return { kind: "scale", label: `Scale +${SCALE_STEP * 100}%`, reason: `It returns ${roas.toFixed(1)}x. Raise the daily budget by about ${SCALE_STEP * 100}% and watch it.` };
  return { kind: "watch", label: "Watch", reason: `It returns ${roas.toFixed(1)}x. Not clearly losing, not clearly winning.` };
}

/** The campaigns that need a person today, biggest spenders first. Campaigns to watch or wait on are left out. */
export function todaysDecisions<T extends { name: string; status: string; spend: number; roas: number | null; stock?: StockLevel }>(cs: T[], o: { currency: string; limit?: number }): { campaign: T; advice: Advice }[] {
  return cs.map((campaign) => ({ campaign, advice: adviseCampaign(campaign, o) }))
    .filter((x) => x.advice.kind === "stop" || x.advice.kind === "scale" || x.advice.kind === "restore")
    .sort((a, b) => b.campaign.spend - a.campaign.spend).slice(0, o.limit ?? 8);
}
export const roasTone = (roas: number | null): "good" | "ok" | "bad" | "none" => (roas === null ? "none" : roas >= ROAS_GOOD ? "good" : roas >= ROAS_LOSING ? "ok" : "bad");

// ---------------- creative files (images and video) ----------------

export interface CreativeAsset { path: string; kind: "image" | "video"; name: string; w: number; h: number; seconds: number | null }
export const CREATIVE_LIMITS = { maxImages: 10, imageBytes: 8 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, imageTypes: ["image/jpeg", "image/png", "image/webp"], videoTypes: ["video/mp4", "video/quicktime"] };
/** Accepted file names inside a workspace folder, as written by the uploader. */
export const CREATIVE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp|mp4|mov)$/;
export const kindOfPath = (p: string): "image" | "video" => (/\.(mp4|mov)$/.test(p) ? "video" : "image");

const near = (v: number, target: number, tol: number) => Math.abs(v - target) <= tol;
export const ratioName = (w: number, h: number) => { const r = w / h; return near(r, 1, 0.03) ? "1:1" : near(r, 0.8, 0.03) ? "4:5" : near(r, 0.5625, 0.03) ? "9:16" : near(r, 1.91, 0.08) ? "1.91:1" : near(r, 1.7778, 0.04) ? "16:9" : `${w}×${h}`; };

export interface CreativeCheck { ok: boolean; text: string }
/**
 * Whether the files added so far suit the chosen platform and format. A failed check is advice, not a block: the draft can still be
 * written, and the person fixes the file before launch.
 */
export function creativeChecks(platform: MediaPlatform, format: string, assets: CreativeAsset[], o: { cards?: number; /** Carousel cards that already have a picture (listing photos and uploads together). */ cardImages?: number } = {}): CreativeCheck[] {
  const images = assets.filter((a) => a.kind === "image"), videos = assets.filter((a) => a.kind === "video");
  const out: CreativeCheck[] = [];
  if (platform === "tiktok") {
    const v = videos[0];
    if (!v) return [{ ok: false, text: "Add a vertical video, 9:16, 9 to 30 seconds long." }];
    out.push(near(v.w / v.h, 0.5625, 0.04) ? { ok: true, text: `The video is vertical (${ratioName(v.w, v.h)}).` } : { ok: false, text: `The video is ${ratioName(v.w, v.h)}. TikTok needs vertical 9:16.` });
    if (v.seconds !== null) out.push(v.seconds >= 9 && v.seconds <= 30 ? { ok: true, text: `The video is ${Math.round(v.seconds)} seconds, inside 9 to 30.` } : { ok: false, text: `The video is ${Math.round(v.seconds)} seconds. TikTok ads should be 9 to 30.` });
    return out;
  }
  if (platform === "meta") {
    if (format === "carousel") {
      if (videos.length) out.push({ ok: false, text: "A carousel uses images. Remove the video or switch to a single creative." });
      const need = Math.max(o.cards ?? 0, CAROUSEL_MIN), have = o.cardImages ?? images.length;
      out.push(have >= need ? { ok: true, text: `${have} cards, each with a picture.` } : { ok: false, text: `${have} of ${need} cards have a picture. A carousel needs at least ${CAROUSEL_MIN}.` });
    } else if (assets.length === 0) return [{ ok: false, text: "Add an image or a short video." }];
    for (const a of assets) { const r = ratioName(a.w, a.h); if (!["1:1", "4:5", "9:16"].includes(r)) out.push({ ok: false, text: `${a.name} is ${r}. Meta works best with 1:1, 4:5 or 9:16.` }); }
    if (out.every((c) => c.ok) || out.length === 0) out.push({ ok: true, text: "Files are in a ratio Meta shows well." });
    return out;
  }
  if (format === "pmax") {
    if (images.length === 0) return [{ ok: false, text: "Add images, and include a square logo." }];
    out.push(images.some((a) => near(a.w / a.h, 1, 0.03)) ? { ok: true, text: "There is a square (1:1) image for the logo." } : { ok: false, text: "Add a square (1:1) logo." });
    out.push(images.some((a) => near(a.w / a.h, 1.91, 0.1)) ? { ok: true, text: "There is a landscape (1.91:1) image." } : { ok: false, text: "A landscape (1.91:1) image is also needed." });
  }
  return out;
}

// ---------------- where an ad shows, and in what shape ----------------

export interface Placement {
  id: string; label: string; platform: MediaPlatform;
  /** Width divided by height of the picture or video area. */ ratio: number; ratioLabel: string;
  /** Fills the whole phone screen, with the app's own buttons drawn over it. */ fullScreen?: boolean;
}
export const PLACEMENTS: Placement[] = [
  { id: "fb_feed", label: "Facebook feed", platform: "meta", ratio: 1, ratioLabel: "1:1" },
  { id: "ig_feed", label: "Instagram feed", platform: "meta", ratio: 4 / 5, ratioLabel: "4:5" },
  { id: "stories", label: "Stories", platform: "meta", ratio: 9 / 16, ratioLabel: "9:16", fullScreen: true },
  { id: "reels", label: "Reels", platform: "meta", ratio: 9 / 16, ratioLabel: "9:16", fullScreen: true },
  { id: "foryou", label: "For You feed", platform: "tiktok", ratio: 9 / 16, ratioLabel: "9:16", fullScreen: true },
  { id: "search", label: "Search", platform: "google", ratio: 0, ratioLabel: "text" },
  { id: "display", label: "Display", platform: "google", ratio: 1.91, ratioLabel: "1.91:1" },
  { id: "square", label: "Square", platform: "google", ratio: 1, ratioLabel: "1:1" },
];
/** The placements worth previewing for a platform and format. Search ads are text only. */
export function placementsFor(platform: MediaPlatform, format: string): Placement[] {
  const all = PLACEMENTS.filter((p) => p.platform === platform);
  if (platform === "google") return format === "search" ? all.filter((p) => p.id === "search") : all.filter((p) => p.id !== "search");
  if (platform === "meta" && format === "carousel") return all.filter((p) => p.id === "fb_feed" || p.id === "ig_feed");
  return all;
}
/** How a file of this shape sits in a placement: it fits, or the platform will crop it (or add bars). */
export function fitNote(fileRatio: number | null, p: Placement): { fits: boolean; text: string } | null {
  if (fileRatio === null || p.ratio === 0) return null;
  return Math.abs(fileRatio - p.ratio) <= 0.04
    ? { fits: true, text: `Your file is ${p.ratioLabel}: it fills this placement.` }
    : { fits: false, text: `This placement is ${p.ratioLabel}. Your file is ${ratioName(Math.round(fileRatio * 1000), 1000)}, so there is empty space around it here. The platform may crop it to fill or add bars, so use a ${p.ratioLabel} file to control how it looks.` };
}
