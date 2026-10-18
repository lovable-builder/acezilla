import type { Platform } from "./types";

/** Normalised, platform-agnostic snapshot that every connector (mock, csv, real) produces. */
export interface Dataset {
  accounts: { externalId: string; platform: Platform; name: string; currency: string }[];
  campaigns: { externalId: string; accountExternalId: string; platform: Platform; name: string; objective: string; status: string; dailyBudget: number }[];
  adGroups: { externalId: string; campaignExternalId: string; platform: Platform; name: string; status: string }[];
  creatives: { externalId: string; platform: Platform; kind: string }[];
  ads: { externalId: string; adGroupExternalId: string; creativeExternalId?: string; platform: Platform; name: string; status: string }[];
  insights: { adExternalId: string; date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }[];
  orders: { externalId: string; createdAt: string; revenue: number; customerId: string; utm: Record<string, string>; clickIds: Record<string, string> }[];
}

export const emptyDataset = (): Dataset => ({ accounts: [], campaigns: [], adGroups: [], creatives: [], ads: [], insights: [], orders: [] });
