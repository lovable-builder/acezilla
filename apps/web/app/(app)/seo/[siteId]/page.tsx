import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "@/components/seo/auto-refresh";
import { CopyButton } from "@/components/seo/copy-button";
import { ScoreRing } from "@/components/seo/score-ring";
import { Sparkline } from "@/components/dash/charts";
import { ago } from "@/lib/format";
import { deleteSite, rerunAudit, setFixStatus, setMonitoring } from "../actions";

export const maxDuration = 300;

type Scores = { seo: number; geo: number; aeo: number };
const DIM = { seo: "SEO", geo: "GEO", aeo: "AEO" } as const;
const DIM_HELP = { seo: "How well search engines can find, read and rank your pages.", geo: "Whether AI search tools can understand, trust and cite you.", aeo: "Whether your content can be used as a direct answer or featured snippet." } as const;
const STATUS = { good: "Good", attention: "Needs attention", missing: "Missing", not_measured: "Not measured" } as const;
const KIND: Record<string, string> = { meta_title: "Page title", meta_description: "Meta description", h1: "Main heading", faq: "FAQ", schema_org: "Structured data", definition: "Definition", about_page: "About page", contact_page: "Contact page", open_graph: "Social sharing tags", alt_text: "Image alt text", content: "Content" };

export default async function SiteReport({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { siteId } = await params;
  const { error } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  if (!current) notFound();
  const { data: site } = await supabase.from("seo_site").select("id,host,url,monitoring,last_audit_at").eq("id", siteId).eq("workspace_id", current.id).maybeSingle();
  if (!site) notFound();

  const { data: audits } = await supabase.from("seo_audit").select("id,status,scores,summary,pages_crawled,error,created_at,finished_at").eq("site_id", siteId).order("created_at", { ascending: false }).limit(20);
  const last = audits?.[0];
  const shown = audits?.find((a) => a.status === "done");
  const running = last && (last.status === "queued" || last.status === "running");
  const [{ data: findings }, { data: fixes }] = shown
    ? await Promise.all([
        supabase.from("seo_finding").select("id,dimension,grp,signal,finding,status,weight,page_url").eq("audit_id", shown.id).order("id"),
        supabase.from("seo_fix").select("id,kind,page_url,signal,current,proposed,rationale,status").eq("audit_id", shown.id).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const sc = shown?.scores as Scores | undefined;
  const history = (audits ?? []).filter((a) => a.status === "done").reverse();

  return (
    <>
      <AutoRefresh active={!!running} />
      <div>
        <div className="eyebrow"><Link href="/seo" style={{ color: "var(--accent-ink)" }}>SEO</Link> · {site.host as string}</div>
        <h1 className="page">{site.host as string}</h1>
        <p className="sub">{shown ? `Latest audit ${ago(shown.finished_at as string)} · ${shown.pages_crawled} pages read` : running ? "The first audit is running. This takes under a minute." : "No finished audit yet."}</p>
      </div>
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}
      {running && <Card style={{ color: "var(--accent-ink)", background: "var(--accent-soft)" }}>Audit in progress… this page updates by itself.</Card>}
      {last?.status === "failed" && <Card style={{ color: "var(--neg)" }}>The last audit failed: {last.error as string}</Card>}

      {sc && (
        <>
          <div className="seo-rings">
            <ScoreRing label="SEO" value={sc.seo} /><ScoreRing label="GEO" value={sc.geo} /><ScoreRing label="AEO" value={sc.aeo} />
          </div>
          <Card><p style={{ margin: 0 }}>{shown!.summary as string}</p></Card>
        </>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <form action={rerunAudit}><input type="hidden" name="siteId" value={siteId} /><Button disabled={!!running}>{running ? "Running…" : "Run audit again"}</Button></form>
        <form action={setMonitoring} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="monitoring" value={site.monitoring ? "" : "on"} />
          <Button variant="outline">Weekly monitoring: {site.monitoring ? "On (turn off)" : "Off (turn on)"}</Button>
        </form>
      </div>

      {(fixes ?? []).length > 0 && (
        <section>
          <h2 className="h2"><span className="n">01</span>Fixes to apply</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(fixes ?? []).map((f) => (
              <Card key={f.id as string} className="seo-fix" style={f.status !== "pending" ? { opacity: 0.6 } : undefined}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <b>{KIND[f.kind as string] ?? (f.kind as string)}</b>
                  {f.page_url && <span className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{new URL(f.page_url as string).pathname}</span>}
                  {f.status !== "pending" && <span className="seo-chip seo-chip-not_measured">{f.status === "done" ? "Done" : "Dismissed"}</span>}
                </div>
                {f.current && <div><div className="eyebrow">Now</div><pre>{f.current as string}</pre></div>}
                <div><div className="eyebrow">Suggested</div><pre className="new">{f.proposed as string}</pre></div>
                {f.rationale && <p className="sub" style={{ margin: 0, fontSize: 13 }}>{f.rationale as string}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <CopyButton text={f.proposed as string} label="Copy suggestion" />
                  {(["done", "dismissed", "pending"] as const).filter((s) => s !== f.status).map((s) => (
                    <form key={s} action={setFixStatus}><input type="hidden" name="fixId" value={f.id as string} /><input type="hidden" name="siteId" value={siteId} /><input type="hidden" name="status" value={s} /><Button variant="ghost" size="sm">{s === "done" ? "Mark done" : s === "dismissed" ? "Dismiss" : "Reopen"}</Button></form>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {shown && (["seo", "geo", "aeo"] as const).map((d, i) => {
        const rows = (findings ?? []).filter((f) => f.dimension === d);
        const groups = [...new Set(rows.map((r) => r.grp as string))];
        return (
          <section key={d}>
            <h2 className="h2"><span className="n">{String(i + ((fixes ?? []).length > 0 ? 2 : 1)).padStart(2, "0")}</span>{DIM[d]} findings</h2>
            <p className="sub" style={{ marginTop: -6 }}>{DIM_HELP[d]}</p>
            <Card style={{ overflowX: "auto", padding: 0 }}>
              {groups.map((g) => (
                <table className="t" key={g} style={{ margin: 0 }}>
                  <thead><tr><th style={{ width: "26%" }}>{g}</th><th style={{ textAlign: "left" }}>What we found</th><th style={{ width: 130 }}>Status</th></tr></thead>
                  <tbody>
                    {rows.filter((r) => r.grp === g).map((r) => (
                      <tr key={r.id as number}>
                        <td style={{ fontWeight: 600 }}>{r.signal as string}</td>
                        <td style={{ textAlign: "left" }}>{r.finding as string}</td>
                        <td><span className={`seo-chip seo-chip-${r.status}`}>{STATUS[r.status as keyof typeof STATUS]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </Card>
          </section>
        );
      })}

      {history.length > 1 && (
        <section>
          <h2 className="h2"><span className="n">··</span>Score history</h2>
          <Card style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {(["seo", "geo", "aeo"] as const).map((d) => (
              <div key={d}><div className="eyebrow">{DIM[d]}</div><Sparkline data={history.map((a) => (a.scores as Scores)[d])} /><div className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{history.map((a) => (a.scores as Scores)[d]).join(" → ")}</div></div>
            ))}
          </Card>
        </section>
      )}

      <Card style={{ borderColor: "var(--neg)" }}>
        <b>Remove this website</b>
        <p className="sub" style={{ fontSize: 13 }}>Deletes the website and every audit, finding and drafted fix for it.</p>
        <form action={deleteSite} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="siteId" value={siteId} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="confirm" value="yes" required /> I understand this deletes the audit history</label>
          <Button variant="outline" style={{ color: "var(--neg)" }}>Remove website</Button>
        </form>
      </Card>
    </>
  );
}
