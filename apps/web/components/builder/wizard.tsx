"use client";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { budgetGuide, creativeChecks, MEDIA_PLATFORMS, MEDIA_SPECS, type MediaPlatform } from "@acezilla/models";
import { createDraft } from "@/app/(app)/builder/actions";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Thumb } from "@/components/app/thumb";
import { PreviewSwitcher } from "./preview-switcher";
import { CreativeUpload, type UploadedAsset } from "./creative-upload";

const STEPS = ["Platform", "Goal & format", "Product & message", "Budget", "Review"];
export interface CatalogEntry { id: string; name: string; store: string; imageUrl?: string | null }

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className={`btn${pending ? " bw-shimmer" : ""}`} disabled={pending} style={{ padding: "12px 22px", fontSize: 15, color: pending ? "#fff" : undefined }}>
      {pending ? "Writing your campaign…" : "✨ Draft my campaign"}
    </button>
  );
}

const Pick = ({ name, value, checked, onChange, children }: { name: string; value: string; checked: boolean; onChange: () => void; children: React.ReactNode }) => (
  <label className="bw-pick"><input type="radio" name={name} value={value} checked={checked} onChange={onChange} />{children}</label>
);

/** A guided form that follows each platform's own options. One form, five steps; nothing is sent to any ad platform. */
export function BuilderWizard({ currency, brand, catalog, workspaceId }: { currency: string; brand: string; catalog: CatalogEntry[]; workspaceId: string }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<MediaPlatform>("meta");
  const spec = MEDIA_SPECS[platform];
  const [goal, setGoal] = useState("sales");
  const [format, setFormat] = useState(spec.formats[0]!.id);
  const [optimization, setOptimization] = useState("add_to_cart");
  const [product, setProduct] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [offer, setOffer] = useState("");
  const [budget, setBudget] = useState("");
  const [ab, setAb] = useState(false);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [usePhotos, setUsePhotos] = useState(true);
  const [pickedName, setPickedName] = useState("");

  const fmt = spec.formats.find((f) => f.id === format) ?? spec.formats[0]!;
  const opts = spec.optimizations?.[goal];
  const guide = budgetGuide(platform, goal, currency);
  const b = Number(budget.replace(",", "."));
  const budgetKnown = budget.trim() !== "" && Number.isFinite(b) && b > 0;
  const scale = guide ? guide.recommended * 1.6 : 100;

  const choosePlatform = (p: MediaPlatform) => {
    const s = MEDIA_SPECS[p];
    setPlatform(p); setGoal("sales"); setFormat(s.formats[0]!.id); setOptimization(s.optimizations?.sales?.find((o) => o.recommended)?.id ?? s.optimizations?.sales?.[0]?.id ?? ""); setItems([]);
  };
  const chooseGoal = (g: string) => { setGoal(g); const o = spec.optimizations?.[g]; setOptimization(o?.find((x) => x.recommended)?.id ?? o?.[0]?.id ?? ""); };

  const shown = useMemo(() => catalog.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 60), [catalog, query]);
  const toggle = (name: string) => setItems((cur) => cur.includes(name) ? cur.filter((x) => x !== name) : fmt.items && cur.length >= fmt.items.max ? cur : [...cur, name]);

  const stepReady = [true, true,
    fmt.items ? items.length >= fmt.items.min : product.trim().length >= 10,
    true, true][step]!;
  const hint = step === 2 ? (fmt.items ? `Pick ${fmt.items.min} to ${fmt.items.max} products.` : "Describe what you are advertising in at least a sentence.") : "";
  const primary = fmt.items ? items.join(", ") : product;
  // Product photos: for a carousel, the photos of the chosen products; otherwise the product started from.
  const photoOf = (name: string) => catalog.find((c) => c.name === name)?.imageUrl ?? null;
  const productPhotos = (fmt.items ? items.map(photoOf) : [photoOf(pickedName)]).filter((u): u is string => !!u).slice(0, 10);
  const first = assets[0];
  const mediaRatio = first ? first.w / first.h : null;
  const checks = creativeChecks(platform, format, assets, { cards: fmt.items ? items.length || fmt.items.min : undefined });
  const media = assets.length ? (assets[0]!.kind === "video" ? { images: [], video: assets[0]!.preview } : { images: assets.map((a) => a.preview) }) : usePhotos && productPhotos.length ? { images: productPhotos } : undefined;

  return (
    <form action={createDraft} className="bw">
      <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <div className="bw-steps" role="tablist" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button key={s} type="button" role="tab" className={`bw-step${i < step ? " done" : ""}`} aria-current={i === step ? "step" : undefined} onClick={() => (i <= step || stepReady) && setStep(i)}>
              <span className="dot">{i < step ? "✓" : i + 1}</span>{s}
            </button>
          ))}
        </div>

        {/* Every step stays in the form so all values are submitted; only the current one is shown. */}
        <section className="bw-panel" hidden={step !== 0}>
          <div><h2 className="h2" style={{ margin: 0 }}>Where will it run?</h2><p className="sub" style={{ margin: "4px 0 0" }}>Each platform has its own formats, goals and limits. We follow them.</p></div>
          <div className="bw-grid">
            {MEDIA_PLATFORMS.map((p) => (
              <Pick key={p} name="platform" value={p} checked={platform === p} onChange={() => choosePlatform(p)}>
                <BrandLogo brand={p === "meta" ? "meta" : p === "google" ? "google" : "tiktok"} size={40} />
                <b style={{ fontWeight: 600 }}>{MEDIA_SPECS[p].label}</b>
                <span className="sub" style={{ margin: 0, fontSize: 12 }}>{MEDIA_SPECS[p].pitch}</span>
              </Pick>
            ))}
          </div>
        </section>

        <section className="bw-panel" hidden={step !== 1}>
          <div><h2 className="h2" style={{ margin: 0 }}>What should it do?</h2></div>
          <div><div className="eyebrow" style={{ marginBottom: 8 }}>Goal</div>
            <div className="bw-grid">
              {spec.goals.map((g) => (
                <Pick key={g.id} name="goal" value={g.id} checked={goal === g.id} onChange={() => chooseGoal(g.id)}>
                  <b style={{ fontWeight: 600 }}>{g.label}</b><span className="sub" style={{ margin: 0, fontSize: 12 }}>{g.hint}</span>
                  {g.needs && <span className="bw-need">Needs a {g.needs}</span>}
                </Pick>
              ))}
            </div>
          </div>
          <div><div className="eyebrow" style={{ marginBottom: 8 }}>Format</div>
            <div className="bw-grid">
              {spec.formats.map((f) => (
                <Pick key={f.id} name="format" value={f.id} checked={format === f.id} onChange={() => { setFormat(f.id); setItems([]); }}>
                  <b style={{ fontWeight: 600 }}>{f.label}{f.recommended ? " · recommended" : ""}</b><span className="sub" style={{ margin: 0, fontSize: 12 }}>{f.hint}</span>
                </Pick>
              ))}
            </div>
          </div>
          {opts && (
            <div><div className="eyebrow" style={{ marginBottom: 8 }}>Optimise for</div>
              <div className="bw-grid">
                {opts.map((o) => (
                  <Pick key={o.id} name="optimization" value={o.id} checked={optimization === o.id} onChange={() => setOptimization(o.id)}>
                    <b style={{ fontWeight: 600 }}>{o.label}{o.recommended ? " · suggested" : ""}</b><span className="sub" style={{ margin: 0, fontSize: 12 }}>{o.hint}</span>
                  </Pick>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="bw-panel" hidden={step !== 2}>
          <div><h2 className="h2" style={{ margin: 0 }}>{fmt.items ? "Which products?" : "What are you advertising?"}</h2></div>
          {fmt.items ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((n) => <input key={n} type="hidden" name="items" value={n} />)}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input className="field" placeholder="Search your products" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 200 }} aria-label="Search products" />
                <span className="mono tabnum" style={{ fontSize: 12, color: items.length >= fmt.items.min ? "var(--pos)" : "var(--ink3)" }}>{items.length} of {fmt.items.max} chosen</span>
              </div>
              {catalog.length === 0 && <p className="sub" style={{ margin: 0 }}>Connect a store to pick products from it, or type them below.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {shown.map((c) => (
                  <label key={`${c.store}|${c.id}`} className="bw-pick" style={{ flexDirection: "row", alignItems: "center", padding: "8px 12px", gap: 10 }}>
                    <input type="checkbox" checked={items.includes(c.name)} onChange={() => toggle(c.name)} />
                    <Thumb src={c.imageUrl} name={c.name} size={36} />
                    <span style={{ flex: 1, overflowWrap: "anywhere" }}>{c.name}</span><span className="eyebrow">{c.store}</span>
                  </label>
                ))}
              </div>
              <label className="bw-label"><span className="eyebrow">Or add one by name</span>
                <input className="field" placeholder="Product name, then press Enter" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v) { toggle(v); (e.target as HTMLInputElement).value = ""; } } }} /></label>
            </div>
          ) : (
            <label className="bw-label"><span className="eyebrow">Describe it</span>
              <textarea name="product" className="field" rows={4} maxLength={600} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Handmade leather wallets made in Krakow, vegetable-tanned leather, 30-day returns" />
              {catalog.length > 0 && (
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  <span className="eyebrow" style={{ alignSelf: "center" }}>Start from</span>
                  {catalog.slice(0, 5).map((c) => <button key={`${c.store}|${c.id}`} type="button" className="nav-item" style={{ width: "fit-content", cursor: "pointer", border: "1px solid var(--line2)", fontSize: 12, padding: "4px 10px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => { setProduct((p) => p || c.name); setPickedName(c.name); }} title={c.name}><Thumb src={c.imageUrl} name={c.name} size={20} /> {c.name}</button>)}
                </span>
              )}
            </label>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div><div className="eyebrow">Pictures and video</div><p className="sub" style={{ margin: "2px 0 0", fontSize: 13 }}>Used for the preview and checked against {spec.short}&apos;s shapes. They are not sent anywhere.</p></div>
            {productPhotos.length > 0 && (
              <label className="bw-switch">
                <input type="checkbox" checked={usePhotos} onChange={(e) => setUsePhotos(e.target.checked)} /><span className="track" />
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>Use my product photos</b>{productPhotos.slice(0, 5).map((u) => <Thumb key={u} src={u} name="" size={30} />)}</span>
              </label>
            )}
            {usePhotos && productPhotos.length > 0 && <input type="hidden" name="productImages" value={JSON.stringify(productPhotos)} />}
            <CreativeUpload workspaceId={workspaceId} assets={assets} onChange={setAssets} />
            {(assets.length > 0 || platform === "tiktok" || format === "pmax") && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                {checks.map((c) => <li key={c.text} style={{ color: c.ok ? "var(--pos)" : "var(--warn)" }}>{c.ok ? "✓" : "!"} {c.text}</li>)}
              </ul>
            )}
          </div>
          <label className="bw-label"><span className="eyebrow">Offer or promotion (optional)</span><input name="offer" className="field" maxLength={300} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Free delivery over 200 PLN" /></label>
          <label className="bw-label"><span className="eyebrow">Who is it for? (optional)</span><input name="audience" className="field" maxLength={300} placeholder="Women 25-45 buying gifts, in Poland" /></label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="bw-label" style={{ flex: 1, minWidth: 160 }}><span className="eyebrow">Language of the ads</span><input name="language" className="field" defaultValue="English" maxLength={30} /></label>
            <label className="bw-label" style={{ flex: 1, minWidth: 160 }}><span className="eyebrow">Tone (optional)</span><input name="tone" className="field" maxLength={60} placeholder="Warm and direct" /></label>
          </div>
        </section>

        <section className="bw-panel" hidden={step !== 3}>
          <div><h2 className="h2" style={{ margin: 0 }}>How much per day?</h2><p className="sub" style={{ margin: "4px 0 0" }}>The budget is only a plan: nothing is spent from here.</p></div>
          <label className="bw-label" style={{ maxWidth: 260 }}><span className="eyebrow">Daily budget ({currency}, optional)</span>
            <input name="budgetPerDay" className="field" inputMode="decimal" placeholder={guide ? `e.g. ${guide.recommended}` : "e.g. 50"} value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
          {guide && (
            <div>
              <div className="bw-meter" aria-hidden>
                <div className="fill" style={{ width: `${Math.min(100, budgetKnown ? (b / scale) * 100 : 0)}%` }} />
                <div className="mark" style={{ left: `${(guide.floor / scale) * 100}%` }}><span>min {guide.floor}</span></div>
                <div className="mark" style={{ left: `${(guide.recommended / scale) * 100}%` }}><span>good start {guide.recommended}</span></div>
              </div>
              <div style={{ fontSize: 13, color: !budgetKnown ? "var(--ink3)" : b < guide.floor ? "var(--neg)" : b < guide.recommended ? "var(--warn)" : "var(--pos)" }}>
                {!budgetKnown ? `About ${guide.recommended} ${guide.currency} a day is a reasonable test on ${spec.short}.` : b < guide.floor ? `Under ${guide.floor} ${guide.currency} is too small to learn from.` : b < guide.recommended ? "Enough to run, but slow to learn. Higher gets results sooner." : "A solid test budget."}
              </div>
              <p className="sub" style={{ margin: "6px 0 0", fontSize: 12 }}>These are guide sizes for a sensible test. Each platform enforces its own minimum, so check it before launch.</p>
            </div>
          )}
          {platform === "google" && format === "search" && (
            <label className="bw-label" style={{ maxWidth: 260 }}><span className="eyebrow">Most you will pay per click ({currency})</span><input name="maxCpc" className="field" inputMode="decimal" placeholder="e.g. 1.20" /></label>
          )}
          <label className="bw-switch"><input type="checkbox" name="ab" checked={ab} onChange={(e) => setAb(e.target.checked)} /><span className="track" />
            <span><b style={{ fontWeight: 600 }}>A/B test the opening</b><span className="sub" style={{ display: "block", margin: 0, fontSize: 12 }}>The first two variants will be identical except for one element, so you learn which works.</span></span></label>
        </section>

        <section className="bw-panel" hidden={step !== 4}>
          <div><h2 className="h2" style={{ margin: 0 }}>Ready to draft</h2><p className="sub" style={{ margin: "4px 0 0" }}>We write it within {spec.short}&apos;s limits and list what to prepare before launch. It stays a draft until a person approves it.</p></div>
          <div className="bw-grid">
            {[["Platform", spec.short], ["Goal", spec.goals.find((g) => g.id === goal)?.label ?? goal], ["Format", fmt.label], ["Budget", budgetKnown ? `${b} ${currency} / day` : "Not set"], ["A/B test", ab ? "On" : "Off"]].map(([k, v], i) => (
              <div key={k} className="kpi rise" style={{ "--i": i } as React.CSSProperties}><span className="eyebrow">{k}</span><b style={{ fontWeight: 600 }}>{v}</b></div>
            ))}
          </div>
          <div><Submit /></div>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>A short summary of what you typed is sent to Google&apos;s Gemini to write the draft.</p>
        </section>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {step > 0 && <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>← Back</Button>}
          {step < STEPS.length - 1 && <Button type="button" disabled={!stepReady} onClick={() => setStep(step + 1)}>Next →</Button>}
          {!stepReady && hint && <span className="sub" style={{ margin: 0, fontSize: 13 }}>{hint}</span>}
        </div>
      </div>

      <aside style={{ position: "sticky", top: 90, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }} aria-label="Preview">
        <div className="eyebrow">Live preview</div>
        <PreviewSwitcher platform={platform} format={format} label="Placement" items={[{ brand, headline: platform === "google" ? "Your headline" : "Your headline here", text: primary.slice(0, platform === "tiktok" ? 100 : platform === "google" ? 90 : 125), cta: spec.ctas[0] ?? "Shop now", media, mediaRatio }]} />
        <div className="sub" style={{ margin: 0, fontSize: 12 }}>A rough picture of layout and length. The real text is written when you draft.</div>
      </aside>
    </form>
  );
}
