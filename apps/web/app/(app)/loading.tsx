import { Card } from "@/components/ui/card";

/** Shown while a page loads its data, so a slow page does not look like a broken one. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ height: 14, width: 140, borderRadius: 6, background: "var(--line)" }} />
      <div style={{ height: 34, width: "min(520px, 80%)", borderRadius: 8, background: "var(--line)" }} />
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 16, width: "40%", borderRadius: 6, background: "var(--line)" }} />
        <div style={{ height: 90, borderRadius: 8, background: "var(--line)" }} />
      </Card>
      <span className="sub" style={{ fontSize: 13 }}>Loading your numbers…</span>
    </div>
  );
}
