import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAdsReport, parseAmount } from "./allegro-ads-report";

const HEAD = ["Nazwa kampanii", "ID kampanii", "Tytuł klikniętej oferty", "Numer klikniętej oferty", "Wyświetlenia", "Kliknięcia", "Koszt brutto (PLN)", "Liczba sprzedanych sztuk", "Wartość sprzedaży (PLN)"].join("\t");
const row = (camp: string, title: string, id: string, imp: string, clk: string, cost: string, u: string, s: string) => [camp, "x", title, id, imp, clk, cost, u, s].join("\t");

test("amounts with currency, spaces and comma decimals parse; junk does not", () => {
  assert.equal(parseAmount("48.95 PLN"), 48.95); assert.equal(parseAmount("1 234,50 zł"), 1234.5); assert.equal(parseAmount("1,234.50"), 1234.5);
  assert.equal(parseAmount("2.95%"), 2.95); assert.ok(Number.isNaN(parseAmount("=cmd|' /C calc'!A0")));
});

test("a tab-separated Allegro Ads report becomes one row per offer, summed across campaigns", () => {
  const r = parseAdsReport([HEAD, row("kids", "Gniotek", "18897572387", "13889", "366", "251.65 PLN", "31", "745.69 PLN"), row("RIMFYA LED", "Gniotek", "18897572387", "100", "4", "10.00 PLN", "0", "0.00 PLN"), row("RIMFYA LED", "Lampa", "18897381824", "6931", "71", "81.71 PLN", "1", "64.99 PLN")].join("\n"));
  assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.rows.length, 2);
  const g = r.rows.find((x) => x.offerId === "18897572387")!;
  assert.equal(g.costGross, 261.65); assert.equal(g.clicks, 370); assert.deepEqual(g.campaigns, ["kids", "RIMFYA LED"]); assert.equal(g.units, 31);
});

test("semicolon files, quoted titles and trailing empty cells work; bad rows are skipped, not trusted", () => {
  const csv = ['Nazwa kampanii;Tytuł klikniętej oferty;Numer klikniętej oferty;Koszt brutto (PLN)', 'k;"Ramka; LED <b>x</b>";18932604534;"194,52 PLN";;;', "k;Zły;abc;5 PLN", "k;Ujemny;18932604535;-3 PLN"].join("\n");
  const r = parseAdsReport(csv);
  assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.rows.length, 1); assert.equal(r.skipped, 2); assert.equal(r.rows[0]!.costGross, 194.52); assert.ok(!r.rows[0]!.offerName!.includes("<"));
});

test("a file that is not an Ads report is refused with a clear message", () => {
  const r = parseAdsReport("a,b\n1,2");
  assert.ok(!r.ok && /Ads report/.test(r.error));
  assert.ok(!parseAdsReport("").ok);
});
