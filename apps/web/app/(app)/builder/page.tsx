import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/seo/copy-button";
import { BUILDER_LIMITS, MEDIA_SPECS, type BuilderInput, type BuilderOutput } from "@acezilla/models";
import { BuilderWizard } from "@/components/builder/wizard";
import { PreviewSwitcher } from "@/components/builder/preview-switcher";
import { loadProducts } from "@/lib/data";
import { todayIso, windowStart } from "@/lib/period";
import Link from "next/link";
import { ago } from "@/lib/format";
import { approveDraft, deleteDraft } from "./actions";

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
  const { rows: prod } = await loadProducts(supabase, current.id, windowStart(todayIso(), 90), todayIso());
  const catalog = prod.filter((r) => r.listed).slice(0, 200).map((r) => ({ id: r.productId, name: r.name, imageUrl: r.imageUrl, images: r.images, store: r.channel === "woocommerce" ? "WooCommerce" : r.channel === "allegro" ? "Allegro" : r.channel }));
  const openId = /^[0-9a-f-]{36}$/.test(sp.draft ?? "") ? sp.draft! : (drafts?.[0]?.id as string | undefined);
  const { data: open } = openId ? await supabase.from("campaign_draft").select("id,platform,title,status,brief,output,created_at").eq("id", openId).eq("workspace_id", current.id).maybeSingle() : { data: null };
  const out = open?.output as BuilderOutput | undefined, brief = open?.brief as BuilderInput | undefined;
  const platform = (open?.platform as keyof typeof PL | undefined) ?? "meta";
  // Files the person uploaded for this draft are private: show them through short-lived signed addresses.
  const assetList = (brief?.assets ?? []) as { path: string; kind: "image" | "video"; w: number; h: number }[];
  const signed = assetList.length ? (await supabase.storage.from("creatives").createSignedUrls(assetList.map((a) => a.path), 3600)).data ?? [] : [];
  const signedUrls = signed.map((x) => x.signedUrl).filter(Boolean) as string[];
  const signedByPath = new Map(assetList.map((a, i) => [a.path, signedUrls[i]] as const));
  const cardImages = ((brief?.cards ?? []) as { url?: string; path?: string }[]).map((c) => c.url ?? (c.path ? signedByPath.get(c.path) : undefined)).filter((u): u is string => !!u);
  const media = cardImages.length ? { images: cardImages } : assetList[0]?.kind === "video" ? { images: [], video: signedUrls[0] } : signedUrls.length ? { images: signedUrls } : brief?.productImages?.length ? { images: brief.productImages } : undefined;

  return (
    <>
      <div>
        <div className="eyebrow">Plan</div>
        <h1 className="page">Campaign builder</h1>
        <p className="sub">Pick a platform and a goal, and get a campaign draft that follows that platform's formats and limits: ad texts with previews, audiences, a budget plan and a launch checklist. It is a draft for you to review. Nothing is sent to Meta, Google or TikTok.</p>
      </div>
      {sp.notice && <Card style={{ color: "var(--pos)" }}>{sp.notice}</Card>}
      {sp.error && <Card style={{ color: "var(--neg)" }}>{sp.error}</Card>}

      <BuilderWizard currency={current.currency} brand={current.name} catalog={catalog} workspaceId={current.id} />

      {open && out && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <h2 className="h2" style={{ margin: 0 }}>{out.campaignName}</h2>
            <span className="eyebrow">{PL[platform]} · {out.objective} · {ago(open.created_at as string)}</span>
            <span className={`seo-chip seo-chip-${open.status === "approved" ? "good" : "not_measured"}`}>{open.status === "approved" ? "Approved" : "Draft"}</span>
          </div>
          <div><div className="eyebrow">Audiences</div><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{out.audiences.map((a) => <li key={a.name}><b>{a.name}</b>: {a.description}</li>)}</ul></div>
          {out.spec && (out.spec.warnings.length > 0 || out.spec.checklist.length > 0 || (out.spec.creative?.length ?? 0) > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
              {out.spec.warnings.length > 0 && (
                <div className="raise3d" style={{ border: "1px solid var(--warn)", borderRadius: 12, padding: 14 }}>
                  <div className="eyebrow" style={{ color: "var(--warn)" }}>Check before launch</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{out.spec.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                </div>
              )}
              {out.spec.creative && out.spec.creative.length > 0 && (
                <div className="raise3d" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
                  <div className="eyebrow">Your files</div>
                  <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>{out.spec.creative.map((c) => <li key={c.text} style={{ color: c.ok ? "var(--pos)" : "var(--warn)" }}>{c.ok ? "✓" : "!"} {c.text}</li>)}</ul>
                </div>
              )}
              {out.spec.checklist.length > 0 && (
                <div className="raise3d" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
                  <div className="eyebrow">Have ready</div>
                  <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>{out.spec.checklist.map((c) => <li key={c}>☐ {c}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="eyebrow">Ads · {out.variants.length} variants{out.spec?.ab ? " · first two are an A/B pair" : ""}</div>
            <div style={{ marginTop: 8 }}>
              <PreviewSwitcher platform={platform} format={out.spec?.format ?? "single"} columns={2} label="Placement" items={out.variants.map((v, i) => ({
                brand: current.name, headline: v.headline, text: v.text, description: v.description, cta: v.cta || undefined, hashtags: out.hashtags, hook: i === 0 ? out.hook : "", media, mediaRatio: assetList[0] ? assetList[0].w / assetList[0].h : null,
                title: (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <b style={{ fontWeight: 600 }}>Variant {String.fromCharCode(65 + i)}</b>
                    {out.spec?.ab && i < 2 && <span className="seo-chip seo-chip-attention">A/B</span>}
                    <span style={{ marginLeft: "auto" }}><CopyButton text={[v.headline, v.text, v.description, v.cta && `[${v.cta}]`, ...(out.hashtags ?? [])].filter(Boolean).join("\n")} label="Copy" /></span>
                  </div>
                ),
              }))} />
            </div>
            <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Limits for {MEDIA_SPECS[platform].short}: {BUILDER_LIMITS[platform].headline ? `headline ${BUILDER_LIMITS[platform].headline}, ` : ""}text {BUILDER_LIMITS[platform].text}{BUILDER_LIMITS[platform].description ? `, description ${BUILDER_LIMITS[platform].description}` : ""} characters. Every variant is inside them.</p>
          </div>
          {out.hook && <div><div className="eyebrow">Video hook (first 3 seconds)</div><p style={{ margin: "4px 0 0" }}>{out.hook}</p></div>}
          {out.hashtags && out.hashtags.length > 0 && <div><div className="eyebrow">Hashtags</div><p className="mono" style={{ margin: "4px 0 0" }}>{out.hashtags.join(" ")}</p></div>}
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
