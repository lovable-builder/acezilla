"use client";
import { useEffect, useRef, useState } from "react";
import { int, money, x } from "@/lib/format";

/** True after first paint, so CSS transitions have a start state to animate from. Stays true if the user prefers reduced motion. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(id); }, []);
  return m;
}
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up from zero when it appears. */
export function CountUp({ value, kind, cur = "USD", ms = 900 }: { value: number; kind: "money" | "int" | "x"; cur?: string; ms?: number }) {
  const [v, setV] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(value); return; }
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / ms, 1), e = 1 - Math.pow(1 - p, 3);
      setV(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{kind === "money" ? money(v, cur) : kind === "int" ? int(v) : x(v)}</>;
}

const polar = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)] as const;
const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from), [x2, y2] = polar(cx, cy, r, to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
};

/** Half-circle dial. The needle is the return measured on real store orders; the hollow marker is what the ad platforms claim. */
export function RoasGauge({ real, claimed }: { real: number | null; claimed: number | null }) {
  const mounted = useMounted();
  const top = Math.max(real ?? 0, claimed ?? 0, 3);
  const max = Math.ceil(top * 1.15);
  const ang = (v: number) => 180 - 180 * Math.min(Math.max(v, 0) / max, 1); // 180 = left, 0 = right
  const main = real ?? claimed ?? 0;
  const zone = (a: number, b: number) => arc(100, 100, 78, 180 - 180 * (a / max), 180 - 180 * (b / max));
  const cut1 = Math.min(1, max), cut2 = Math.min(2, max);
  const needle = mounted ? ang(main) : 180;
  const [mx, my] = claimed !== null && real !== null ? polar(100, 100, 78, ang(claimed)) : [0, 0];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg viewBox="0 0 200 118" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={`Return on ad spend ${x(main)}`}>
        <path d={arc(100, 100, 78, 180, 0)} fill="none" stroke="var(--line)" strokeWidth={14} strokeLinecap="round" />
        <path d={zone(0, cut1)} fill="none" stroke="var(--neg)" strokeWidth={14} opacity={0.85} />
        <path d={zone(cut1, cut2)} fill="none" stroke="var(--warn)" strokeWidth={14} opacity={0.85} />
        <path d={zone(cut2, max)} fill="none" stroke="var(--pos)" strokeWidth={14} opacity={0.85} />
        {claimed !== null && real !== null && (
          <g style={{ opacity: mounted ? 1 : 0, transition: "opacity .6s ease .9s" }}>
            <circle cx={mx} cy={my} r={7} fill="var(--surface)" stroke="var(--ink2)" strokeWidth={2.5} />
          </g>
        )}
        <g style={{ transformOrigin: "100px 100px", transform: `rotate(${-(needle - 180)}deg)`, transition: reduced() ? "none" : "transform 1.2s cubic-bezier(.2,.9,.25,1.1)" }}>
          <line x1={100} y1={100} x2={100 - 66} y2={100} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
        </g>
        <circle cx={100} cy={100} r={7} fill="var(--ink)" />
        <text x={22} y={116} fontSize={9} fill="var(--ink3)" className="mono" textAnchor="middle">0x</text>
        <text x={178} y={116} fontSize={9} fill="var(--ink3)" className="mono" textAnchor="middle">{max}x</text>
      </svg>
      <div className="tabnum" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", marginTop: -6 }}><CountUp value={main} kind="x" /></div>
      <div className="eyebrow">{real !== null ? "Store ROAS · real orders" : "Platform-reported ROAS"}</div>
      {claimed !== null && real !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "var(--ink2)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, border: "2px solid var(--ink2)", display: "inline-block" }} />
          Platforms claim {x(claimed)}
        </div>
      )}
    </div>
  );
}

/** Ring showing how spend is split across platforms. */
export function SpendDonut({ parts, total, cur }: { parts: { label: string; value: number; color: string }[]; total: number; cur: string }) {
  const mounted = useMounted();
  let offset = 0;
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: 170, height: 170 }}>
        <svg viewBox="0 0 120 120" width="170" height="170" role="img" aria-label="Spend by platform" style={{ transform: "rotate(-90deg)" }}>
          <circle cx={60} cy={60} r={44} fill="none" stroke="var(--line)" strokeWidth={14} />
          {parts.map((p) => {
            const len = (p.value / sum) * 100, o = offset;
            offset += len;
            return <circle key={p.label} cx={60} cy={60} r={44} fill="none" stroke={p.color} strokeWidth={14} pathLength={100}
              strokeDasharray={`${mounted ? Math.max(len - 0.8, 0) : 0} 100`} strokeDashoffset={-o} style={{ transition: reduced() ? "none" : "stroke-dasharray 1s cubic-bezier(.3,.8,.3,1)" }} />;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div><div className="eyebrow">Spend</div><div className="tabnum" style={{ fontSize: 20, fontWeight: 600 }}><CountUp value={total} kind="money" cur={cur} /></div></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {parts.map((p) => (
          <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />{p.label} <span className="tabnum" style={{ color: "var(--ink3)" }}>{Math.round((p.value / sum) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two bars: the revenue the ad platforms claim against the revenue the store recorded. */
export function ClaimedVsReal({ claimed, real, cur, aLabel = "Ad platforms say", bLabel = "Your store recorded", note }: { claimed: number; real: number; cur: string; aLabel?: string; bLabel?: string; note?: string }) {
  const mounted = useMounted();
  const max = Math.max(claimed, real, 1);
  const bar = (label: string, v: number, color: string, delay: number) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span><b className="tabnum" style={{ fontWeight: 600 }}><CountUp value={v} kind="money" cur={cur} /></b>
      </div>
      <div style={{ height: 14, borderRadius: 7, background: "var(--line)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: mounted ? `${(v / max) * 100}%` : "0%", background: color, borderRadius: 7, transition: reduced() ? "none" : `width 1s cubic-bezier(.3,.8,.3,1) ${delay}ms` }} />
      </div>
    </div>
  );
  const text = note ?? (claimed > real
    ? "The ad platforms claim more than your whole store sold. They are counting the same sales more than once."
    : `Ads are credited with about ${Math.round((claimed / Math.max(real, 1)) * 100)}% of what the store recorded. The rest came from other sources.`);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {bar(aLabel, claimed, "var(--ink3)", 0)}
      {bar(bLabel, real, "var(--accent)", 200)}
      <p className="sub" style={{ margin: 0, fontSize: 13 }}>{text}</p>
    </div>
  );
}
