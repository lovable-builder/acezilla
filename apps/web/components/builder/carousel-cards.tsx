"use client";
import { useMemo, useState } from "react";
import { Thumb, thumbUrl } from "@/components/app/thumb";
import type { CatalogEntry } from "./wizard";

/** One card of the carousel: a listing photo (url) or an uploaded file (path). `src` is what is shown in the browser. */
export interface Card { id: string; label: string; src: string; url?: string; path?: string }

/**
 * Builds a carousel card by card. A card is one picture: add any photo from any listing (several from the same listing is fine),
 * or upload your own. Reorder with the arrows, remove with ×.
 */
export function CarouselCards({ cards, onChange, catalog, min, max }: { cards: Card[]; onChange: (c: Card[]) => void; catalog: CatalogEntry[]; min: number; max: number }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const full = cards.length >= max;
  const shown = useMemo(() => catalog.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 40), [catalog, query]);
  const galleryOf = (c: CatalogEntry) => (c.images?.length ? c.images : c.imageUrl ? [c.imageUrl] : []);
  const used = (u: string) => cards.filter((c) => c.url === u).length;

  const add = (c: CatalogEntry, url: string) => { if (!full) onChange([...cards, { id: crypto.randomUUID(), label: c.name, src: url, url }]); };
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= cards.length) return; const next = [...cards]; [next[i], next[j]] = [next[j]!, next[i]!]; onChange(next); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="cards" value={JSON.stringify(cards.map(({ label, url, path }) => ({ label, url, path })))} />
      {cards.map((c) => <input key={c.id} type="hidden" name="items" value={c.label} />)}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <div className="eyebrow">Your carousel</div>
        <span className="mono tabnum" style={{ fontSize: 12, color: cards.length >= min ? "var(--pos)" : "var(--ink3)" }}>{cards.length} of {max} cards{cards.length < min ? ` · add at least ${min}` : ""}</span>
      </div>
      <div className="bw-cards" aria-label="Carousel cards">
        {cards.map((c, i) => (
          <div key={c.id} className="bw-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.path ? c.src : thumbUrl(c.src)} alt="" referrerPolicy="no-referrer" />
            <span className="n">{i + 1}</span>
            <div className="acts">
              <button type="button" aria-label={`Move card ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>‹</button>
              <button type="button" aria-label={`Move card ${i + 1} later`} disabled={i === cards.length - 1} onClick={() => move(i, 1)}>›</button>
              <button type="button" aria-label={`Remove card ${i + 1}`} onClick={() => onChange(cards.filter((x) => x.id !== c.id))}>×</button>
            </div>
            <span className="lab" title={c.label}>{c.label}</span>
          </div>
        ))}
        {cards.length === 0 && <div className="bw-card empty">Add cards below. Each card is one picture.</div>}
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Add from my listings</div>
        {catalog.length === 0 ? <p className="sub" style={{ margin: 0, fontSize: 13 }}>Connect a store to pick photos from its listings. You can also upload your own below.</p> : (
          <>
            <input className="field" placeholder="Search your listings" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search listings" style={{ width: "100%", marginBottom: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
              {shown.map((c) => {
                const key = `${c.store}|${c.id}`, g = galleryOf(c), isOpen = open === key;
                return (
                  <div key={key} className="bw-pick" style={{ padding: 0, gap: 0, cursor: "default" }}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "none", border: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
                      <Thumb src={g[0]} name={c.name} size={36} />
                      <span style={{ flex: 1, overflowWrap: "anywhere" }}>{c.name}</span>
                      <span className="eyebrow">{c.store} · {g.length} photo{g.length === 1 ? "" : "s"}</span><span aria-hidden>{isOpen ? "▾" : "▸"}</span>
                    </button>
                    {isOpen && (
                      <div className="bw-gallery" style={{ padding: "4px 12px 12px" }} role="group" aria-label={`Photos of ${c.name}`}>
                        {g.map((u, k) => (
                          <button key={u} type="button" aria-label={`Add photo ${k + 1} of ${c.name} as a card`} disabled={full} onClick={() => add(c, u)} aria-pressed={used(u) > 0} style={{ opacity: full ? 0.5 : 1 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbUrl(u)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                            {used(u) > 1 && <span className="count">×{used(u)}</span>}
                          </button>
                        ))}
                        {g.length === 0 && <span className="sub" style={{ fontSize: 12 }}>This listing has no photos yet.</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              {shown.length === 0 && <span className="sub" style={{ fontSize: 13 }}>No listing matches.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
