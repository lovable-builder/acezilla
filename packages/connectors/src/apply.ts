import type { ApprovedChange, Connector } from "./types";

export interface ApprovalStore {
  getStatus(approvalId: string): Promise<"pending" | "approved" | "rejected" | null>;
  hasPushed(idempotencyKey: string): Promise<boolean>;
  log(entry: { approvalId: string; idempotencyKey: string; ok: boolean; error?: string }): Promise<void>;
}

/** The only sanctioned write path to an ad platform (suggest-only guarantee). */
export async function applyApproved(
  connector: Connector, accountId: string, change: ApprovedChange, store: ApprovalStore,
): Promise<"pushed" | "duplicate"> {
  if ((await store.getStatus(change.approvalId)) !== "approved") {
    throw new Error(`Refusing to push: approval ${change.approvalId} is not approved`);
  }
  if (await store.hasPushed(change.idempotencyKey)) return "duplicate";
  try {
    await connector.applyChange(accountId, change);
    await store.log({ approvalId: change.approvalId, idempotencyKey: change.idempotencyKey, ok: true });
    return "pushed";
  } catch (e) {
    await store.log({ approvalId: change.approvalId, idempotencyKey: change.idempotencyKey, ok: false, error: String(e) });
    throw e;
  }
}
