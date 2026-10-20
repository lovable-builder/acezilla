"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Tone = "pos" | "neg" | "warn" | "muted";
export type Example =
  | { kind: "chat"; lines: { who: "you" | "acezilla"; text: string }[] }
  | { kind: "rows"; rows: { label: string; value: string; tone?: Tone; note?: string }[] }
  | { kind: "bars"; rows: { label: string; value: number; text: string; tone?: Tone }[] }
  | { kind: "steps"; items: { text: string; state: "done" | "next" | "warn" }[] };
export interface Slide { tag: string; title: string; body: string; example: Example }

const TONE: Record<Tone, string> = { pos: "var(--pos)", neg: "var(--neg)", warn: "var(--warn)", muted: "var(--ink3)" };

function ExampleCard({ ex }: { ex: Example }) {
  return (
    <div className="fc-example" aria-hidden="true">
      <span className="fc-example-label mono">Example</span>
      {ex.kind === "chat" && ex.lines.map((l, i) => <div key={i} className={`fc-bubble fc-bubble-${l.who === "you" ? "you" : "bot"}`}>{l.text}</div>)}
      {ex.kind === "rows" && ex.rows.map((r) => (
        <div key={r.label} className="fc-row">
          <span><b>{r.label}</b>{r.note && <small>{r.note}</small>}</span>
          <em className="tabnum" style={{ color: TONE[r.tone ?? "muted"] }}>{r.value}</em>
        </div>
      ))}
      {ex.kind === "bars" && ex.rows.map((r) => (
        <div key={r.label} className="fc-bar">
          <span>{r.label}</span>
          <i><u style={{ width: `${r.value}%`, background: r.tone ? TONE[r.tone] : "var(--accent)" }} /></i>
          <em className="tabnum">{r.text}</em>
        </div>
      ))}
      {ex.kind === "steps" && ex.items.map((s) => (
        <div key={s.text} className="fc-step">
          <b style={{ color: s.state === "done" ? "var(--pos)" : s.state === "warn" ? "var(--warn)" : "var(--accent-ink)" }}>{s.state === "done" ? "✓" : s.state === "warn" ? "!" : "→"}</b>
          <span>{s.text}</span>
        </div>
      ))}
    </div>
  );
}

/** A simple banner carousel: arrows, dots, keyboard, swipe, and gentle auto-advance (paused on hover/focus, off for reduced motion). */
export function FeatureCarousel({ slides, label }: { slides: Slide[]; label: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((c) => (c + 1) % n), 7000);
    return () => clearInterval(t);
  }, [paused, n]);

  return (
    <section
      className="fc" role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); }}
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => { const s = touch.current, x = e.changedTouches[0]?.clientX; touch.current = null; if (s != null && x != null && Math.abs(x - s) > 40) go(i + (x < s ? 1 : -1)); }}
    >
      <div className="fc-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, k) => (
          <article key={s.title} className="fc-slide" aria-roledescription="slide" aria-label={`${k + 1} of ${n}`} aria-hidden={k !== i}>
            <div className="fc-copy">
              <span className="fc-tag mono">{s.tag}</span>
              <h2>{s.title}</h2>
              <p>{s.body}</p>
            </div>
            <ExampleCard ex={s.example} />
          </article>
        ))}
      </div>
      <div className="fc-controls">
        <button type="button" className="fc-arrow" onClick={() => go(i - 1)} aria-label="Previous">‹</button>
        <div className="fc-dots">
          {slides.map((s, k) => <button type="button" key={s.title} className="fc-dot" aria-label={`Go to slide ${k + 1}`} aria-current={k === i} onClick={() => go(k)} />)}
        </div>
        <button type="button" className="fc-arrow" onClick={() => go(i + 1)} aria-label="Next">›</button>
      </div>
    </section>
  );
}
