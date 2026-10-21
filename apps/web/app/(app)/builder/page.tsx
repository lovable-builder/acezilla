import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/seo/copy-button";
import { BUILDER_GOALS, BUILDER_LIMITS, type BuilderInput, type BuilderOutput } from "@acezilla/models";
import Link from "next/link";
import { ago } from "@/lib/format";
import { approveDraft, createDraft, deleteDraft } from "./actions";

export const metadata = { title: "Campaign builder · acezilla" };
export const dynamic = "force-dynamic";
const PL = { meta: "Meta", google: "Google Ads", tiktok: "TikTok" } as const;

function draftText(o: BuilderOutput, p: keyof typeof PL) {
  return [`${o.campaignName} (${PL[p]}, ${o.objective})`, "", "Audiences", ...o.audiences.map((a) => `- ${a.name}: ${a.description}`), "", "Ads",
    ...o.variants.map((v, i) => `${i + 1}. ${[v.headline, v.text, v.description].filter(Boolean).join(" | ")}  [${v.cta}]`),
    ...(o.keywords.length ? ["", "Keywords", ...o.keywords.map((k) => `- ${k.term} (${k.matchType})`)] : []), ...(o.negativeKeywords.length ? ["", `Negative keywords: ${o.negativeKeywords.join(", ")}`] : []),
    "", `Budget: ${o.budgetNote}`, "", "Test plan", ...o.testPlan.map((t) => `- ${t}`), "", "Check before launch", ...o.risks.map((r) => `- ${r}`)].join("\n");
}

