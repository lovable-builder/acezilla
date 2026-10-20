import { RevenueChart, Sparkline } from "@/components/dash/charts";
import { BrandLogo } from "@/components/brand/logo";

// Illustrative numbers only; the preview is labelled as sample data on the page.
const rev = Array.from({ length: 30 }, (_, i) => 5200 + Math.sin(i / 2.3) * 700 + i * 55 + (i % 5) * 120);
const SERIES = rev.map((r, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, revenue: r, spend: r / 3.4 + Math.cos(i / 3) * 90 }));
const KPIS = [
  { label: "Spend", value: "$48,210", delta: "+3.5%", good: null, s: SERIES.map((x) => x.spend) },
  { label: "Revenue", value: "$171,640", delta: "+9.1%", good: true, s: SERIES.map((x) => x.revenue) },
  { label: "Blended ROAS", value: "3.56x", delta: "+5.4%", good: true, s: SERIES.map((x) => x.revenue / x.spend) },
  { label: "CPA", value: "$18.90", delta: "−4.2%", good: true, s: SERIES.map((x, i) => 20 - i * 0.04 + Math.sin(i) * 0.5) },
];

export function ProductPreview() {
  return (
    <div className="lp-preview" role="img" aria-label="Preview of the acezilla command center with sample data">
      <div className="lp-preview-bar">
        <span /><span /><span />
        <em className="mono">acezilla.app / command center</em>
        <b className="mono">Sample data</b>
      </div>
      <div className="lp-preview-body">
        <div className="lp-preview-kpis">
          {KPIS.map((k) => (
            <div key={k.label}>
              <span className="eyebrow">{k.label}</span>
              <strong className="tabnum">{k.value}</strong>
              <span className="mono tabnum" style={{ color: k.good ? "var(--pos)" : "var(--ink3)", fontSize: 12 }}>{k.delta}</span>
              <Sparkline data={k.s} color={k.good === null ? "var(--ink3)" : "var(--accent)"} />
            </div>
          ))}
        </div>
        <div className="lp-preview-grid">
          <div className="lp-preview-card">
            <div className="lp-card-title"><span className="mono">01</span> Revenue vs spend</div>
            <RevenueChart series={SERIES} />
          </div>
          <div className="lp-preview-card">
            <div className="lp-card-title"><span className="mono">02</span> Needs attention</div>
            <ul className="lp-alerts">
              <li><i style={{ background: "var(--neg)" }} /><div><b>Lookalike 1%: ROAS fell 59%</b><small>1.19x over the last 3 days vs 2.88x baseline</small></div></li>
              <li><i style={{ background: "var(--warn)" }} /><div><b>UGC Hooks: possible fatigue</b><small>ROAS slid 2.77x → 1.93x week over week</small></div></li>
              <li><i style={{ background: "var(--pos)" }} /><div><b>Brand Search is pacing well</b><small>7.4x ROAS, 12% under budget</small></div></li>
            </ul>
            <div className="lp-platforms">
              <BrandLogo brand="meta" size={34} /><BrandLogo brand="google" size={34} /><BrandLogo brand="tiktok" size={34} />
              <small>3.4x · 4.2x · 2.9x platform ROAS</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
