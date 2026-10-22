/**
 * Allegro Ads report (the table you can copy or download from the Ads panel). Allegro's billing data does not say which listing an
 * ad charge belongs to, but this report does: cost per clicked offer. Parsed strictly: only numbers and short labels come out, and
 * nothing in the file is ever treated as an instruction.
 */
export interface AdReportRow { offerId: string; offerName: string | null; campaigns: string[]; costGross: number; impressions: number; clicks: number; units: number; salesGross: number }
export type AdReportParse = { ok: true; rows: AdReportRow[]; skipped: number; /** Data rows read, and the cost on rows that were skipped (no valid offer number), so a gap against the report total is visible. */ rowsRead: number; skippedCost: number } | { ok: false; error: string };

export const MAX_REPORT_BYTES = 1_000_000;
const MAX_LINES = 5000;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "l").toLowerCase().replace(/\s+/g, " ").trim();

/** "48.95 PLN", "1 234,50 zł", "2.95%" -> number. Anything else -> NaN. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/[\s ]/g, "").replace(/(PLN|zł|zl|%)/gi, "");
  if (!/^-?[\d.,]+$/.test(s)) return NaN;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  return Number(s);
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const COLS = {
  offerId: ["numer klikniętej oferty", "clicked offer id", "offer id"],
  title: ["tytuł klikniętej oferty", "clicked offer title", "offer title"],
  campaign: ["nazwa kampanii", "campaign name"],
  impressions: ["wyświetlenia", "impressions"],
  clicks: ["kliknięcia", "clicks"],
  cost: ["koszt brutto (pln)", "gross cost (pln)", "gross cost"],
  units: ["liczba sprzedanych sztuk", "units sold"],
  sales: ["wartość sprzedaży (pln)", "sales value (pln)", "sales value"],
} as const;

export function parseAdsReport(text: string): AdReportParse {
  if (text.length > MAX_REPORT_BYTES) return { ok: false, error: "The report is too large (limit 1 MB)." };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { ok: false, error: "The report has no rows." };
  if (lines.length > MAX_LINES) return { ok: false, error: `The report has more than ${MAX_LINES} rows.` };
  const head = lines[0]!;
  const d = head.includes("\t") ? "\t" : head.split(";").length > head.split(",").length ? ";" : ",";
  const names = splitLine(head, d).map(norm);
  const idx = (k: keyof typeof COLS) => names.findIndex((n) => (COLS[k] as readonly string[]).some((c) => norm(c) === n));
  const i = { offerId: idx("offerId"), title: idx("title"), campaign: idx("campaign"), impressions: idx("impressions"), clicks: idx("clicks"), cost: idx("cost"), units: idx("units"), sales: idx("sales") };
  if (i.offerId < 0 || i.cost < 0) return { ok: false, error: "This does not look like an Allegro Ads report. It needs the columns “Numer klikniętej oferty” and “Koszt brutto (PLN)”." };

  const by = new Map<string, AdReportRow>();
  let skipped = 0, skippedCost = 0, rowsRead = 0;
  for (const line of lines.slice(1)) {
    const c = splitLine(line, d);
    const offerId = (c[i.offerId] ?? "").trim();
    const cost = parseAmount(c[i.cost] ?? "");
    rowsRead++;
    if (!/^\d{5,20}$/.test(offerId) || !Number.isFinite(cost) || cost < 0 || cost > 10_000_000) { skipped++; if (Number.isFinite(cost) && cost > 0 && cost <= 10_000_000) skippedCost += cost; continue; }
    const num = (k: number) => { const v = k >= 0 ? parseAmount(c[k] ?? "") : 0; return Number.isFinite(v) && v >= 0 ? v : 0; };
    const label = (k: number, max: number) => (k >= 0 ? (c[k] ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
    const r = by.get(offerId) ?? { offerId, offerName: null, campaigns: [], costGross: 0, impressions: 0, clicks: 0, units: 0, salesGross: 0 };
    r.costGross += cost; r.impressions += num(i.impressions); r.clicks += num(i.clicks); r.units += num(i.units); r.salesGross += num(i.sales);
    r.offerName ||= label(i.title, 200) || null;
    const camp = label(i.campaign, 80);
    if (camp && !r.campaigns.includes(camp) && r.campaigns.length < 10) r.campaigns.push(camp);
    by.set(offerId, r);
  }
  if (by.size === 0) return { ok: false, error: "No rows with an offer number and a cost were found." };
  const rows = [...by.values()].map((r) => ({ ...r, costGross: Math.round(r.costGross * 100) / 100, salesGross: Math.round(r.salesGross * 100) / 100 }));
  return { ok: true, rows, skipped, rowsRead, skippedCost: Math.round(skippedCost * 100) / 100 };
}
