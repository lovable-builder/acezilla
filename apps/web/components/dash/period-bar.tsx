import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PRESETS } from "@/lib/period";
import { savePeriodDefault } from "@/app/(app)/period-actions";

/** Period presets and a custom range. With `compare` set it also shows the compare-to-previous toggle and "Save as default". */
export function PeriodBar({ path, active, custom, compare }: { path: string; active: number | null; custom: { from: string; to: string } | null; compare?: boolean }) {
  const cq = compare === false ? "&compare=0" : "";
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span className="eyebrow">Period</span>
      {PRESETS.map((n) => (
        <Link key={n} href={`${path}?days=${n}${cq}`} className={`nav-item${active === n ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 12px" }}>{n} days</Link>
      ))}
      <form action={path} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {compare === false && <input type="hidden" name="compare" value="0" />}
        <input type="date" name="from" className="field" defaultValue={custom?.from} required aria-label="From" style={{ padding: "5px 8px" }} />
        <span className="eyebrow">to</span>
        <input type="date" name="to" className="field" defaultValue={custom?.to} required aria-label="To" style={{ padding: "5px 8px" }} />
        <Button variant={custom ? "solid" : "outline"} size="sm">Apply</Button>
      </form>
      {compare !== undefined && (
        <>
          <Link href={custom ? `${path}?from=${custom.from}&to=${custom.to}${compare ? "&compare=0" : ""}` : `${path}?days=${active ?? 30}${compare ? "&compare=0" : ""}`} className="nav-item" style={{ width: "fit-content", padding: "6px 12px" }} title="Show or hide the change against the previous period">
            {compare ? "✓ " : ""}Compare to previous
          </Link>
          {active !== null && (
            <form action={savePeriodDefault}>
              <input type="hidden" name="days" value={active} /><input type="hidden" name="compare" value={compare ? "1" : "0"} /><input type="hidden" name="path" value={path} />
              <Button variant="ghost" size="sm" title="Open this page with this period next time">Save as default</Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
