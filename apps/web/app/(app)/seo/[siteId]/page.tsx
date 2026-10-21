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
import { pageIssues, type AuditReport, type PageData } from "@acezilla/seo";
import { compareWithPrevious } from "@/lib/seo-monitor";
import { deleteSite, rerunAudit, setFixStatus, setMonitoring } from "../actions";

export const maxDuration = 300;

type Scores = { seo: number; geo: number; aeo: number };
const DIM = { seo: "SEO", geo: "GEO", aeo: "AEO" } as const;
const DIM_HELP = { seo: "How well search engines can find, read and rank your pages.", geo: "Whether AI search tools can understand, trust and cite you.", aeo: "Whether your content can be used as a direct answer or featured snippet." } as const;
const STATUS = { good: "Good", attention: "Needs attention", missing: "Missing", not_measured: "Not measured" } as const;
const KIND: Record<string, string> = { meta_title: "Page title", meta_description: "Meta description", h1: "Main heading", faq: "FAQ", schema_org: "Structured data", definition: "Definition", about_page: "About page", contact_page: "Contact page", open_graph: "Social sharing tags", alt_text: "Image alt text", content: "Content" };

export default async function SiteReport({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ error?: string; pages?: string }> }) {
  const { siteId } = await params;
  const { error, pages: pagesView } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  if (!current) notFound();
  const { data: site } = await supabase.from("seo_site").select("id,host,url,monitoring,last_audit_at").eq("id", siteId).eq("workspace_id", current.id).maybeSingle();
  if (!site) notFound();

  const { data: audits } = await supabase.from("seo_audit").select("id,site_id,status,scores,summary,report,pages_crawled,error,created_at,finished_at").eq("site_id", siteId).order("created_at", { ascending: false }).limit(20);
  const last = audits?.[0];
  const shown = audits?.find((a) => a.status === "done");
  const running = last && (last.status === "queued" || last.status === "running");
  const [{ data: findings }, { data: fixes }, { data: pageRows }, change] = shown
    ? await Promise.all([
        supabase.from("seo_finding").select("id,dimension,grp,signal,finding,status,weight,page_url").eq("audit_id", shown.id).order("id"),
        supabase.from("seo_fix").select("id,kind,page_url,signal,current,proposed,rationale,status").eq("audit_id", shown.id).order("created_at"),
        supabase.from("seo_page").select("url,data").eq("audit_id", shown.id).order("id"),
        compareWithPrevious(supabase, shown as { id: string; site_id: string; created_at: string }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, null];
  const report = (shown?.report ?? null) as AuditReport | null;
  const pageList = [...new Map((pageRows ?? []).map((r) => [r.url as string, { ...(r.data as PageData), url: r.url as string }])).values()].map((p) => ({ p, issues: pageIssues(p) })); // one row per address, also for audits saved before duplicates were removed
  const shownPages = (pagesView === "issues" ? pageList.filter((x) => x.issues.length > 0) : pageList).sort((a, b) => b.issues.length - a.issues.length);
  let sec = 0;
  const num = () => String(++sec).padStart(2, "0");
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

      {change && (
        <section>
          <h2 className="h2"><span className="n">{num()}</span>What changed since the last audit</h2>
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sub" style={{ margin: 0, fontSize: 13 }}>Compared with the audit from {ago(change.prev.finishedAt)}. Scores then: SEO {change.prev.scores.seo}, GEO {change.prev.scores.geo}, AEO {change.prev.scores.aeo}.</div>
            {change.diff.fixed.length + change.diff.worse.length + change.diff.pagesAdded.length + change.diff.pagesRemoved.length + change.diff.titlesChanged.length === 0 && <div>Nothing changed.</div>}
            {change.diff.fixed.length > 0 && <div><div className="eyebrow">Improved ({change.diff.fixed.length})</div><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{change.diff.fixed.map((c) => <li key={c.signal}><b>{c.signal}</b>: {STATUS[c.from as keyof typeof STATUS]} → {STATUS[c.to as keyof typeof STATUS]}</li>)}</ul></div>}
            {change.diff.worse.length > 0 && <div><div className="eyebrow" style={{ color: "var(--neg)" }}>Got worse ({change.diff.worse.length})</div><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{change.diff.worse.map((c) => <li key={c.signal}><b>{c.signal}</b>: {STATUS[c.from as keyof typeof STATUS]} → {STATUS[c.to as keyof typeof STATUS]}. {c.finding}</li>)}</ul></div>}
            {change.diff.pagesAdded.length > 0 && <div><div className="eyebrow">New pages ({change.diff.pagesAdded.length})</div><div className="mono" style={{ fontSize: 12 }}>{change.diff.pagesAdded.slice(0, 10).join("  ·  ")}</div></div>}
            {change.diff.pagesRemoved.length > 0 && <div><div className="eyebrow">Pages no longer found ({change.diff.pagesRemoved.length})</div><div className="mono" style={{ fontSize: 12 }}>{change.diff.pagesRemoved.slice(0, 10).join("  ·  ")}</div></div>}
            {change.diff.titlesChanged.length > 0 && <div><div className="eyebrow">Titles changed ({change.diff.titlesChanged.length})</div><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{change.diff.titlesChanged.slice(0, 6).map((t) => <li key={t.path}><span className="mono" style={{ fontSize: 12 }}>{t.path}</span>: “{t.from ?? "none"}” → “{t.to ?? "none"}”</li>)}</ul></div>}
          </Card>
        </section>
      )}

      {(fixes ?? []).length > 0 && (
        <section>
          <h2 className="h2"><span className="n">{num()}</span>Fixes to apply</h2>
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

      {shown && pageList.length > 0 && (
        <section>
          <h2 className="h2"><span className="n">{num()}</span>Pages</h2>
          <div style={{ display: "flex", gap: 8, marginTop: -6, marginBottom: 10 }}>
            <Link href={`/seo/${siteId}`} className={`nav-item${pagesView === "issues" ? "" : " active"}`} style={{ width: "fit-content" }}>All {pageList.length}</Link>
            <Link href={`/seo/${siteId}?pages=issues`} className={`nav-item${pagesView === "issues" ? " active" : ""}`} style={{ width: "fit-content" }}>With issues {pageList.filter((x) => x.issues.length > 0).length}</Link>
          </div>
          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Page</th><th>Title</th><th>Description</th><th>H1</th><th>Words</th><th>Response</th><th style={{ textAlign: "left" }}>Issues</th></tr></thead>
              <tbody>
                {shownPages.map(({ p, issues }) => (
                  <tr key={p.url}>
                    <td style={{ textAlign: "left", maxWidth: 260, overflowWrap: "anywhere" }}><span className="mono" style={{ fontSize: 12 }}>{new URL(p.url).pathname}{new URL(p.url).search}</span>{p.title && <div style={{ fontSize: 12, color: "var(--ink3)" }}>{p.title}</div>}</td>
                    <td className="tabnum">{p.titleLen || "–"}</td>
                    <td className="tabnum">{p.metaDescriptionLen || "–"}</td>
                    <td className="tabnum">{p.h1.length}</td>
                    <td className="tabnum">{p.wordCount}</td>
                    <td className="tabnum">{p.ms} ms</td>
                    <td style={{ textAlign: "left" }}>{issues.length === 0 ? <span className="seo-chip seo-chip-good">None</span> : <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{issues.map((i) => <span key={i.label} className={`seo-chip seo-chip-${i.level}`}>{i.label}</span>)}</span>}</td>
                  </tr>
                ))}
                {shownPages.length === 0 && <tr><td colSpan={7} style={{ textAlign: "left" }}>No pages with issues.</td></tr>}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {shown && report && (
        <section>
          <h2 className="h2"><span className="n">{num()}</span>Links</h2>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {report.broken.length === 0 ? <div>All {report.linksChecked} internal links we checked answered normally.</div> : (
              <>
                <div><b>{report.broken.length} broken</b> of {report.linksChecked} internal links checked.</div>
                <table className="t" style={{ margin: 0 }}>
                  <thead><tr><th style={{ textAlign: "left" }}>Broken link</th><th style={{ width: 110 }}>Answer</th><th style={{ textAlign: "left" }}>Linked from</th></tr></thead>
                  <tbody>{report.broken.map((b) => <tr key={b.url}><td style={{ textAlign: "left", overflowWrap: "anywhere" }} className="mono">{new URL(b.url).pathname}</td><td className="tabnum">{b.status ?? "No response"}</td><td style={{ textAlign: "left" }} className="mono">{b.from.join(", ") || "–"}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </Card>
        </section>
      )}

      {shown && report && report.keywords.length > 0 && (
        <section>
          <h2 className="h2"><span className="n">{num()}</span>What your site talks about</h2>
          <p className="sub" style={{ marginTop: -6 }}>The words and phrases used most across your pages. The main ones should appear in your homepage title, heading and description.</p>
          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Term</th><th>Uses</th><th>Pages</th><th>In title</th><th>In H1</th><th>In description</th></tr></thead>
              <tbody>{report.keywords.map((k) => (
                <tr key={k.term}><td style={{ textAlign: "left", fontWeight: 600 }}>{k.term}</td><td className="tabnum">{k.count}</td><td className="tabnum">{k.pages}</td>
                  {[k.inTitle, k.inH1, k.inDescription].map((v, i) => <td key={i}><span className={`seo-chip seo-chip-${v ? "good" : "not_measured"}`}>{v ? "Yes" : "No"}</span></td>)}</tr>
              ))}</tbody>
            </table>
          </Card>
        </section>
      )}

      {shown && (["seo", "geo", "aeo"] as const).map((d) => {
        const rows = (findings ?? []).filter((f) => f.dimension === d);
        const groups = [...new Set(rows.map((r) => r.grp as string))];
        return (
          <section key={d}>
            <h2 className="h2"><span className="n">{num()}</span>{DIM[d]} findings</h2>
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
