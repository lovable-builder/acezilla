export function Sparkline({ data, color = "var(--accent)" }: { data: number[]; color?: string }) {
  const w = 90, h = 26;
  const max = Math.max(...data, 1e-9), min = Math.min(...data, 0);
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" pathLength={1} className="draw" />
    </svg>
  );
}

export function RevenueChart({ series }: { series: { date: string; spend: number; revenue: number }[] }) {
  const W = 760, H = 200, pad = { l: 8, r: 8, t: 10, b: 22 };
  const max = Math.max(...series.map((s) => Math.max(s.revenue, s.spend)), 1);
  const X = (i: number) => pad.l + (i / Math.max(series.length - 1, 1)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = (k: "revenue" | "spend") => series.map((s, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(s[k]).toFixed(1)}`).join(" ");
  const area = `${line("revenue")} L${X(series.length - 1)},${H - pad.b} L${X(0)},${H - pad.b} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Revenue versus spend, last 30 days">
      <path d={area} fill="var(--accent-soft)" className="fadein" />
      <path d={line("revenue")} fill="none" stroke="var(--accent)" strokeWidth={2} pathLength={1} className="draw" />
      <path d={line("spend")} fill="none" stroke="var(--ink3)" strokeWidth={1.5} strokeDasharray="4 4" className="fadein" />
      {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
        <text key={i} x={X(i)} y={H - 6} fontSize={10} fill="var(--ink3)" textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="mono">
          {series[i]?.date.slice(5)}
        </text>
      ))}
    </svg>
  );
}
