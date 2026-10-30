import Link from "next/link";
import { listGa4Properties, type Ga4Property } from "@acezilla/connectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { ga4AccessToken } from "@/lib/ga4";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { disconnect } from "../connection-actions";
import { saveAndSyncGa4 } from "./actions";

export const maxDuration = 300; // importing long history runs inside this route's time budget

export default async function Ga4Properties({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const { data: saved } = current
    ? await supabase.from("analytics_property").select("external_id").eq("workspace_id", current.id)
    : { data: [] };
  const synced = new Set((saved ?? []).map((p) => String(p.external_id)));
  let properties: Ga4Property[] = [];
  let loadError = error;
  if (current) {
    try {
      const admin = createAdminClient();
      const { data: conn } = await admin.from("connection").select("token_enc").eq("workspace_id", current.id).eq("platform", "ga4").maybeSingle();
      if (!conn?.token_enc) throw new Error("Google Analytics is not connected");
      properties = await listGa4Properties({ accessToken: await ga4AccessToken(admin, conn.token_enc as string) });
    } catch (e) { loadError = e instanceof Error ? e.message : "Could not load properties"; }
  }
  return (
    <>
      <div>
        <div className="eyebrow">Google Analytics 4 · choose properties</div>
        <h1 className="page">{synced.size > 0 ? "Edit your synced Analytics properties" : "Which Analytics property should acezilla read?"}</h1>
        <p className="sub">Read-only. We import sessions, conversions and purchase revenue per traffic channel, and never change anything in Analytics.</p>
      </div>
      {loadError && <Card style={{ color: "var(--neg)" }}>{loadError}</Card>}
      {synced.size > 0 && <Card style={{ fontSize: 13 }}>Ticked properties are syncing now. <b>Unticking a property removes it and its imported data from acezilla.</b></Card>}
      <form action={saveAndSyncGa4} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {properties.map((p) => (
          <Card key={p.id} className="conn">
            <input type="checkbox" name="property" value={p.id} defaultChecked={synced.size > 0 ? synced.has(p.id) : properties.length === 1} style={{ width: 18, height: 18 }} id={`p${p.id}`} />
            <label htmlFor={`p${p.id}`} style={{ flex: 1, cursor: "pointer" }}>
              <b>{p.name}</b>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{p.id}{p.account ? ` · ${p.account}` : ""}</div>
            </label>
          </Card>
        ))}
        {properties.length === 0 && !loadError && <Card>No Analytics properties found for this login. Make sure the Google user can open a GA4 property in Google Analytics.</Card>}
        {properties.length > 0 && (
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
          {properties.length > 0 && <Button>{synced.size > 0 ? "Save and sync" : "Import selected properties"}</Button>}
          <Button asChild variant="outline"><Link href="/connections">Back</Link></Button>
        </div>
      </form>

      <Card style={{ borderColor: "var(--neg)" }}>
        <b>Disconnect Google Analytics</b>
        <p className="sub" style={{ fontSize: 13 }}>Deletes the stored login and every property and traffic row imported from Google Analytics. We also ask Google to revoke access. You can reconnect later.</p>
        <form action={disconnect} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="platform" value="ga4" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="confirm" value="yes" required /> I understand this deletes my Analytics data in acezilla</label>
          <Button variant="outline" style={{ color: "var(--neg)" }}>Disconnect</Button>
        </form>
      </Card>
    </>
  );
}
