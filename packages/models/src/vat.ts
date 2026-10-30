import type { DailyRow } from "./dashboard";
import type { OrderRow } from "./store";

/** Allegro amounts include VAT; WooCommerce revenue is already before tax. This takes the seller's VAT rate off Allegro orders so the two are comparable. */
export const netOfVat = (rows: OrderRow[], vat: number): OrderRow[] =>
  vat > 0 ? rows.map((r) => (r.externalId?.startsWith("allegro:") ? { ...r, revenue: Math.round((r.revenue / (1 + vat)) * 100) / 100 } : r)) : rows;

/** Allegro ad charges are billed with VAT; take it off so they sit next to net Allegro sales and other platforms. */
export const netAdRows = (rows: DailyRow[], vat: number): DailyRow[] =>
  vat > 0 ? rows.map((r) => (r.platform === "allegro" ? { ...r, spend: Math.round((r.spend / (1 + vat)) * 100) / 100 } : r)) : rows;
