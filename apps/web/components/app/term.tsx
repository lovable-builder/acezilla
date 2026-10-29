"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY } from "@/lib/glossary";

const GAP = 8, MARGIN = 10;

/**
 * A label with a short plain-language explanation on hover, keyboard focus or tap.
 * The explanation is drawn in its own layer on the page, not inside the card around the label, so no card, table or tile can cut it off.
 */
export function Term({ children, k }: { children: string; k?: string }) {
  const tip = GLOSSARY[k ?? children];
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Place the bubble under the label, or above it when there is no room below, and keep it inside the screen.
  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) { setPos(null); return; }
    const a = anchor.current.getBoundingClientRect(), b = bubble.current.getBoundingClientRect();
    const left = Math.min(Math.max(MARGIN, a.left), window.innerWidth - b.width - MARGIN);
    const below = a.bottom + GAP, above = a.top - GAP - b.height;
    setPos({ left, top: below + b.height > window.innerHeight - MARGIN && above > MARGIN ? above : below });
  }, [open, tip]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: Event) => { if (!anchor.current?.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  if (!tip) return <>{children}</>;
  return (
    <>
      <span ref={anchor} className="term" tabIndex={0} role="button" aria-expanded={open} aria-label={`${children}: explanation`}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}>{children}</span>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={bubble} role="tooltip" className="term-bubble" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}>{tip}</div>,
        document.body,
      )}
    </>
  );
}
