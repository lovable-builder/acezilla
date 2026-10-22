const tone = (n: number) => (n >= 8 ? "var(--pos)" : n >= 5 ? "var(--warn)" : "var(--neg)");
export const scoreLabel = (n: number) => (n >= 8 ? "Strong" : n >= 5 ? "On track" : "Needs work");

/** A circular 1–10 score with its label. Colour is paired with the word, never colour alone. */
export function ScoreRing({ label, value, size = 92 }: { label: string; value: number | null; size?: number }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r, v = value ?? 0;
  return (
    <div className="seo-ring" role="img" aria-label={value === null ? `${label}: no score yet` : `${label}: ${value} out of 10, ${scoreLabel(value)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={7} />
        {value !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone(v)} strokeWidth={7} strokeLinecap="round" className="ring-draw" strokeDasharray={`${(v / 10) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="tabnum" style={{ fontSize: size * 0.3, fontWeight: 600, fill: "var(--ink)" }}>{value ?? "—"}</text>
      </svg>
      <span className="eyebrow">{label}</span>
      {value !== null && <span className="seo-ring-label" style={{ color: tone(value) }}>{scoreLabel(value)}</span>}
    </div>
  );
}
