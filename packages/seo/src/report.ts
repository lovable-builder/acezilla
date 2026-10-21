import type { PageData } from "./analyze";
import type { BrokenLink, CrawlResult } from "./crawl";
import type { Dimension } from "./score";

export interface KeywordRow { term: string; count: number; pages: number; inTitle: boolean; inH1: boolean; inDescription: boolean }
/** Extra analysis saved with each audit (the rule-based score lives in findings). */
export interface AuditReport { keywords: KeywordRow[]; broken: BrokenLink[]; linksChecked: number }

/** Boilerplate pages say little about what a site is about, so they are left out of the keyword count. */
const BOILERPLATE = /\/(privacy|terms|cookies?|legal|data-deletion|login|log-in|sign-?in|sign-?up|register|forgot-password|reset-password|account|cart|checkout)(\/|$)/i;

export function siteKeywords(pages: PageData[], limit = 12): KeywordRow[] {
  const home = pages[0];
  pages = pages.filter((p, i) => i === 0 || (!BOILERPLATE.test(safePath(p.url)) && !/noindex/i.test(p.robotsMeta ?? "")));
  const agg = new Map<string, { count: number; pages: number }>();
  for (const p of pages) for (const { t, n } of p.terms ?? []) { const a = agg.get(t) ?? { count: 0, pages: 0 }; a.count += n; a.pages++; agg.set(t, a); }
  const has = (s: string | null | undefined, t: string) => !!s && s.toLowerCase().includes(t);
  return [...agg].map(([term, a]) => ({
    term, count: a.count, pages: a.pages,
    inTitle: has(home?.title, term), inH1: (home?.h1 ?? []).some((h) => has(h, term)), inDescription: has(home?.metaDescription, term),
  })).sort((a, b) => b.pages - a.pages || b.count - a.count || b.term.length - a.term.length).slice(0, limit);
}

export function buildReport(crawl: Extract<CrawlResult, { ok: true }>): AuditReport {
  return { keywords: siteKeywords(crawl.pages), broken: crawl.broken ?? [], linksChecked: crawl.linksChecked ?? 0 };
}

export interface PageIssue { label: string; level: "attention" | "missing" }
/** Quick per-page checks for the pages table. The scored audit remains the source of truth. */
export function pageIssues(p: PageData): PageIssue[] {
  const o: PageIssue[] = [];
  const add = (label: string, level: PageIssue["level"] = "attention") => o.push({ label, level });
  if (/noindex/i.test(p.robotsMeta ?? "")) return [{ label: "Hidden from search (noindex)", level: "attention" }];
  if (!p.title) add("No title", "missing"); else if (p.titleLen > 60) add("Title too long"); else if (p.titleLen < 30) add("Title short");
  if (!p.metaDescription) add("No description", "missing"); else if (p.metaDescriptionLen > 160) add("Description too long"); else if (p.metaDescriptionLen < 70) add("Description short");
  if (p.h1.length === 0) add("No H1", "missing"); else if (p.h1.length > 1) add("Several H1s");
  if (!p.canonical) add("No canonical");
  if (p.wordCount < 150) add("Thin content");
  if (p.images.missingAlt > 0) add(`${p.images.missingAlt} image${p.images.missingAlt === 1 ? "" : "s"} without alt`);
  if (p.ms > 1800) add("Slow response");
  return o;
}

export interface FindingLite { signal: string; status: string; finding: string; weight: number; dimension?: string }
const RANK: Record<string, number> = { good: 3, attention: 2, missing: 1 };

export interface AuditDiff {
  fixed: { signal: string; from: string; to: string; finding: string }[];
  worse: { signal: string; from: string; to: string; finding: string; weight: number }[];
  pagesAdded: string[]; pagesRemoved: string[];
  titlesChanged: { path: string; from: string | null; to: string | null }[];
}

const safePath = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
const path = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };

/** What changed between two audits of the same site: signals that moved, pages that appeared or vanished, titles that changed. */
export function diffAudits(prev: { findings: FindingLite[]; pages: { url: string; title: string | null }[] }, cur: { findings: FindingLite[]; pages: { url: string; title: string | null }[] }): AuditDiff {
  const before = new Map(prev.findings.filter((f) => RANK[f.status]).map((f) => [f.signal, f]));
  const d: AuditDiff = { fixed: [], worse: [], pagesAdded: [], pagesRemoved: [], titlesChanged: [] };
  for (const f of cur.findings) {
    const b = before.get(f.signal);
    if (!b || !RANK[f.status]) continue;
    if (RANK[f.status]! > RANK[b.status]!) d.fixed.push({ signal: f.signal, from: b.status, to: f.status, finding: f.finding });
    else if (RANK[f.status]! < RANK[b.status]!) d.worse.push({ signal: f.signal, from: b.status, to: f.status, finding: f.finding, weight: f.weight });
  }
  d.worse.sort((a, b) => b.weight - a.weight);
  const pp = new Map(prev.pages.map((p) => [path(p.url), p])), cp = new Map(cur.pages.map((p) => [path(p.url), p]));
  d.pagesAdded = [...cp.keys()].filter((k) => !pp.has(k));
  d.pagesRemoved = [...pp.keys()].filter((k) => !cp.has(k));
  for (const [k, p] of cp) { const o = pp.get(k); if (o && o.title !== p.title) d.titlesChanged.push({ path: k, from: o.title, to: p.title }); }
  return d;
}

export type Scores = Record<Dimension, number>;
/** Weekly email rule: a score fell by 1+ points, or a heavy signal got worse. Small wobbles stay quiet. */
export function weeklyVerdict(prev: Scores, cur: Scores, diff: AuditDiff): { send: boolean; drops: { dimension: Dimension; from: number; to: number }[]; reasons: string[] } {
  const drops = (["seo", "geo", "aeo"] as const).filter((d) => cur[d] <= prev[d] - 1).map((d) => ({ dimension: d, from: prev[d], to: cur[d] }));
  const heavy = diff.worse.filter((w) => w.weight >= 3);
  return { send: drops.length > 0 || heavy.length > 0, drops, reasons: heavy.slice(0, 5).map((w) => `${w.signal}: now ${w.to.replace("_", " ")}`) };
}
