import Link from "next/link";
import { Card } from "@/components/ui/card";

export interface CheckStep { title: string; hint: string; done: boolean; href: string; cta: string }

/** Setup progress. Hidden once every step is done, so it never nags a finished workspace. */
export function Checklist({ steps }: { steps: CheckStep[] }) {
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <b>Get set up</b>
        <span className="eyebrow">{steps.length - left} of {steps.length} done</span>
        <div style={{ flex: 1, minWidth: 80, height: 4, borderRadius: 2, background: "var(--line2)", overflow: "hidden" }}>
          <div style={{ width: `${((steps.length - left) / steps.length) * 100}%`, height: "100%", background: "var(--accent)" }} />
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((s) => (
          <li key={s.title} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, background: s.done ? "var(--pos)" : "var(--line2)", color: s.done ? "var(--surface)" : "var(--ink2)" }}>{s.done ? "✓" : ""}</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, color: s.done ? "var(--ink3)" : "var(--ink)", textDecoration: s.done ? "line-through" : "none" }}>{s.title}</div>
              {!s.done && <div className="sub" style={{ margin: 0, fontSize: 13 }}>{s.hint}</div>}
            </div>
            {s === next && <Link href={s.href} className="link" style={{ fontWeight: 600 }}>{s.cta} →</Link>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
