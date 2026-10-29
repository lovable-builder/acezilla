/**
 * Competitor ads. Nobody can see a competitor's spend or sales, so "best performing" is never claimed.
 * What can be seen is how long an ad has run, how many versions of it exist and what it says. A long-running ad is
 * probably earning its keep (people rarely pay for an ad that loses money for two months), and that is all we infer.
 */

export const ANGLES = [
  { id: "discount", label: "Discount or sale" },
  { id: "free_shipping", label: "Free shipping or fast delivery" },
  { id: "proof", label: "Reviews or social proof" },
  { id: "ugc", label: "Real customer or creator video" },
  { id: "demo", label: "Product demo or how it works" },
  { id: "bundle", label: "Bundle or multi-buy" },
  { id: "urgency", label: "Urgency or limited stock" },
  { id: "story", label: "Brand story or values" },
  { id: "other", label: "Something else" },
] as const;
export type AngleId = (typeof ANGLES)[number]["id"];
export const ANGLE_LABEL: Record<string, string> = Object.fromEntries(ANGLES.map((a) => [a.id, a.label]));

export const AD_SOURCES = [
  { id: "meta", label: "Facebook / Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google" },
  { id: "allegro", label: "Allegro" },
  { id: "other", label: "Other" },
] as const;
export const SOURCE_LABEL: Record<string, string> = Object.fromEntries(AD_SOURCES.map((s) => [s.id, s.label]));

export interface CompetitorAd {
  id: string; competitorId: string; platform: string; startedOn: string | null; endedOn: string | null;
  stillRunning: boolean; variants: number; angle: string;
}

/** Days from the start date to the end date, counting both ends. A running ad counts to today. Null when it cannot be known. */
export function daysRunning(ad: Pick<CompetitorAd, "startedOn" | "endedOn" | "stillRunning">, today: string): number | null {
  if (!ad.startedOn) return null;
  const end = ad.stillRunning ? today : ad.endedOn;
  if (!end) return null;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${ad.startedOn}T00:00:00Z`)) / 86400000 + 1;
  return Number.isFinite(days) && days >= 1 ? Math.round(days) : null;
}

export const LONG_RUN = 60, HOLDING = 30, QUICK_STOP = 14;

export type Signal = "long_runner" | "holding" | "testing" | "short_run" | "stopped_early" | "unknown";

export const SIGNAL: Record<Signal, { label: string; hint: string }> = {
  long_runner: { label: "Long runner", hint: `Has run ${LONG_RUN} days or more. Likely paying for itself.` },
  holding: { label: "Holding up", hint: `Has run ${HOLDING} to ${LONG_RUN - 1} days. Not stopped, which is a good sign.` },
  testing: { label: "Still testing", hint: `Running for under ${HOLDING} days. Too early to say.` },
  short_run: { label: "Short run", hint: `Ran ${QUICK_STOP} to ${HOLDING - 1} days and stopped. No clear verdict.` },
  stopped_early: { label: "Stopped early", hint: `Stopped within ${QUICK_STOP} days. Probably did not work.` },
  unknown: { label: "Dates missing", hint: "Add the start date (and the end date if it stopped) to judge it." },
};

export function signalFor(days: number | null, stillRunning: boolean): Signal {
  if (days === null) return "unknown";
  if (days >= LONG_RUN) return "long_runner";
  if (stillRunning) return days >= HOLDING ? "holding" : "testing";
  if (days < QUICK_STOP) return "stopped_early";
  return days >= HOLDING ? "holding" : "short_run";
}

/** Longest-running first, then the most versions. Ads without dates go last. */
export function rankAds<T extends CompetitorAd>(ads: T[], today: string): (T & { days: number | null; signal: Signal })[] {
  return ads
    .map((a) => { const days = daysRunning(a, today); return { ...a, days, signal: signalFor(days, a.stillRunning) }; })
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || b.variants - a.variants);
}

export interface AngleRow { angle: string; ads: number; competitors: number; longRunners: number }

/** Which messages competitors lean on, most used first. Long runners show which of those messages have lasted. */
export function angleSummary(ads: (CompetitorAd & { signal: Signal })[]): AngleRow[] {
  const by = new Map<string, { ads: number; comps: Set<string>; long: number }>();
  for (const a of ads) {
    const r = by.get(a.angle) ?? { ads: 0, comps: new Set<string>(), long: 0 };
    r.ads += 1; r.comps.add(a.competitorId);
    if (a.signal === "long_runner") r.long += 1;
    by.set(a.angle, r);
  }
  return [...by].map(([angle, r]) => ({ angle, ads: r.ads, competitors: r.comps.size, longRunners: r.long }))
    .sort((a, b) => b.longRunners - a.longRunners || b.ads - a.ads);
}

/** Link that opens a platform's public ad library on this competitor. Null when we cannot build a reliable search link. */
export function libraryLink(source: string, name: string, country = "PL", website?: string | null): string | null {
  const q = encodeURIComponent(name.trim());
  if (source === "meta") return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${q}&search_type=keyword_unordered`;
  if (source === "tiktok") return "https://library.tiktok.com/ads";
  if (source === "google") {
    // Google files ads under the advertiser's legal name, so the website's domain finds them more reliably than the brand name.
    const domain = websiteDomain(website);
    return `https://adstransparency.google.com/?region=${country}${domain ? `&domain=${encodeURIComponent(domain)}` : ""}`;
  }
  return null;
}

