import Link from "next/link";
import { ANGLES, ANGLE_LABEL, AD_SOURCES, SOURCE_LABEL, SIGNAL, angleSummary, libraryLink, rankAds, LONG_RUN, type Signal } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { todayUtc } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/app/term";
import { ScreenshotUpload } from "@/components/competitors/screenshot-upload";
import { addCompetitor, addCompetitorAd, deleteCompetitor, deleteCompetitorAd, importMetaAds } from "./actions";

export const metadata = { title: "Competitor ads · acezilla" };

const SIGNAL_COLOR: Record<Signal, string> = {
  long_runner: "var(--pos)", holding: "var(--ink)", testing: "var(--ink3)", short_run: "var(--warn)", stopped_early: "var(--neg)", unknown: "var(--ink3)",
};
const short = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : "?");
const lab = (t: string) => <span className="eyebrow">{t}</span>;
const col = { display: "flex", flexDirection: "column", gap: 4 } as const;
const input = { padding: "8px 10px" } as const;

export default async function Competitors({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; category?: string; angle?: string; source?: string }> }) {
  const { error, notice, category = "", angle = "", source = "" } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>Create a workspace first.</Card>;
  const today = todayUtc();

  const [{ data: compRows }, { data: adRows }] = await Promise.all([
    supabase.from("competitor").select("id,name,website,category").eq("workspace_id", current.id).order("name"),
    supabase.from("competitor_ad").select("id,competitor_id,platform,link,started_on,ended_on,still_running,variants,angle,headline,notes,image_path").eq("workspace_id", current.id).limit(2000),
  ]);
  const competitors = (compRows ?? []).map((c) => ({ id: c.id as string, name: c.name as string, website: (c.website as string | null) ?? null, category: ((c.category as string) ?? "").trim() }));
  const byId = new Map(competitors.map((c) => [c.id, c]));
  const categories = [...new Set(competitors.map((c) => c.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const all = (adRows ?? []).filter((a) => byId.has(a.competitor_id as string)).map((a) => ({
    id: a.id as string, competitorId: a.competitor_id as string, platform: a.platform as string, startedOn: (a.started_on as string | null) ?? null,
    endedOn: (a.ended_on as string | null) ?? null, stillRunning: !!a.still_running, variants: Number(a.variants ?? 1), angle: a.angle as string,
    link: (a.link as string | null) ?? null, headline: (a.headline as string | null) ?? null, notes: (a.notes as string | null) ?? null, imagePath: (a.image_path as string | null) ?? null,
  }));
  const inCategory = (id: string) => !category || byId.get(id)?.category === category;
  const ranked = rankAds(all.filter((a) => inCategory(a.competitorId)), today);
  const shown = ranked.filter((a) => (!angle || a.angle === angle) && (!source || a.platform === source));
  const angles = angleSummary(ranked);

  const paths = shown.map((a) => a.imagePath).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("creatives").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const href = (o: { category?: string; angle?: string; source?: string }) => {
    const q = new URLSearchParams();
    const c = o.category ?? category, a = o.angle ?? angle, s = o.source ?? source;
    if (c) q.set("category", c); if (a) q.set("angle", a); if (s) q.set("source", s);
    return `/competitors${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 13, border: `1px solid ${active ? "var(--accent)" : "var(--line2)"}`, background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent-ink)" : "var(--ink2)", textDecoration: "none" }) as const;

  const longRunners = ranked.filter((a) => a.signal === "long_runner").length;
  const inView = competitors.filter((c) => inCategory(c.id));

  return (
    <>
      <div>
        <div className="eyebrow">Analyze · Competitor ads</div>
        <h1 className="page">See what your competitors keep running</h1>
        <p className="sub">Save the ads you find in each platform&apos;s public ad library, sort them by how long they have run, and filter by your category. Nobody can see a competitor&apos;s sales, so an ad that has run for a long time is the best sign that it works. Notes only: nothing is sent to anyone.</p>
      </div>
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="eyebrow" style={{ marginRight: 4 }}>Category</span>
        <Link href={href({ category: "" })} style={chip(!category)}>All ({competitors.length})</Link>
        {categories.map((c) => <Link key={c} href={href({ category: c })} style={chip(category === c)}>{c} ({competitors.filter((x) => x.category === c).length})</Link>)}
      </div>

      <div className="kpis">
        {([
          ["Competitors watched", String(inView.length), category ? `in ${category}` : "in all categories"],
          ["Ads saved", String(ranked.length), `${shown.length} shown with the filters`],
          [`Long runners`, String(longRunners), `ran ${LONG_RUN}+ days`],
          ["Most used message", angles[0] ? ANGLE_LABEL[angles[0].angle] ?? angles[0].angle : "—", angles[0] ? `${angles[0].ads} ads · ${angles[0].competitors} competitors` : "save some ads first"],
        ] as [string, string, string][]).map(([label, value, sub], i) => (
          <div className="kpi rise" style={{ "--i": i } as React.CSSProperties} key={label}>
            <span className="eyebrow"><Term>{label}</Term></span>
            <span className="tabnum" style={{ fontSize: 22, fontWeight: 600, overflowWrap: "anywhere" }}>{value}</span>
            <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{sub}</span>
          </div>
        ))}
      </div>

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">1</span>Ads, longest running first</h2>
          <span className="eyebrow">{shown.length} shown</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ marginRight: 4 }}>Message</span>
          <Link href={href({ angle: "" })} style={chip(!angle)}>Any</Link>
          {ANGLES.filter((a) => ranked.some((r) => r.angle === a.id)).map((a) => <Link key={a.id} href={href({ angle: a.id })} style={chip(angle === a.id)}>{a.label}</Link>)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ marginRight: 4 }}>Seen on</span>
          <Link href={href({ source: "" })} style={chip(!source)}>Anywhere</Link>
          {AD_SOURCES.filter((s) => ranked.some((r) => r.platform === s.id)).map((s) => <Link key={s.id} href={href({ source: s.id })} style={chip(source === s.id)}>{s.label}</Link>)}
        </div>
        {shown.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>{all.length === 0 ? "No ads saved yet. Add a competitor below, open their ads with the links, and save the ones worth learning from." : "No saved ad matches these filters."}</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
            {shown.map((a) => {
              const comp = byId.get(a.competitorId)!, sig = SIGNAL[a.signal];
              const img = a.imagePath ? urls.get(a.imagePath) : undefined;
              return (
                <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--surface2)", display: "flex", flexDirection: "column" }}>
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={`Ad from ${comp.name}`} style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderBottom: "1px solid var(--line)" }} />
                  )}
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <b style={{ fontWeight: 600 }}>{comp.name}</b>
                      <span className="eyebrow">{comp.category || "No category"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span title={sig.hint} style={{ color: SIGNAL_COLOR[a.signal], fontWeight: 600, fontSize: 14 }}><Term k="Ad signal">{sig.label}</Term></span>
                      <span className="tabnum mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{a.days === null ? "dates missing" : `${a.days} days`}{a.stillRunning ? " · still running" : ""}</span>
                    </div>
                    {a.headline && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>&ldquo;{a.headline}&rdquo;</p>}
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink2)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span>{ANGLE_LABEL[a.angle] ?? a.angle}</span>·<span>{SOURCE_LABEL[a.platform] ?? a.platform}</span>·<span className="tabnum"><Term k="Variants">{`${a.variants} ${a.variants === 1 ? "version" : "versions"}`}</Term></span>
                    </div>
                    {a.notes && <p className="sub" style={{ margin: 0, fontSize: 13 }}>{a.notes}</p>}
                    <div className="mono tabnum" style={{ fontSize: 11, color: "var(--ink3)" }}>{short(a.startedOn)} → {a.stillRunning ? "today" : short(a.endedOn)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: "auto", alignItems: "center" }}>
                      {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--accent-ink)" }}>Open the ad</a>}
                      <form action={deleteCompetitorAd} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={a.id} /><Button variant="ghost" size="sm">Remove</Button></form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="sub" style={{ margin: 0, fontSize: 12 }}>How to read it: the signal is a hint, not proof. We cannot see what a competitor spends or sells, so a long-running ad is a good sign that it pays for itself, and an ad stopped within two weeks probably did not. Look at ads that several competitors run for a long time.</p>
      </Card>

      {angles.length > 0 && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">2</span>Messages competitors lean on{category ? ` in ${category}` : ""}</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="t">
              <thead><tr><th style={{ textAlign: "left" }}><Term>Message</Term></th><th>Ads</th><th>Competitors</th><th>Long runners</th></tr></thead>
              <tbody>
                {angles.map((r) => (
                  <tr key={r.angle}>
                    <td style={{ textAlign: "left" }}><Link href={href({ angle: r.angle })} style={{ color: "inherit" }}>{ANGLE_LABEL[r.angle] ?? r.angle}</Link></td>
                    <td className="tabnum">{r.ads}</td><td className="tabnum">{r.competitors}</td>
                    <td className="tabnum" style={{ color: r.longRunners ? "var(--pos)" : undefined, fontWeight: r.longRunners ? 600 : undefined }}>{r.longRunners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ margin: 0, fontSize: 12 }}>A message that several competitors keep running for months is working for them. A message nobody uses is either an opening for you or a reason nobody tried it.</p>
        </Card>
      )}

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">3</span>Competitors you watch</h2>
        {competitors.length === 0 ? <p className="sub" style={{ margin: 0 }}>Add the shops that sell what you sell. Tag each with your category so you can filter their ads.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="t">
              <thead><tr><th style={{ textAlign: "left" }}>Name</th><th style={{ textAlign: "left" }}>Category</th><th style={{ textAlign: "left" }}>Find their ads</th><th>Saved ads</th><th /></tr></thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.id}>
                    <td style={{ textAlign: "left" }}><b style={{ fontWeight: 600 }}>{c.name}</b>{c.website && <> <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--ink3)" }}>site</a></>}</td>
                    <td style={{ textAlign: "left" }}>{c.category || <span className="sub">—</span>}</td>
                    <td style={{ textAlign: "left", display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {(["meta", "tiktok", "google"] as const).map((s) => <a key={s} href={libraryLink(s, c.name, "PL", c.website)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--accent-ink)" }}>{SOURCE_LABEL[s]}</a>)}
                    </td>
                    <td className="tabnum">{all.filter((a) => a.competitorId === c.id).length}</td>
                    <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <form action={importMetaAds}><input type="hidden" name="id" value={c.id} /><Button variant="outline" size="sm" title="Reads this competitor's ads from Meta's public Ad Library">Import from Meta</Button></form>
                      <form action={deleteCompetitor}><input type="hidden" name="id" value={c.id} /><Button variant="ghost" size="sm">Remove</Button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sub" style={{ margin: 0, fontSize: 12 }}>The links open each platform&apos;s public ad library in a new tab. Facebook and Instagram search by the name here. Google searches by the website when you gave one. TikTok opens on its search page, where you type the name. &quot;Import from Meta&quot; reads the Ad Library for you, but only works once Meta has approved your Facebook account for the Ad Library API. Removing a competitor also removes its saved ads.</p>
        <form action={addCompetitor} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={col}>{lab("Name")}<input name="name" required maxLength={80} placeholder="Acme Home" className="field" style={input} /></label>
          <label style={col}>{lab("Website (optional)")}<input name="website" maxLength={200} placeholder="acmehome.pl" className="field" style={input} /></label>
          <label style={col}>{lab("Your category")}<input name="category" list="cats" maxLength={40} placeholder="Kitchen" className="field" style={input} /></label>
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <Button>Add competitor</Button>
        </form>
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">4</span>Save an ad</h2>
        {competitors.length === 0 ? <p className="sub" style={{ margin: 0 }}>Add a competitor first.</p> : (
          <form action={addCompetitorAd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={col}>{lab("Competitor")}<select name="competitor_id" required className="field" style={input} defaultValue="">
                <option value="" disabled>Choose…</option>
                {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.category ? ` · ${c.category}` : ""}</option>)}
              </select></label>
              <label style={col}>{lab("Seen on")}<select name="platform" className="field" style={input}>{AD_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label style={col}>{lab("Message")}<select name="angle" className="field" style={input} defaultValue="other">{ANGLES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={col}>{lab("Started (the library shows this)")}<input name="started_on" type="date" max={today} className="field" style={input} /></label>
              <label style={col}>{lab("Ended")}<input name="ended_on" type="date" max={today} className="field" style={input} /></label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, paddingBottom: 9 }}><input type="checkbox" name="still_running" defaultChecked />Still running</label>
              <label style={col}>{lab("Versions of this ad")}<input name="variants" type="number" min="1" max="99" defaultValue="1" className="field tabnum" style={{ ...input, width: 100 }} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ ...col, flex: "1 1 260px" }}>{lab("Link to the ad (optional)")}<input name="link" maxLength={500} placeholder="https://www.facebook.com/ads/library/?id=…" className="field" style={input} /></label>
              <label style={{ ...col, flex: "1 1 260px" }}>{lab("What the ad says (optional)")}<input name="headline" maxLength={200} placeholder="Free delivery on orders over 99 zł" className="field" style={input} /></label>
            </div>
            <label style={col}>{lab("Your notes (optional)")}<textarea name="notes" maxLength={600} rows={2} placeholder="Shows the product in use, a creator voiceover, three discount tiers…" className="field" style={input} /></label>
            <ScreenshotUpload workspaceId={current.id} />
            <div><Button>Save ad</Button></div>
          </form>
        )}
        <p className="sub" style={{ margin: 0, fontSize: 12 }}>Ad libraries show when an ad started, whether it is still active and, on Facebook and Instagram, how many versions of it exist. Copy those in. Dates and versions are what the signal uses.</p>
      </Card>
    </>
  );
}
