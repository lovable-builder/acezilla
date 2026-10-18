import { emptyDataset, type Dataset } from "./dataset";
import type { Platform } from "./types";

/** Small deterministic PRNG so demo data is stable and tests are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec { platform: Platform; name: string; objective: string; spend: number; roas: number; ctr: number; cpm: number; aov: number; ads: number; quirk?: "spike" | "fatigue" }

const SPECS: Spec[] = [
  { platform: "tiktok", name: "TT · Spark Ads – Prospecting", objective: "Sales", spend: 420, roas: 2.6, ctr: 0.011, cpm: 7.5, aov: 64, ads: 3 },
  { platform: "tiktok", name: "TT · UGC Hooks – Test", objective: "Sales", spend: 260, roas: 3.1, ctr: 0.014, cpm: 6.8, aov: 64, ads: 3, quirk: "fatigue" },
  { platform: "tiktok", name: "TT · Retargeting 7d", objective: "Sales", spend: 110, roas: 4.2, ctr: 0.018, cpm: 12, aov: 71, ads: 2 },
  { platform: "meta", name: "Meta · Advantage+ Shopping", objective: "Sales", spend: 780, roas: 3.4, ctr: 0.012, cpm: 11, aov: 68, ads: 4 },
  { platform: "meta", name: "Meta · Lookalike 1% – Purchase", objective: "Sales", spend: 340, roas: 2.9, ctr: 0.010, cpm: 13, aov: 66, ads: 3, quirk: "spike" },
  { platform: "meta", name: "Meta · Retargeting – DPA", objective: "Sales", spend: 150, roas: 5.1, ctr: 0.021, cpm: 15, aov: 74, ads: 2 },
  { platform: "google", name: "Google · Performance Max", objective: "Sales", spend: 610, roas: 3.8, ctr: 0.017, cpm: 9, aov: 72, ads: 2 },
  { platform: "google", name: "Google · Brand Search", objective: "Sales", spend: 130, roas: 7.4, ctr: 0.075, cpm: 38, aov: 78, ads: 1 },
  { platform: "google", name: "Google · Shopping – Bestsellers", objective: "Sales", spend: 290, roas: 3.3, ctr: 0.009, cpm: 8.5, aov: 69, ads: 2 },
];

const SLUG: Record<string, string> = { tiktok: "tt", meta: "me", google: "go" };
const DOW = [0.9, 1.02, 1.0, 1.0, 1.05, 1.12, 1.06]; // Sun..Sat demand shape

const iso = (d: Date) => d.toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface MockOptions { endDate?: string; days?: number; seed?: number }

export function generateMockDataset({ endDate, days = 60, seed = 7 }: MockOptions = {}): Dataset {
  const rnd = mulberry32(seed);
  const end = endDate ? new Date(`${endDate}T00:00:00Z`) : new Date(iso(new Date()) + "T00:00:00Z");
  const ds = emptyDataset();

  for (const p of ["tiktok", "meta", "google"] as const)
    ds.accounts.push({ externalId: `mock-acct-${SLUG[p]}`, platform: p, name: `Demo ${p[0]!.toUpperCase()}${p.slice(1)} account`, currency: "USD" });

  const claimedByDay = new Map<string, number>();

  SPECS.forEach((s, ci) => {
    const cid = `mock-cmp-${ci + 1}`;
    ds.campaigns.push({ externalId: cid, accountExternalId: `mock-acct-${SLUG[s.platform]}`, platform: s.platform, name: s.name, objective: s.objective, status: "active", dailyBudget: Math.round(s.spend * 1.15) });
    ds.adGroups.push({ externalId: `${cid}-g1`, campaignExternalId: cid, platform: s.platform, name: "Main ad set", status: "active" });
    const adIds: string[] = [];
    for (let k = 0; k < s.ads; k++) {
      const crId = `${cid}-cr${k + 1}`;
      ds.creatives.push({ externalId: crId, platform: s.platform, kind: s.platform === "google" ? "image" : "video" });
      const adId = `${cid}-ad${k + 1}`;
      adIds.push(adId);
      ds.ads.push({ externalId: adId, adGroupExternalId: `${cid}-g1`, creativeExternalId: crId, platform: s.platform, name: `Creative ${k + 1}`, status: "active" });
    }

    for (let d = days - 1; d >= 0; d--) {
      const day = new Date(end.getTime() - d * 86400000);
      const date = iso(day);
      const sinceEnd = d; // 0 = last day
      let spendMult = (0.9 + rnd() * 0.2) * (0.97 + (days - d) / days * 0.06);
      let roasMult = (0.88 + rnd() * 0.24) * DOW[day.getUTCDay()]!;
      if (s.quirk === "fatigue" && sinceEnd < 14) roasMult *= 1 - (14 - sinceEnd) * 0.035;
      if (s.quirk === "spike" && sinceEnd < 3) { roasMult *= 0.42; spendMult *= 1.3; }

      const campSpend = s.spend * spendMult;
      const weights = adIds.map((_, k) => 1 / (k + 1));
      const wsum = weights.reduce((a, b) => a + b, 0);
      adIds.forEach((adId, k) => {
        const spend = round2((campSpend * weights[k]!) / wsum);
        const impressions = Math.round((spend / s.cpm) * 1000);
        const clicks = Math.round(impressions * s.ctr * (0.9 + rnd() * 0.2));
        const revenue = round2(spend * s.roas * roasMult * (0.92 + rnd() * 0.16));
        const conversions = Math.max(0, Math.round(revenue / s.aov));
        ds.insights.push({ adExternalId: adId, date, spend, impressions, clicks, conversions, revenue });
        claimedByDay.set(date, (claimedByDay.get(date) ?? 0) + revenue);
      });
    }
  });

  // Store orders: platforms over-claim (overlap), so store revenue is ~70% of claimed.
  const channels = [["tiktok", 0.22], ["meta", 0.33], ["google", 0.27], ["direct", 0.1], ["email", 0.08]] as const;
  let n = 0;
  for (const [date, claimed] of [...claimedByDay.entries()].sort()) {
    let remaining = claimed * 0.7;
    while (remaining > 20) {
      const revenue = round2(Math.min(remaining, 35 + rnd() * 90));
      remaining -= revenue;
      let pick = rnd(), source: string = channels[channels.length - 1]![0];
      for (const [c, w] of channels) { if ((pick -= w) < 0) { source = c; break; } }
      n++;
      const ts = new Date(`${date}T00:00:00Z`).getTime() + Math.floor(rnd() * 86400000);
      ds.orders.push({
        externalId: `mock-ord-${n}`, createdAt: new Date(ts).toISOString(), revenue,
        customerId: `cust-${Math.floor(rnd() * 900) + 1}`,
        utm: { source, medium: source === "email" ? "email" : source === "direct" ? "none" : "paid" },
        clickIds: source === "meta" ? { fbclid: `fb${n}` } : source === "google" ? { gclid: `g${n}` } : source === "tiktok" ? { ttclid: `tt${n}` } : {},
      });
    }
  }
  return ds;
}