export default async function Builder({ searchParams }: { searchParams: Promise<{ draft?: string; error?: string; notice?: string }> }) {
  const sp = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>No workspace found for this account.</Card>;
  const { data: drafts } = await supabase.from("campaign_draft").select("id,platform,title,status,created_at").eq("workspace_id", current.id).order("created_at", { ascending: false }).limit(12);
  const openId = /^[0-9a-f-]{36}$/.test(sp.draft ?? "") ? sp.draft! : (drafts?.[0]?.id as string | undefined);
  const { data: open } = openId ? await supabase.from("campaign_draft").select("id,platform,title,status,brief,output,created_at").eq("id", openId).eq("workspace_id", current.id).maybeSingle() : { data: null };
  const out = open?.output as BuilderOutput | undefined, brief = open?.brief as BuilderInput | undefined;
  const platform = (open?.platform as keyof typeof PL | undefined) ?? "meta";

  return (
    <>
      <div>
        <div className="eyebrow">Plan</div>
        <h1 className="page">Campaign builder</h1>
        <p className="sub">Describe what you want to advertise and get a campaign draft: audiences, ad texts within the platform limits, a budget split and a test plan. It is a draft for you to review. Nothing is sent to Meta, Google or TikTok.</p>
      </div>
      {sp.notice && <Card style={{ color: "var(--pos)" }}>{sp.notice}</Card>}
      {sp.error && <Card style={{ color: "var(--neg)" }}>{sp.error}</Card>}

      <Card style={{ maxWidth: 720 }}>
        <form action={createDraft} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Platform</span>
              <select name="platform" className="field" defaultValue="meta">{Object.entries(PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Goal</span>
              <select name="goal" className="field" defaultValue="sales">{BUILDER_GOALS.map((g) => <option key={g} value={g}>{g.replace(/^./, (c) => c.toUpperCase())}</option>)}</select></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Budget per day ({current.currency}, optional)</span>
              <input name="budgetPerDay" className="field" inputMode="decimal" placeholder="e.g. 50" style={{ width: 150 }} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Language of the ads</span>
              <input name="language" className="field" defaultValue="English" style={{ width: 150 }} maxLength={30} /></label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">What are you advertising?</span>
            <textarea name="product" className="field" rows={3} required minLength={10} maxLength={600} placeholder="Handmade leather wallets made in Krakow, vegetable-tanned leather, 30-day returns" /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Offer or promotion (optional)</span>
            <input name="offer" className="field" maxLength={300} placeholder="Free delivery over 200 PLN" /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Who is it for? (optional)</span>
            <input name="audience" className="field" maxLength={300} placeholder="Men 25-45 buying gifts" /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Tone (optional)</span>
            <input name="tone" className="field" maxLength={60} placeholder="Warm and direct" /></label>
          <div><Button>Draft campaign</Button></div>
          <div className="sub" style={{ margin: 0, fontSize: 12 }}>Drafting takes a few seconds. A short summary of what you type here is sent to Google's Gemini to write the draft.</div>
        </form>
      </Card>

      {open && out && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <h2 className="h2" style={{ margin: 0 }}>{out.campaignName}</h2>
            <span className="eyebrow">{PL[platform]} · {out.objective} · {ago(open.created_at as string)}</span>
            <span className={`seo-chip seo-chip-${open.status === "approved" ? "good" : "not_measured"}`}>{open.status === "approved" ? "Approved" : "Draft"}</span>
          </div>
          <div><div className="eyebrow">Audiences</div><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{out.audiences.map((a) => <li key={a.name}><b>{a.name}</b>: {a.description}</li>)}</ul></div>
          <div>
            <div className="eyebrow">Ad texts (limits: {BUILDER_LIMITS[platform].headline ? `headline ${BUILDER_LIMITS[platform].headline}, ` : ""}text {BUILDER_LIMITS[platform].text}{BUILDER_LIMITS[platform].description ? `, description ${BUILDER_LIMITS[platform].description}` : ""} characters)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {out.variants.map((v, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ minWidth: 200, flex: 1 }}>{v.headline && <b>{v.headline}</b>}<div style={{ overflowWrap: "anywhere" }}>{v.text}</div>{v.description && <div className="sub" style={{ margin: 0, fontSize: 13 }}>{v.description}</div>}<span className="eyebrow">Button: {v.cta}</span></div>
                  <CopyButton text={[v.headline, v.text, v.description].filter(Boolean).join("\n")} label="Copy" />
                </div>
              ))}
            </div>
          </div>
          {out.keywords.length > 0 && <div><div className="eyebrow">Keywords</div><div className="mono" style={{ fontSize: 13, marginTop: 6 }}>{out.keywords.map((k) => `${k.term} (${k.matchType})`).join("  ·  ")}</div>{out.negativeKeywords.length > 0 && <div className="sub" style={{ fontSize: 13, marginBottom: 0 }}>Negative: {out.negativeKeywords.join(", ")}</div>}</div>}
          <div><div className="eyebrow">Budget</div><p style={{ margin: "4px 0 0" }}>{out.budgetNote}</p></div>
          <div><div className="eyebrow">Test plan</div><ol style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "decimal" }}>{out.testPlan.map((t) => <li key={t}>{t}</li>)}</ol></div>
          <div><div className="eyebrow">Check before launch</div><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{out.risks.map((t) => <li key={t}>{t}</li>)}</ul></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <CopyButton text={draftText(out, platform)} label="Copy whole draft" />
            {open.status !== "approved" && <form action={approveDraft}><input type="hidden" name="id" value={open.id as string} /><Button variant="outline">Mark as reviewed and approved</Button></form>}
            <form action={deleteDraft}><input type="hidden" name="id" value={open.id as string} /><Button variant="ghost" style={{ color: "var(--neg)" }}>Delete</Button></form>
          </div>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Approving only records that a person reviewed it. To run it, copy the texts into {PL[platform]} yourself. Check every claim and fill any [placeholder] before launch.{brief ? ` Brief: ${brief.goal}, ${brief.language}.` : ""}</p>
        </Card>
      )}

      {drafts && drafts.length > 0 && (
        <Card style={{ maxWidth: 720 }}>
          <b>Your drafts</b>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {drafts.map((d) => (
              <li key={d.id as string} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Link href={`/builder?draft=${d.id}`} style={{ color: "var(--accent-ink)", fontWeight: d.id === openId ? 600 : 400 }}>{d.title as string}</Link>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{PL[d.platform as keyof typeof PL]} · {ago(d.created_at as string)}</span>
                {d.status === "approved" && <span className="seo-chip seo-chip-good">Approved</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
