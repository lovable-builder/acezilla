import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nearTop, searchSummary, topByClicks, type SearchQuery } from "@acezilla/models";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/app/term";
import { ago, int } from "@/lib/format";

const PAGE = 1000;
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`);

/** The words people typed into Google before they reached the website, from Search Console (read-only). Useful for SEO and for ad wording. */
export async function SearchWordsPanel({ supabase, workspaceId }: { supabase: SupabaseClient; workspaceId: string }) {
  const { data: conn } = await supabase.from("connection").select("status,last_sync_at,last_error").eq("workspace_id", workspaceId).eq("platform", "searchconsole").maybeSingle();
  if (!conn) {
    return (
      <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 240 }}><b>See what people search before they find you.</b> <span className="sub" style={{ fontSize: 14 }}>Connect Google Search Console to see the exact words shoppers type into Google, which ones almost reach page one, and which words to use in your ads. Free.</span></span>
        <Button asChild variant="outline"><Link href="/connections">Connect Search Console</Link></Button>
      </Card>
    );
  }
  const { data: sites } = await supabase.from("search_site").select("id,name").eq("workspace_id", workspaceId);
  if (!sites?.length) {
    return (
      <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 240 }}>Google Search Console is connected. Choose the website to read.</span>
        <Button asChild><Link href="/connections/searchconsole">Choose websites</Link></Button>
      </Card>
    );
  }
  const rows: SearchQuery[] = [];
  let period = "";
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from("search_query").select("query,clicks,impressions,position,period_start,period_end").eq("workspace_id", workspaceId).order("query").range(from, from + PAGE - 1);
    for (const r of data ?? []) { rows.push({ query: r.query as string, clicks: Number(r.clicks), impressions: Number(r.impressions), position: Number(r.position) }); period = `${r.period_start} to ${r.period_end}`; }
    if ((data?.length ?? 0) < PAGE) break;
  }
  const sum = searchSummary(rows), close = nearTop(rows), top = topByClicks(rows);
  const broken = conn.status === "error" || conn.status === "needs_reauth";

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h2" style={{ margin: 0 }}>What people search on Google</h2>
        <span className="eyebrow">{sites.map((s) => s.name as string).join(", ")}{conn.last_sync_at ? ` · read ${ago(conn.last_sync_at as string)}` : ""}</span>
        <Button asChild variant="ghost" size="sm"><Link href="/connections/searchconsole" style={{ marginLeft: "auto" }}>Websites</Link></Button>
      </div>
      {broken && <div style={{ color: "var(--neg)", fontSize: 13 }}>{conn.status === "needs_reauth" ? "Login expired. Reconnect on the Connections page." : `Last sync failed: ${conn.last_error ?? "unknown error"}`}</div>}
      {rows.length === 0 ? (
        <p className="sub" style={{ margin: 0 }}>No search words have been read yet. Press Sync now on the Connections page. A new website can take a few days to show data in Search Console.</p>
      ) : (
        <>
          <div className="kpis">
            {([
              ["Google clicks", int(sum.clicks), `${period} · people who clicked to your site`],
              ["Google views", int(sum.impressions), `times your site appeared · ${pct(sum.ctr)} clicked`],
              ["Average position", sum.position === null ? "—" : sum.position.toFixed(1), "1 is the top of the first page"],
              ["Search words", int(sum.queries), "different words, best 1,000 per website"],
            ] as [string, string, string][]).map(([label, value, sub]) => (
              <div className="kpi" key={label}>
                <span className="eyebrow"><Term>{label}</Term></span>
                <span className="tabnum" style={{ fontSize: 24, fontWeight: 600 }}>{value}</span>
                <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{sub}</span>
              </div>
            ))}
          </div>
          {close.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="t">
                <thead><tr><th style={{ textAlign: "left" }}><Term>Almost on page one</Term></th><th>Position</th><th>Views</th><th>Clicks</th></tr></thead>
                <tbody>{close.map((r) => (
                  <tr key={r.query}><td style={{ textAlign: "left", overflowWrap: "anywhere", whiteSpace: "normal" }}>{r.query}</td><td className="tabnum">{r.position.toFixed(1)}</td><td className="tabnum">{int(r.impressions)}</td><td className="tabnum">{int(r.clicks)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {top.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="t">
                <thead><tr><th style={{ textAlign: "left" }}>Words that bring visitors</th><th>Clicks</th><th>Views</th><th>Position</th></tr></thead>
                <tbody>{top.map((r) => (
                  <tr key={r.query}><td style={{ textAlign: "left", overflowWrap: "anywhere", whiteSpace: "normal" }}>{r.query}</td><td className="tabnum">{int(r.clicks)}</td><td className="tabnum">{int(r.impressions)}</td><td className="tabnum">{r.position.toFixed(1)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>These are the shoppers&apos; own words. Put the ones that bring visitors into your ad text and product titles. For the words that almost reach page one, a page or product title built around that exact word is the quickest way up. Google rounds and hides some rare searches, so the totals are a little lower than the real number.</p>
        </>
      )}
    </Card>
  );
}
