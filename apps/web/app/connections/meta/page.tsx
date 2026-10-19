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
  const { supabase, current } = await getWorkspaceContext();
  const { data: saved } = current
    ? await supabase.from("ad_account").select("external_id").eq("workspace_id", current.id).eq("platform", "meta")
    : { data: [] };
  const synced = new Set((saved ?? []).map((a) => String(a.external_id).replace("meta-acct-", "")));
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
        <h1 className="page">{synced.size > 0 ? "Edit your synced ad accounts" : "Which ad accounts should acezilla read?"}</h1>
        <p className="sub">Read-only. We import your history and never change a campaign without your approval.</p>
      </div>
      {loadError && <Card style={{ color: "var(--neg)" }}>{loadError}</Card>}
      {synced.size > 0 && <Card style={{ fontSize: 13 }}>Ticked accounts are syncing now. <b>Unticking an account removes it and its imported data from acezilla.</b> You can add it back later.</Card>}
      <form action={saveAndSync} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {accounts.map((a) => (
          <Card key={a.id} className="conn">
            <input type="checkbox" name="account" value={a.id} defaultChecked={synced.size > 0 ? synced.has(a.id) : a.status === 1} style={{ width: 18, height: 18 }} id={`a${a.id}`} />
            <label htmlFor={`a${a.id}`} style={{ flex: 1, cursor: "pointer" }}>
              <b>{a.name}</b>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>act_{a.id} · {a.currency} · {STATUS[a.status] ?? `status ${a.status}`}</div>
            </label>
          </Card>
        ))}
        {accounts.length === 0 && !loadError && <Card>No ad accounts found for this login. Make sure your Meta user has access to an ad account in the business portfolio.</Card>}
        {accounts.length > 0 && (
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="eyebrow">History</span>
            <select name="range" defaultValue="730" className="field" style={{ padding: "8px 10px" }}>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
              <option value="730">Last 24 months</option>
              <option value="1095">Last 36 months (Meta's maximum)</option>
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          {accounts.length > 0 && <Button>{synced.size > 0 ? "Save and sync" : "Import selected accounts"}</Button>}
          <Button asChild variant="outline"><Link href="/connections">Back</Link></Button>
        </div>
      </form>
    </>
  );
}
