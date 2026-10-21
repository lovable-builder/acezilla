import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PRESETS } from "@/lib/period";

export function PeriodBar({ path, active, custom }: { path: string; active: number | null; custom: { from: string; to: string } | null }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span className="eyebrow">Period</span>
      {PRESETS.map((n) => (
        <Link key={n} href={`${path}?days=${n}`} className={`nav-item${active === n ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 12px" }}>{n} days</Link>
      ))}
      <form action={path} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" name="from" className="field" defaultValue={custom?.from} required aria-label="From" style={{ padding: "5px 8px" }} />
        <span className="eyebrow">to</span>
        <input type="date" name="to" className="field" defaultValue={custom?.to} required aria-label="To" style={{ padding: "5px 8px" }} />
        <Button variant={custom ? "solid" : "outline"} size="sm">Apply</Button>
      </form>
    </div>
  );
}
