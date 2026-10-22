import { shiftDate } from "@acezilla/models";

export const PRESETS = [7, 14, 30, 60, 90] as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The period from the URL: a preset number of days ending at the latest data, or a custom from/to range (up to a year). */
export function parsePeriod(sp: { days?: string; from?: string; to?: string }) {
  if (sp.from && sp.to && ISO.test(sp.from) && ISO.test(sp.to) && sp.from <= sp.to) {
    const span = Math.round((Date.parse(`${sp.to}T00:00:00Z`) - Date.parse(`${sp.from}T00:00:00Z`)) / 86400000) + 1;
    if (span >= 1 && span <= 366) return { windowDays: span, endDate: sp.to as string | undefined, custom: { from: sp.from, to: sp.to }, days: null as number | null };
  }
  const n = Number(sp.days);
  const days = (PRESETS as readonly number[]).includes(n) ? n : 30;
  return { windowDays: days, endDate: undefined as string | undefined, custom: null, days };
}
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const windowStart = (endDate: string, windowDays: number) => shiftDate(endDate, -(windowDays - 1));
/** Query string that keeps the chosen period when a form posts back. */
export const periodQs = (p: { days: number | null; custom: { from: string; to: string } | null }) => (p.custom ? `from=${p.custom.from}&to=${p.custom.to}` : `days=${p.days ?? 30}`);

/** The view saved with "Save as default" (cookie "az_view" = "<days>.<1|0>"). Applied only when the URL names no period. */
export function parseSavedView(raw: string | undefined): { days?: string; compare?: string } {
  const m = /^(\d{1,3})\.([01])$/.exec(raw ?? "");
  return m && (PRESETS as readonly number[]).includes(Number(m[1])) ? { days: m[1], compare: m[2] } : {};
}
