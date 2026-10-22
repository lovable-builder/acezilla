import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { isXlsx, xlsxToTsv } from "./xlsx";
import { parseAdsReport } from "./allegro-ads-report";

const book = (sheet: string, shared = "") => zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet), ...(shared ? { "xl/sharedStrings.xml": strToU8(shared) } : {}), "[Content_Types].xml": strToU8("<x/>") });

test("an xlsx sheet becomes tab-separated text and goes through the same report parser", () => {
  const shared = `<sst><si><t>Tytuł klikniętej oferty</t></si><si><t>Numer klikniętej oferty</t></si><si><t>Koszt brutto (PLN)</t></si><si><t>Gniotek &amp; co</t></si><si><t>251.65 PLN</t></si></sst>`;
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>1.8897572387E10</v></c><c r="C2" t="s"><v>4</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Ramka</t></is></c><c r="B3"><v>18932604534</v></c><c r="C3"><v>194.52</v></c></row></sheetData></worksheet>`;
  const bytes = book(sheet, shared);
  assert.ok(isXlsx(bytes));
  const r = parseAdsReport(xlsxToTsv(bytes));
  assert.ok(r.ok); if (!r.ok) return;
  assert.deepEqual(r.rows.map((x) => [x.offerId, x.offerName, x.costGross]), [["18897572387", "Gniotek & co", 251.65], ["18932604534", "Ramka", 194.52]]);
});

test("skipped empty cells keep their column, and files that are not workbooks are refused", () => {
  const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row></sheetData></worksheet>`;
  assert.equal(xlsxToTsv(book(sheet)), "a\t\tc");
  assert.throws(() => xlsxToTsv(new Uint8Array([0x50, 0x4b, 1, 2, 3, 4])), /Excel/);
  assert.ok(!isXlsx(new TextEncoder().encode("a,b")));
});

test("an empty row written as <row/> does not swallow the row after it", () => {
  const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>h</t></is></c></row><row r="2" spans="1:3"/><row r="3"><c r="A3" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`;
  assert.equal(xlsxToTsv(book(sheet)), "h\nx");
});
