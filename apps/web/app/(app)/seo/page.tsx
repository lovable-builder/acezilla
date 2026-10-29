import Link from "next/link";
import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "@/components/seo/auto-refresh";
import { SearchWordsPanel } from "@/components/seo/search-words-panel";
import { ago } from "@/lib/format";
import { LIMITS } from "@/lib/seo-runner";
import { addSite } from "./actions";

export const metadata: Metadata = { title: "SEO · acezilla" };
export const maxDuration = 300;   // audits run after the response, inside this route's time budget

type Scores = { seo: number; geo: number; aeo: number };
const tone = (n: number) => (n >= 8 ? "var(--pos)" : n >= 5 ? "var(--warn)" : "var(--neg)");

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const [{ data: sites }, { data: audits }] = current
    ? await Promise.all([
        supabase.from("seo_site").select("id,host,url,last_audit_at,monitoring").eq("workspace_id", current.id).order("created_at"),
        supabase.from("seo_audit").select("id,site_id,status,scores,error,created_at").eq("workspace_id", current.id).order("created_at", { ascending: false }).limit(200),
      ])
    : [{ data: [] }, { data: [] }];
  const latest = (siteId: string) => audits?.find((a) => a.site_id === siteId);
  const latestDone = (siteId: string) => audits?.find((a) => a.site_id === siteId && a.status === "done");
  const anyRunning = !!audits?.some((a) => a.status === "queued" || a.status === "running");

  return (
    <>
      <AutoRefresh active={anyRunning} />
      <div>
        <div className="eyebrow">Analyze · SEO</div>
        <h1 className="page">Make your website easier to find</h1>
        <p className="sub">Add your website and acezilla audits it for search engines (SEO), AI search such as ChatGPT and Perplexity (GEO), and featured answers (AEO). You get plain-language findings and drafted fixes you can copy.</p>
      </div>
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}
      {current && <SearchWordsPanel supabase={supabase} workspaceId={current.id} />}

      <Card>
        <form action={addSite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="field" name="url" required placeholder="yourwebsite.com" inputMode="url" autoComplete="off" style={{ flex: "1 1 260px" }} aria-label="Website address" />
          <Button>Audit this website</Button>
        </form>
        <p className="sub" style={{ fontSize: 13, margin: "10px 0 0" }}>We read only your public pages, like a search engine does, and never change your site. Up to {LIMITS.sites} websites and {LIMITS.auditsPerSitePerDay} audits per site per day.</p>
      </Card>

      {(sites ?? []).length === 0 ? (
        <Card>
          <b>What you will get</b>
          <ul className="sub" style={{ paddingLeft: 18, listStyle: "disc", fontSize: 14 }}>
            <li>Three scores out of 10 for SEO, GEO and AEO, with the evidence behind each one</li>
            <li>Every issue found, ordered by how much it matters</li>
            <li>Drafted fixes (titles, descriptions, FAQs, structured data) ready to copy onto your site</li>
            <li>A weekly re-check, and an email if your score drops</li>
          </ul>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(sites ?? []).map((s) => {
            const done = latestDone(s.id as string), last = latest(s.id as string);
            const sc = done?.scores as Scores | undefined;
            const busy = last && (last.status === "queued" || last.status === "running");
            return (
              <Card key={s.id as string} className="seo-site">
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <b style={{ fontSize: 16 }}>{s.host as string}</b>
                  <div className="sub" style={{ margin: 0, fontSize: 13 }}>
                    {busy ? "Audit running…" : last?.status === "failed" ? <span style={{ color: "var(--neg)" }}>Last audit failed: {last.error as string}</span> : s.last_audit_at ? `Audited ${ago(s.last_audit_at as string)}` : "Not audited yet"}
                    {s.monitoring ? " · weekly monitoring on" : ""}
                  </div>
                </div>
                {sc && (
                  <div className="seo-mini tabnum" aria-label={`SEO ${sc.seo}, GEO ${sc.geo}, AEO ${sc.aeo} out of 10`}>
                    {(["seo", "geo", "aeo"] as const).map((k) => <span key={k}><b style={{ color: tone(sc[k]) }}>{sc[k]}</b>{k.toUpperCase()}</span>)}
                  </div>
                )}
                <Button asChild variant="outline"><Link href={`/seo/${s.id}`}>{sc ? "View report" : "Open"}</Link></Button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
