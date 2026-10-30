"use client";
import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface StepProps { label: string; /** One line shown under the step title when it is open. */ hint?: string; /** A short note on the step's pill, such as "2 to fix". */ badge?: string; children: ReactNode }

/** One step of a StepFlow. It draws nothing itself; the flow reads its props and shows its children when it is the open step. */
export function Step({ children }: StepProps) { return <>{children}</>; }

/**
 * A page broken into steps, the way the Campaign builder is: numbered pills across the top, one step open at a time, Back and Next below.
 * Every step stays in the page (the others are only hidden), so forms and sliders keep their values when you move between steps.
 * The open step is kept in the address (#id-2), so a refresh or a shared link returns to it. "Show all steps" restores the long page.
 */
export function StepFlow({ id, children, value, onChange }: { id: string; children: ReactNode; /** Set these to control the open step from the page. */ value?: number; onChange?: (n: number) => void }) {
  const steps = Children.toArray(children).filter((c): c is ReactElement<StepProps> => isValidElement(c) && typeof (c.props as StepProps).label === "string");
  const [inner, setInner] = useState(0);
  const [all, setAll] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;
  const step = Math.min(Math.max(value ?? inner, 0), Math.max(last, 0));

  const go = (n: number, scroll = true) => {
    const next = Math.min(Math.max(n, 0), last);
    setInner(next); onChange?.(next);
    try { history.replaceState(null, "", `#${id}-${next + 1}`); } catch { /* the address is only a convenience */ }
    const el = top.current;
    if (scroll && el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Return to the step named in the address after a refresh or from a shared link.
  useEffect(() => {
    const m = new RegExp(`^#${id}-(\\d+)$`).exec(window.location.hash);
    if (m) go(Number(m[1]) - 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (steps.length === 0) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(step + 1, false); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(step - 1, false); }
  };

  return (
    <div ref={top} style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0, scrollMarginTop: 70 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="bw-steps" role="tablist" aria-label="Steps on this page" onKeyDown={onKey} style={{ flex: 1, minWidth: 0 }}>
          {steps.map((s, i) => (
            <button key={i} type="button" role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} aria-selected={i === step} tabIndex={i === step ? 0 : -1}
              className={`bw-step${i < step ? " done" : ""}`} aria-current={!all && i === step ? "step" : undefined} onClick={() => go(i)}>
              <span className="dot">{i < step ? "✓" : i + 1}</span>{s.props.label}
              {s.props.badge && <span className="mono" style={{ fontSize: 10, color: "var(--warn)", marginLeft: 2 }}>{s.props.badge}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="link" onClick={() => setAll((a) => !a)} style={{ fontSize: 13 }}>{all ? "Show one step at a time" : "Show all steps"}</button>
      </div>

      {steps.map((s, i) => (
        <section key={i} id={`${id}-panel-${i}`} role="tabpanel" aria-labelledby={`${id}-tab-${i}`} className="bw-panel" hidden={!all && i !== step}>
          {all && <div className="eyebrow">Step {i + 1} · {s.props.label}</div>}
          {s.props.children}
        </section>
      ))}

      {!all && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {step > 0 && <Button type="button" variant="outline" onClick={() => go(step - 1)}>← Back</Button>}
          {step < last && <Button type="button" onClick={() => go(step + 1)}>Next: {steps[step + 1]!.props.label} →</Button>}
          <span className="sub" style={{ margin: 0, fontSize: 13 }}>Step <span className="tabnum">{step + 1}</span> of <span className="tabnum">{steps.length}</span>{steps[step]!.props.hint ? ` · ${steps[step]!.props.hint}` : ""}</span>
        </div>
      )}
    </div>
  );
}
