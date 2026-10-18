import { test } from "node:test";
import assert from "node:assert/strict";
import { applyApproved, type ApprovalStore } from "./apply";
import type { Connector } from "./types";

const calls: string[] = [];
const connector = { applyChange: async () => { calls.push("apply"); } } as unknown as Connector;
const change = { kind: "pause" as const, payload: {}, approvalId: "a1", idempotencyKey: "k1" };
const store = (status: "pending" | "approved" | "rejected" | null, pushed = false): ApprovalStore => ({
  getStatus: async () => status, hasPushed: async () => pushed, log: async () => {},
});

test("refuses unapproved changes", async () => {
  for (const s of ["pending", "rejected", null] as const)
    await assert.rejects(applyApproved(connector, "acc", change, store(s)));
  assert.equal(calls.length, 0);
});

test("pushes once, then reports duplicate", async () => {
  assert.equal(await applyApproved(connector, "acc", change, store("approved")), "pushed");
  assert.equal(await applyApproved(connector, "acc", change, store("approved", true)), "duplicate");
  assert.equal(calls.length, 1);
});
