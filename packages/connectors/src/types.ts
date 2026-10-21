export type Platform = "tiktok" | "meta" | "google" | "shopify" | "woocommerce" | "csv" | "mock";

export interface AdAccount { externalId: string; name: string; currency: string; }

export interface InsightRow {
  adExternalId: string; date: string; // YYYY-MM-DD
  spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
}

export interface DraftChange {
  kind: "create_campaign" | "update_budget" | "pause" | "resume";
  targetExternalId?: string;
  payload: Record<string, unknown>;
}

export interface ApprovedChange extends DraftChange {
  approvalId: string; // MUST reference an approval row with status = approved
  idempotencyKey: string;
}

export interface Connector {
  platform: Platform;
  listAccounts(): Promise<AdAccount[]>;
  syncEntities(accountId: string): Promise<void>;
  syncInsights(accountId: string, from: string, to: string): Promise<InsightRow[]>;
  /** Creates a paused draft on the platform side; never spends money. */
  createDraft(accountId: string, change: DraftChange): Promise<{ externalId: string }>;
  /** Only callable through applyApproved() below. */
  applyChange(accountId: string, change: ApprovedChange): Promise<void>;
}
