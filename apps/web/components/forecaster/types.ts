import type { ChannelFees, SalesChannel } from "@acezilla/models";

export type AdPlatform = "meta" | "google" | "tiktok" | "allegro";
/** What the workspace's own ad history says about one platform. Null means there is nothing to learn from yet. */
export interface PlatformStats {
  id: AdPlatform; label: string; spend: number; clicks: number; days: number;
  cpc: number | null; cvr: number | null;
  /** Where the figures came from: the platform sync, or the Allegro Ads report a person uploaded. */ source: "sync" | "report";
  /** How much weekly cost per click wandered, as a share of the average. Null when fewer than 4 usable weeks. */ cpcSpread: number | null;
}
export interface ForecastProduct { id: string; channel: SalesChannel; name: string; price: number; unitCost: number | null; commissionRate: number | null; shipping: number | null }
export interface ForecastDefaults {
  currency: string; vatRate: number;
  platforms: PlatformStats[];
  products: ForecastProduct[];
  /** Starting fees per channel, and which ones came from the workspace's own fee history. */
  fees: Record<SalesChannel, ChannelFees>;
  observed: Record<SalesChannel, string[]>;
  /** Recommended daily budget per platform in the workspace currency. Null when we have no guide for it (Allegro Ads). */
  dailyBudget: Record<AdPlatform, number | null>;
}
