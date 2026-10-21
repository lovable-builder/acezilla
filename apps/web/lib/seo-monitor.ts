import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diffAudits, weeklyVerdict, type AuditDiff, type Scores } from "@acezilla/seo";
import { renderSeoEmail } from "@acezilla/notify";
import { notify } from "@/lib/alerts";
import { SITE } from "@/lib/legal";
import type { createAdminClient } from "@/lib/supabase/admin";
import { createAudit, runAudit, sweepStuckAudits } from "@/lib/seo-runner";

type Admin = ReturnType<typeof createAdminClient>;

/** What a diff needs from one audit: its findings and the title of each page. Works with the user's session (RLS) or the admin client. */
export async function loadSnapshot(db: SupabaseClient, auditId: string) {
  const [f, p] = await Promise.all([
    db.from("seo_finding").select("signal,status,finding,weight").eq("audit_id", auditId),
    db.from("seo_page").select("url,data").eq("audit_id", auditId),
  ]);
  return {
    findings: (f.data ?? []) as { signal: string; status: string; finding: string; weight: number }[],
    pages: (p.data ?? []).map((r) => ({ url: r.url as string, title: ((r.data as { title?: string | null } | null)?.title ?? null) })),
  };
}

/** The finished audit just before `audit`, and what changed since then. */
export async function compareWithPrevious(db: SupabaseClient, audit: { id: string; site_id: string; created_at: string }) {
  const { data: prev } = await db.from("seo_audit").select("id,scores,finished_at").eq("site_id", audit.site_id).eq("status", "done").lt("created_at", audit.created_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!prev) return null;
  const [a, b] = await Promise.all([loadSnapshot(db, prev.id as string), loadSnapshot(db, audit.id)]);
  return { prev: { scores: prev.scores as Scores, finishedAt: prev.finished_at as string }, diff: diffAudits(a, b) as AuditDiff };
}

/** Re-audits every monitored site that has not been checked for ~a week, and emails only when something got worse. */
export async function runWeeklyAudits(admin: Admin, o: { maxSites?: number; budgetMs?: number } = {}) {
  const started = Date.now(), maxSites = o.maxSites ?? 10, budget = o.budgetMs ?? 240_000;
  await sweepStuckAudits(admin);
  const cutoff = new Date(Date.now() - 6 * 86400000).toISOString();
  const { data: sites } = await admin.from("seo_site").select("id,workspace_id,host,last_audit_at").eq("monitoring", true)
    .or(`last_audit_at.is.null,last_audit_at.lt.${cutoff}`).order("last_audit_at", { ascending: true, nullsFirst: true }).limit(maxSites);
  const out = { due: sites?.length ?? 0, audited: 0, emailed: 0, failed: 0, skipped: 0 };
  for (const s of sites ?? []) {
    if (Date.now() - started > budget) { out.skipped++; continue; }
    const { data: busy } = await admin.from("seo_audit").select("id").eq("site_id", s.id).in("status", ["queued", "running"]).limit(1);
    if (busy?.length) { out.skipped++; continue; }
    try {
      const id = await createAudit(admin, s.id as string, s.workspace_id as string, "weekly");
      await runAudit(admin, id);
      const { data: audit } = await admin.from("seo_audit").select("id,site_id,status,scores,created_at").eq("id", id).single();
      if (audit?.status !== "done") { out.failed++; continue; }
      out.audited++;
      const cmp = await compareWithPrevious(admin, audit as { id: string; site_id: string; created_at: string });
      if (!cmp) continue;
      const cur = audit.scores as Scores;
      const v = weeklyVerdict(cmp.prev.scores, cur, cmp.diff);
      if (!v.send) continue;
      const mail = renderSeoEmail({ host: s.host as string, url: `${SITE}/seo/${s.id}`, scores: cur, drops: v.drops, reasons: v.reasons, fixed: cmp.diff.fixed.map((f) => f.signal) });
      if ((await notify(admin, s.workspace_id as string, mail.subject, mail.html, mail.text, `seo:${id}`)) > 0) out.emailed++;
    } catch (e) {
      out.failed++;
      console.warn("[seo] weekly audit failed", s.id, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
