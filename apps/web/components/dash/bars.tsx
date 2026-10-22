/** Horizontal bars that grow in. Server-rendered: the motion is CSS, so there is no script and it respects reduced motion. */
export function PairBars({ rows, cur, fmt }: { rows: { label: string; a: { label: string; value: number }; b: { label: string; value: number } }[]; cur: string; fmt: (n: number, cur: string) => string }) {
  const max = Math.max(...rows.flatMap((r) => [r.a.value, r.b.value]), 1);
  const bar = (v: number, color: string, i: number) => (
    <div style={{ height: 12, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
      <div className="grow" style={{ "--i": i, width: `${(v / max) * 100}%`, height: "100%", background: color, borderRadius: 6 } as React.CSSProperties} />
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(80px,120px) 1fr", gap: 12, alignItems: "center" }}>
          <b style={{ fontWeight: 600 }}>{r.label}</b>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div>{bar(r.a.value, "var(--ink3)", i * 2)}<div className="mono tabnum" style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>{r.a.label} · {fmt(r.a.value, cur)}</div></div>
            <div>{bar(r.b.value, "var(--accent)", i * 2 + 1)}<div className="mono tabnum" style={{ fontSize: 11, color: "var(--accent-ink)", marginTop: 2 }}>{r.b.label} · {fmt(r.b.value, cur)}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Profit per item as bars either side of zero: losses to the left in red, profit to the right in green. */
export function ProfitBars({ rows, cur, fmt }: { rows: { label: string; value: number }[]; cur: string; fmt: (n: number, cur: string) => string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1.1fr) 2fr 90px", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>{r.label}</span>
          <div style={{ position: "relative", height: 14, display: "grid", gridTemplateColumns: "1fr 1fr" }} aria-hidden>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {r.value < 0 && <div className="grow grow-r" style={{ "--i": i, width: `${(Math.abs(r.value) / max) * 100}%`, background: "var(--neg)", borderRadius: "7px 0 0 7px", height: "100%" } as React.CSSProperties} />}
            </div>
            <div style={{ borderLeft: "1px solid var(--line2)" }}>
              {r.value > 0 && <div className="grow" style={{ "--i": i, width: `${(r.value / max) * 100}%`, background: "var(--pos)", borderRadius: "0 7px 7px 0", height: "100%" } as React.CSSProperties} />}
            </div>
          </div>
          <span className="mono tabnum" style={{ fontSize: 12, textAlign: "right", color: r.value < 0 ? "var(--neg)" : "var(--ink)" }}>{fmt(r.value, cur)}</span>
        </div>
      ))}
    </div>
  );
}
