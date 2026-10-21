export const money = (n: number, c = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);
export const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const int = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
export const x = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}x`);
export const delta = (d: number | null) => (d === null ? "—" : `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)}%`);
export function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
export const PLATFORM = {
  tiktok: { label: "TikTok", color: "var(--tt)" },
  meta: { label: "Meta", color: "var(--me)" },
  google: { label: "Google", color: "var(--go)" },
  allegro: { label: "Allegro", color: "var(--ink2)" },
} as Record<string, { label: string; color: string }>;
