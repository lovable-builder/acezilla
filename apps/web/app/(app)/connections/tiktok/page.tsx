import Link from "next/link";
import { listTiktokAdvertisers } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { tiktokOptions } from "@/lib/tiktok";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { disconnect } from "../connection-actions";
import { saveAndSync } from "./actions";

export const maxDuration = 300; // importing long history runs inside this route's time budget

export default async function TiktokAccounts({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const { data: saved } = current
    ? await supabase.from("ad_account").select("external_id").eq("workspace_id", current.id).eq("platform", "tiktok")
    : { data: [] };
  const synced = new Set((saved ?? []).map((a) => String(a.external_id).replace("tiktok-acct-", "")));
  let accounts: Awaited<ReturnType<typeof listTiktokAdvertisers>> = [];
  let loadError = error;
  if (current) {
    try {
      const { data } = await createAdminClient().from("connection").select("token_enc").eq("workspace_id", current.id).eq("platform", "tiktok").maybeSingle();
      if (!data?.token_enc) loadError = "TikTok is not connected yet.";
      else accounts = await listTiktokAdvertisers(tiktokOptions(decryptToken(data.token_enc as string)));
    } catch (e) { loadError = e instanceof Error ? e.message : "Could not load ad accounts"; }
  }
  return (
    <>
      <div>
        <div className="eyebrow">TikTok Ads · choose accounts</div>
        <h1 className="page">{synced.size > 0 ? "Edit your synced ad accounts" : "Which ad accounts should acezilla read?"}</h1>
        <p className="sub">Read-only. We import your history and never change a campaign without your approval.</p>
      </div>
      {loadError && <Card style={{ color: "var(--neg)" }}>{loadError}</Card>}
      {synced.size > 0 && <Card style={{ fontSize: 13 }}>Ticked accounts are syncing now. <b>Unticking an account removes it and its imported data from acezilla.</b> You can add it back later.</Card>}
      <form action={saveAndSync} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {accounts.map((a) => (
          <Card key={a.id} className="conn">
            <input type="checkbox" name="account" value={a.id} defaultChecked={synced.size > 0 ? synced.has(a.id) : true} style={{ width: 18, height: 18 }} id={`a${a.id}`} />
            <label htmlFor={`a${a.id}`} style={{ flex: 1, cursor: "pointer" }}>
              <b>{a.name}</b>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{a.id} · {a.currency}{a.status ? ` · ${a.status.replace(/^STATUS_/, "").toLowerCase().replace(/_/g, " ")}` : ""}</div>
            </label>
          </Card>
        ))}
        {accounts.length === 0 && !loadError && <Card>No ad accounts were shared with acezilla. Press Reconnect on the Connections page and tick the ad account you want to read on TikTok&apos;s screen.</Card>}
        {accounts.length > 0 && (
          <label className="history-range" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="eyebrow">History</span>
            <select name="range" defaultValue="365" className="field" style={{ padding: "8px 10px" }}>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
              <option value="730">Last 24 months</option>
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          {accounts.length > 0 && <Button>{synced.size > 0 ? "Save and sync" : "Import selected accounts"}</Button>}
          <Button asChild variant="outline"><Link href="/connections">Back</Link></Button>
        </div>
      </form>

      <Card style={{ borderColor: "var(--neg)" }}>
        <b>Disconnect TikTok</b>
        <p className="sub" style={{ fontSize: 13 }}>Deletes the stored login and every account, campaign and metric imported from TikTok. We also ask TikTok to revoke access. You can reconnect later.</p>
        <form action={disconnect} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="platform" value="tiktok" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="confirm" value="yes" required /> I understand this deletes my TikTok data in acezilla</label>
          <Button variant="outline" style={{ color: "var(--neg)" }}>Disconnect</Button>
        </form>
      </Card>
    </>
  );
}
