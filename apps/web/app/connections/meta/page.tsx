import Link from "next/link";
import { listMetaAdAccounts } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveAndSync } from "./actions";

const STATUS: Record<number, string> = { 1: "Active", 2: "Disabled", 3: "Unsettled", 7: "In review", 9: "Grace period", 100: "Closing", 101: "Closed" };

export default async function MetaAccounts({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { current } = await getWorkspaceContext();
  let accounts: Awaited<ReturnType<typeof listMetaAdAccounts>> = [];
  let loadError = error;
  if (current) {
    try {
      const { data } = await createAdminClient().from("connection").select("token_enc").eq("workspace_id", current.id).eq("platform", "meta").maybeSingle();
      if (!data?.token_enc) loadError = "Meta is not connected yet.";
      else accounts = await listMetaAdAccounts({ accessToken: decryptToken(data.token_enc as string), version: process.env.META_GRAPH_VERSION });
    } catch (e) { loadError = e instanceof Error ? e.message : "Could not load ad accounts"; }
  }
  return (
    <>
      <div>
        <div className="eyebrow">Meta Ads · choose accounts</div>
        <h1 className="page">Which ad accounts should acezilla read?</h1>
        <p className="sub">Read-only. We import the last 90 days and never change a campaign without your approval.</p>
      </div>
      {loadError && <Card style={{ color: "var(--neg)" }}>{loadError}</Card>}
      <form action={saveAndSync} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {accounts.map((a) => (
          <Card key={a.id} className="conn">
            <input type="checkbox" name="account" value={a.id} defaultChecked={a.status === 1} style={{ width: 18, height: 18 }} id={`a${a.id}`} />
            <label htmlFor={`a${a.id}`} style={{ flex: 1, cursor: "pointer" }}>
              <b>{a.name}</b>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>act_{a.id} · {a.currency} · {STATUS[a.status] ?? `status ${a.status}`}</div>
            </label>
          </Card>
        ))}
        {accounts.length === 0 && !loadError && <Card>No ad accounts found for this login. Make sure your Meta user has access to an ad account in the business portfolio.</Card>}
        <div style={{ display: "flex", gap: 10 }}>
          {accounts.length > 0 && <Button>Import selected accounts</Button>}
          <Button asChild variant="outline"><Link href="/connections">Back</Link></Button>
        </div>
      </form>
    </>
  );
}
