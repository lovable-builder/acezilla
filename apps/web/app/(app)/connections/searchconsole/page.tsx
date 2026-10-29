import Link from "next/link";
import { listSearchSites, type SearchSite } from "@acezilla/connectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchConsoleAccessToken } from "@/lib/searchconsole";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { disconnect } from "../connection-actions";
import { saveAndSyncSearchConsole } from "./actions";

export default async function SearchConsoleSites({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const { data: saved } = current
    ? await supabase.from("search_site").select("external_id").eq("workspace_id", current.id)
    : { data: [] };
  const synced = new Set((saved ?? []).map((s) => String(s.external_id)));
  let sites: SearchSite[] = [];
  let loadError = error;
  if (current) {
    try {
      const admin = createAdminClient();
      const { data: conn } = await admin.from("connection").select("token_enc").eq("workspace_id", current.id).eq("platform", "searchconsole").maybeSingle();
      if (!conn?.token_enc) throw new Error("Google Search Console is not connected");
      sites = await listSearchSites({ accessToken: await searchConsoleAccessToken(conn.token_enc as string) });
    } catch (e) { loadError = e instanceof Error ? e.message : "Could not load websites"; }
  }
  return (
    <>
      <div>
        <div className="eyebrow">Google Search Console · choose websites</div>
        <h1 className="page">{synced.size > 0 ? "Edit your synced websites" : "Which website should acezilla read?"}</h1>
        <p className="sub">Read-only. We import the words people searched on Google before reaching your website, with clicks, views and position for the last 28 days. Nothing is changed in Search Console.</p>
      </div>
      {loadError && <Card style={{ color: "var(--neg)" }}>{loadError}</Card>}
      {synced.size > 0 && <Card style={{ fontSize: 13 }}>Ticked websites are syncing now. <b>Unticking a website removes it and its imported words from acezilla.</b></Card>}
      <form action={saveAndSyncSearchConsole} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sites.map((s, i) => (
          <Card key={s.url} className="conn">
            <input type="checkbox" name="site" value={s.url} defaultChecked={synced.size > 0 ? synced.has(s.url) : sites.length === 1} style={{ width: 18, height: 18 }} id={`s${i}`} />
            <label htmlFor={`s${i}`} style={{ flex: 1, cursor: "pointer" }}>
              <b>{s.name}</b>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{s.url}</div>
            </label>
          </Card>
        ))}
        {sites.length === 0 && !loadError && <Card>No websites found for this login. Make sure the Google user can open your website in Google Search Console.</Card>}
        <div style={{ display: "flex", gap: 10 }}>
          {sites.length > 0 && <Button>{synced.size > 0 ? "Save and sync" : "Import selected websites"}</Button>}
          <Button asChild variant="outline"><Link href="/connections">Back</Link></Button>
        </div>
      </form>

      <Card style={{ borderColor: "var(--neg)" }}>
        <b>Disconnect Google Search Console</b>
        <p className="sub" style={{ fontSize: 13 }}>Deletes the stored login and every search word imported from Google Search Console. We also ask Google to revoke access. You can reconnect later.</p>
        <form action={disconnect} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="platform" value="searchconsole" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="confirm" value="yes" required /> I understand this deletes my search data in acezilla</label>
          <Button variant="outline" style={{ color: "var(--neg)" }}>Disconnect</Button>
        </form>
      </Card>
    </>
  );
}
