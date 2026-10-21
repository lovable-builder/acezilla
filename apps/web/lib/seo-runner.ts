import "server-only";
import { buildReport, crawlSite, scoreAudit } from "@acezilla/seo";
import type { createAdminClient } from "@/lib/supabase/admin";
import { draftFixes } from "@/lib/seo-fixes";

type Admin = ReturnType<typeof createAdminClient>;
/** Guards cost and abuse. Raise them when billing exists. */
export const LIMITS = { sites: 5, auditsPerSitePerDay: 3, maxPages: 25 };

export async function createAudit(admin: Admin, siteId: string, workspaceId: string, trigger: "manual" | "weekly") {
  const { data, error } = await admin.from("seo_audit").insert({ site_id: siteId, workspace_id: workspaceId, trigger, status: "queued" }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Crawl, score and save one audit. Never throws: failures are recorded on the audit row for the UI to show. */
export async function runAudit(admin: Admin, auditId: string): Promise<void> {
  const fail = async (message: string) => { await admin.from("seo_audit").update({ status: "failed", error: message.slice(0, 300), finished_at: new Date().toISOString() }).eq("id", auditId); };
  try {
    const { data: audit } = await admin.from("seo_audit").select("id,site_id,workspace_id").eq("id", auditId).maybeSingle();
    if (!audit) return;
    const { data: site } = await admin.from("seo_site").select("id,url").eq("id", audit.site_id).maybeSingle();
    if (!site) return fail("The site no longer exists");
    await admin.from("seo_audit").update({ status: "running", started_at: new Date().toISOString() }).eq("id", auditId);

    const crawl = await crawlSite(site.url as string, { maxPages: LIMITS.maxPages });
    if (!crawl.ok) return fail(crawl.error);
    const result = scoreAudit(crawl);
    const ws = audit.workspace_id as string;

    await admin.from("seo_page").insert(crawl.pages.map((p) => { const { text: _text, ...data } = p; return { audit_id: auditId, workspace_id: ws, url: p.url, data }; }));
    await admin.from("seo_finding").insert(result.findings.map((f) => ({ audit_id: auditId, workspace_id: ws, dimension: f.dimension, grp: f.group, signal: f.signal, finding: f.finding, status: f.status, weight: f.weight, page_url: f.pageUrl ?? null, fix_kind: f.fixKind ?? null })));
    // AI-drafted wording is a bonus: if it fails, the audit is still complete and the reason is only logged.
    const drafted = await draftFixes(crawl.pages);
    if (drafted.ok && drafted.fixes.length) {
      await admin.from("seo_fix").insert(drafted.fixes.map((f) => ({ audit_id: auditId, workspace_id: ws, kind: f.kind, page_url: f.pageUrl, signal: null, current: f.current, proposed: f.proposed, rationale: f.rationale })));
      // Text on the page that tries to instruct AI systems is a finding in its own right: report it, never act on it.
    }
    if (drafted.ok && drafted.flagged.length) {
      await admin.from("seo_finding").insert(drafted.flagged.slice(0, 5).map((f) => ({ audit_id: auditId, workspace_id: ws, dimension: "geo", grp: "Technical GEO", signal: "Text aimed at AI tools", finding: `The page contains text that tries to instruct AI systems: “${f.excerpt}”. It was ignored. Remove it unless it is yours.`, status: "attention", weight: 2, page_url: f.pageUrl, fix_kind: "manual" })));
    } else if (!drafted.ok) console.warn(`[seo] fixes not drafted (${drafted.kind}):`, drafted.reason);
    const now = new Date().toISOString();
    await admin.from("seo_audit").update({ status: "done", scores: result.scores, summary: result.summary, pages_crawled: crawl.pages.length, report: buildReport(crawl), finished_at: now }).eq("id", auditId);
    await admin.from("seo_site").update({ last_audit_at: now }).eq("id", site.id);
  } catch (e) {
    await fail("The audit could not be completed. Please try again.");
    console.warn("[seo] audit failed", auditId, e instanceof Error ? e.message : e);
  }
}

/** Audits that have been "running" for too long (function timed out) are marked failed so the UI never hangs. */
export async function sweepStuckAudits(admin: Admin) {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  await admin.from("seo_audit").update({ status: "failed", error: "The audit timed out. Please try again.", finished_at: new Date().toISOString() })
    .in("status", ["queued", "running"]).lt("created_at", cutoff);
}
