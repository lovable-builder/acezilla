"use client";
import { useMemo, useState, useTransition } from "react";
import { priceForMargin, profitAt, sweep, toGross, type PricingAdvice, type PricingModel, type PricingScenarios } from "@acezilla/models";
import { suggestPricing } from "@/app/(app)/attribution/actions";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";

const PRICE_MIN = -30, PRICE_MAX = 50, COST_MIN = -40, COST_MAX = 20;
const DEMAND = [{ v: 0, label: "Sales stay the same at any price" }, { v: 1, label: "Mild: each +1% price loses 1% of sales" }, { v: 2, label: "Strong: each +1% price loses 2% of sales" }] as const;
const KIND: Record<string, [string, string]> = { raise_price: ["good", "Raise price"], lower_cost: ["good", "Lower cost"], cut_ads: ["attention", "Cut ads"], test: ["not_measured", "Test"], keep: ["not_measured", "Keep"] };
const pctText = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(0)}%`;

/**
 * Drag the selling price (and the cost of the next shipment) to see what happens to profit, with the break-even point marked.
 * Ad spend is a fixed amount for the period. Sales only change if you pick a demand response: nobody can promise one, so it is a choice.
 */
export function PricingAdvisor({ models, currency, period }: { models: PricingModel[]; currency: string; period: { days?: string; from?: string; to?: string } }) {
  const [offerId, setOfferId] = useState(() => [...models].sort((a, b) => profitAt(a).profit - profitAt(b).profit)[0]!.offerId);
  const [pricePct, setPricePct] = useState(0);
  const [costPct, setCostPct] = useState(0);
  const [elasticity, setElasticity] = useState<0 | 1 | 2>(0);
  const [pending, start] = useTransition();
  const [ai, setAi] = useState<{ advice: PricingAdvice; scenarios: PricingScenarios } | { error: string } | null>(null);

  const m = models.find((x) => x.offerId === offerId) ?? models[0]!;
  const cost = m.unitCost * (1 + costPct / 100);
  const w = { unitCost: cost, elasticity };
  const now = profitAt(m, { unitCost: m.unitCost, elasticity }); // today: no change
  const what = profitAt(m, { ...w, price: m.price * (1 + pricePct / 100) });
  const be = priceForMargin(m, 0, w), m10 = priceForMargin(m, 0.1, w);
  const pctOf = (p: number | null) => (p === null ? null : (p / m.price - 1) * 100);
  const curve = useMemo(() => sweep(m, { from: PRICE_MIN / 100, to: PRICE_MAX / 100, steps: 100, unitCost: cost, elasticity }), [m, cost, elasticity]);

  // chart
  const W = 640, H = 230, pad = { l: 56, r: 14, t: 14, b: 30 };
  const ys = curve.map((c) => c.profit), lo = Math.min(...ys, 0), hi = Math.max(...ys, 0), span = hi - lo || 1;
  const X = (pct: number) => pad.l + ((pct - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b);
  const path = curve.map((c, i) => `${i ? "L" : "M"}${X(c.pct * 100).toFixed(1)},${Y(c.profit).toFixed(1)}`).join(" ");
  const beP = pctOf(be);
  const sx = X(pricePct), sy = Y(what.profit);
  const tone = (v: number) => (v < 0 ? "var(--neg)" : "var(--pos)");
  const gross = (net: number) => money(toGross(net, m.vatRate), currency);
  const clampPct = (n: number) => Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.ceil(n)));

  const ask = () => start(async () => { setAi(null); const r = await suggestPricing({ offerId: m.offerId, ...period, elasticity }); setAi(r.ok ? { advice: r.advice, scenarios: r.scenarios } : { error: r.error }); });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="bw-label" style={{ flex: 2, minWidth: 220 }}><span className="eyebrow">Offer</span>
          <select className="field" value={offerId} onChange={(e) => { setOfferId(e.target.value); setPricePct(0); setCostPct(0); setAi(null); }}>
            {models.map((x) => <option key={x.offerId} value={x.offerId}>{x.name.slice(0, 70)} · {profitAt(x).profit < 0 ? "losing" : "profit"} {money(profitAt(x).profit, currency)}</option>)}
          </select></label>
        <label className="bw-label" style={{ flex: 2, minWidth: 220 }}><span className="eyebrow">If the price rises</span>
          <select className="field" value={elasticity} onChange={(e) => { setElasticity(Number(e.target.value) as 0 | 1 | 2); setAi(null); }}>{DEMAND.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}</select></label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18 }}>
        <label className="bw-label"><span className="eyebrow">Selling price: {gross(m.price * (1 + pricePct / 100))} ({pctText(pricePct)}){pricePct !== 0 ? ` · today ${gross(m.price)}` : ""}</span>
          <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={1} value={pricePct} onChange={(e) => setPricePct(Number(e.target.value))} aria-label="Selling price change in percent" style={{ accentColor: "var(--accent)", width: "100%" }} /></label>
        <label className="bw-label"><span className="eyebrow">Cost per unit, next shipment: {money(cost, currency)} ({pctText(costPct)})</span>
          <input type="range" min={COST_MIN} max={COST_MAX} step={1} value={costPct} onChange={(e) => setCostPct(Number(e.target.value))} aria-label="Cost per unit change in percent" style={{ accentColor: "var(--accent)", width: "100%" }} /></label>
      </div>

      <div className="kpis">
        {[
          ["Profit", money(what.profit, currency), tone(what.profit), `${what.profit - now.profit >= 0 ? "+" : "−"}${money(Math.abs(what.profit - now.profit), currency)} vs today`],
          ["Margin", what.margin === null ? "—" : `${(what.margin * 100).toFixed(1)}%`, tone(what.profit), now.margin === null ? "" : `${(now.margin * 100).toFixed(1)}% today`],
          ["Units sold", `${Math.round(what.units)}`, "var(--ink)", elasticity === 0 ? "same as today" : `${Math.round(now.units)} today`],
          ["Ads share of sales", `${what.revenue > 0 ? ((what.ads / what.revenue) * 100).toFixed(0) : 0}%`, "var(--ink)", `${money(what.ads, currency)} ads, fixed`],
        ].map(([label, value, color, sub], i) => (
          <div className="kpi rise" style={{ "--i": i } as React.CSSProperties} key={label}>
            <span className="eyebrow">{label}</span>
            <span className="tabnum" style={{ fontSize: 24, fontWeight: 600, color: color as string, transition: "color .2s" }}>{value}</span>
            <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{sub}</span>
          </div>
        ))}
      </div>

      <div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Profit at different selling prices" style={{ display: "block" }}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(0)} y2={Y(0)} stroke="var(--line2)" strokeDasharray="4 4" />
          <text x={pad.l - 8} y={Y(0) + 4} fontSize={10} textAnchor="end" fill="var(--ink3)" className="mono">0</text>
          <text x={pad.l - 8} y={Y(hi) + 4} fontSize={10} textAnchor="end" fill="var(--ink3)" className="mono">{Math.round(hi)}</text>
          <text x={pad.l - 8} y={Y(lo) + 4} fontSize={10} textAnchor="end" fill="var(--ink3)" className="mono">{Math.round(lo)}</text>
          {[-30, -10, 0, 10, 30, 50].map((t) => <text key={t} x={X(t)} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--ink3)" className="mono">{pctText(t)}</text>)}
          <path d={`${path} L${X(PRICE_MAX)},${Y(0)} L${X(PRICE_MIN)},${Y(0)} Z`} fill="var(--accent-soft)" opacity={0.6} />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
          <line x1={X(0)} x2={X(0)} y1={pad.t} y2={H - pad.b} stroke="var(--ink3)" strokeDasharray="2 4" />
          <text x={X(0) + 4} y={pad.t + 8} fontSize={10} fill="var(--ink3)" className="mono">today</text>
          {beP !== null && beP >= PRICE_MIN && beP <= PRICE_MAX && (
            <g><line x1={X(beP)} x2={X(beP)} y1={pad.t} y2={H - pad.b} stroke="var(--pos)" strokeWidth={1.5} /><text x={X(beP) + 4} y={H - pad.b - 6} fontSize={10} fill="var(--pos)" className="mono">break even</text></g>
          )}
          <g style={{ transform: `translate(${sx}px, ${sy}px)`, transition: "transform .12s ease-out" }}>
            <circle r={9} fill="var(--surface)" stroke={what.profit < 0 ? "var(--neg)" : "var(--pos)"} strokeWidth={3} />
          </g>
        </svg>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button type="button" size="sm" variant="outline" disabled={beP === null} onClick={() => beP !== null && setPricePct(clampPct(beP))}>
            {beP === null ? "Break-even out of range" : `Break even: ${gross(be!)} (${pctText(beP)})`}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={m10 === null} onClick={() => m10 !== null && setPricePct(clampPct(pctOf(m10)!))}>
            {m10 === null ? "10% margin out of range" : `10% margin: ${gross(m10)} (${pctText(pctOf(m10)!)})`}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setPricePct(0); setCostPct(0); }}>Reset</Button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Button type="button" onClick={ask} disabled={pending}>{pending ? "Thinking…" : "✨ Ask AI for a suggestion"}</Button>
          <span className="sub" style={{ margin: 0, fontSize: 12 }}>It starts from today&apos;s price and your demand choice above, not from the sliders. A suggestion only: nothing is changed on Allegro.</span>
        </div>
        {ai && "error" in ai && <div role="alert" style={{ color: "var(--neg)", fontSize: 13 }}>{ai.error}</div>}
        {ai && "advice" in ai && (
          <div className="raise3d rise" style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <b style={{ fontWeight: 600 }}>{ai.advice.headline}</b>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {ai.advice.actions.map((a, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span className={`seo-chip seo-chip-${KIND[a.kind]![0]}`} style={{ flexShrink: 0 }}>{KIND[a.kind]![1]}</span>
                  <div><b style={{ fontWeight: 600 }}>{a.title}</b><div className="sub" style={{ margin: 0, fontSize: 13 }}>{a.detail}</div></div>
                </li>
              ))}
            </ol>
            {ai.advice.watchOut.length > 0 && <div><div className="eyebrow" style={{ color: "var(--warn)" }}>Watch out</div><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{ai.advice.watchOut.map((w2) => <li key={w2} style={{ fontSize: 13 }}>{w2}</li>)}</ul></div>}
            {ai.advice.unverified.length > 0 && <div style={{ fontSize: 12, color: "var(--warn)" }}>Check before relying on this: {ai.advice.unverified.join(", ")} could not be matched to the figures.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