/** "https://www.Acme.pl/shop" gives "acme.pl". Null when it does not look like a website. */
export function websiteDomain(website: string | null | undefined): string | null {
  const w = (website ?? "").trim();
  if (!w) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch { return null; }
}

// ---- Importing ads from Meta's public Ad Library ----

const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

/** True when the library's page name is the competitor, ignoring case, spaces and punctuation: "ACME Home" matches "Acme-Home Poland". */
export function pageMatches(pageName: string, competitor: string): boolean {
  const a = squash(pageName), b = squash(competitor);
  return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a));
}

/** A guess at the message from the ad's words (Polish and English). It is a starting point; the person can change it. */
export function guessAngle(text: string): AngleId {
  const t = text.toLowerCase();
  const has = (...w: RegExp[]) => w.some((r) => r.test(t));
  if (has(/darmow\w* (dostaw|wysy)/, /free (shipping|delivery)/, /dostaw\w* (w|od) \d+ ?(h|godz)/, /wysy[łl]ka (w|od) 24/)) return "free_shipping";
  if (has(/\d+ ?za ?\d+/, /\b[23]\s?\+\s?1\b/, /zestaw/, /bundle/, /buy \d+ get/)) return "bundle";
  if (has(/ostatni\w* (sztuk|dni)/, /limitowan/, /tylko dzi[sś]/, /ko[nń]czy si[eę]/, /last chance/, /ends (today|soon|tonight)/, /while (stocks|supplies) last/, /\bdo (niedzieli|poniedzia|pi[aą]tku)/)) return "urgency";
  if (has(/-\s?\d+ ?%/, /\d+ ?% (taniej|rabat|zni[zż]k|off)/, /rabat/, /promocj/, /wyprzeda[zż]/, /\bsale\b/, /zni[zż]k/, /discount/, /kod\b/)) return "discount";
  if (has(/opini/, /recenz/, /review/, /\d[.,]\d ?\/ ?5/, /zadowolon/, /polecan/, /tysi[aą]c\w* (klient|os[oó]b)/, /★|⭐/)) return "proof";
  if (has(/jak (to )?dzia[lł]a/, /how (it )?works/, /zobacz jak/, /demo\b/)) return "demo";
  if (has(/nasza historia/, /our story/, /rodzinn/, /misj[aię]/, /handmade|r[eę]cznie/)) return "story";
  return "other";
}

export interface LibraryAd { id: string; startedOn: string | null; endedOn: string | null; text: string; headline: string; reach: number | null }
export interface ImportedAd {
  /** Stable per competitor, so importing again updates the same row instead of adding another. */ externalId: string;
  libraryId: string; link: string; startedOn: string | null; endedOn: string | null; stillRunning: boolean; variants: number;
  headline: string; text: string; angle: AngleId; reach: number | null;
}

const copyKey = (a: LibraryAd) => squash((a.text || a.headline).slice(0, 120)) || a.id;

/**
 * The library lists every version of an ad separately. Versions with the same words count as one ad with several variants:
 * it started on the earliest start, it is still running if any version is, and it stopped on the latest stop.
 */
export function groupLibraryAds(ads: LibraryAd[]): ImportedAd[] {
  const by = new Map<string, LibraryAd[]>();
  for (const a of ads) by.set(copyKey(a), [...(by.get(copyKey(a)) ?? []), a]);
  const out: ImportedAd[] = [];
  for (const [key, list] of by) {
    const dated = list.filter((a) => a.startedOn).sort((a, b) => a.startedOn!.localeCompare(b.startedOn!));
    const first = dated[0] ?? list[0]!;
    const running = list.some((a) => !a.endedOn);
    const ends = list.map((a) => a.endedOn).filter((d): d is string => !!d).sort();
    out.push({
      externalId: `meta|${key.slice(0, 80)}`, libraryId: first.id, link: `https://www.facebook.com/ads/library/?id=${first.id}`,
      startedOn: first.startedOn, endedOn: running ? null : ends[ends.length - 1] ?? null, stillRunning: running, variants: list.length,
      headline: first.headline, text: first.text, angle: guessAngle(`${first.text} ${first.headline}`),
      reach: list.reduce<number | null>((s, a) => (a.reach === null ? s : (s ?? 0) + a.reach), null),
    });
  }
  return out;
}
