import { emptyDataset, type Dataset } from "./dataset";
import type { Platform } from "./types";

export interface CsvResult { dataset: Dataset; rows: number; errors: string[] }

/** Minimal RFC-4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const PLATFORMS: Record<string, Platform> = { tiktok: "tiktok", "tik tok": "tiktok", meta: "meta", facebook: "meta", instagram: "meta", google: "google", "google ads": "google" };
const REQUIRED = ["date", "platform", "campaign", "spend"] as const;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Columns: date, platform, campaign, spend (required); impressions, clicks, conversions, revenue (optional). */
export function csvToDataset(text: string): CsvResult {
  const ds = emptyDataset();
  const errors: string[] = [];
  const table = parseCsv(text);
  if (table.length < 2) return { dataset: ds, rows: 0, errors: ["File has no data rows."] };

  const head = table[0]!.map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !head.includes(c));
  if (missing.length) return { dataset: ds, rows: 0, errors: [`Missing required column(s): ${missing.join(", ")}`] };
  const col = (r: string[], name: string) => r[head.indexOf(name)]?.trim() ?? "";
  const num = (r: string[], name: string) => { const v = Number(col(r, name).replace(/[$,]/g, "")); return Number.isFinite(v) ? v : 0; };

  const seen = new Set<string>();
  const merge = new Map<string, Dataset["insights"][number]>();
  let rows = 0;

  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const date = col(r, "date");
    const platform = PLATFORMS[col(r, "platform").toLowerCase()];
    const campaign = col(r, "campaign");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return void errors.push(`Line ${line}: date must be YYYY-MM-DD`);
    if (!platform) return void errors.push(`Line ${line}: platform must be tiktok, meta or google`);
    if (!campaign) return void errors.push(`Line ${line}: campaign is empty`);
    const spend = num(r, "spend");
    if (spend < 0) return void errors.push(`Line ${line}: spend cannot be negative`);

    const cid = `csv-${platform}-${slug(campaign)}`;
    if (!seen.has(cid)) {
      seen.add(cid);
      if (!ds.accounts.some((a) => a.platform === platform))
        ds.accounts.push({ externalId: `csv-acct-${platform}`, platform, name: `CSV ${platform} import`, currency: "USD" });
      ds.campaigns.push({ externalId: cid, accountExternalId: `csv-acct-${platform}`, platform, name: campaign, objective: "Sales", status: "active", dailyBudget: 0 });
      ds.adGroups.push({ externalId: `${cid}-g`, campaignExternalId: cid, platform, name: "All ads", status: "active" });
      ds.ads.push({ externalId: `${cid}-ad`, adGroupExternalId: `${cid}-g`, platform, name: "All ads", status: "active" });
    }
    const key = `${cid}|${date}`;
    const prev = merge.get(key);
    const cur = { adExternalId: `${cid}-ad`, date, spend, impressions: num(r, "impressions"), clicks: num(r, "clicks"), conversions: num(r, "conversions"), revenue: num(r, "revenue") };
    if (prev) for (const k of ["spend", "impressions", "clicks", "conversions", "revenue"] as const) prev[k] += cur[k];
    else merge.set(key, cur);
    rows++;
  });
  ds.insights = [...merge.values()];
  return { dataset: ds, rows, errors };
}
