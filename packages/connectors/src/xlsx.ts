import { unzipSync, strFromU8 } from "fflate";

/**
 * Reads the first sheet of an .xlsx file as tab-separated text, so the same strict parser handles every format.
 * An .xlsx is a zip of XML files. Only the sheet and the shared strings are unpacked, with hard size limits, and nothing in
 * the file is executed or followed: formulas are ignored, only stored values are read.
 */
const MAX_PART = 10_000_000;

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1]!)).join("");

export const isXlsx = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

export function xlsxToTsv(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => (f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name)) && f.originalSize <= MAX_PART });
  } catch { throw new Error("The file could not be read as an Excel workbook."); }
  const sheetName = Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!sheetName) throw new Error("The Excel file has no readable sheet.");
  const shared = files["xl/sharedStrings.xml"] ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!)) : [];
  const sheet = strFromU8(files[sheetName]!);
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!, body = cm[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = textOf(body);
      else if (v !== undefined) {
        val = unxml(v);
        // Large whole numbers (offer ids) can be stored as 1.8897572387E10: write them back out in full.
        if (/^-?\d+(\.\d+)?[eE]\+?\d+$/.test(val)) { const n = Number(val); if (Number.isSafeInteger(n)) val = String(n); }
      }
      cells[colIndex(ref)] = val.replace(/[\t\r\n]+/g, " ");
    }
    if (cells.length) rows.push(Array.from(cells, (c) => c ?? ""));
    if (rows.length > 6000) throw new Error("The report has too many rows.");
  }
  if (rows.length === 0) throw new Error("The Excel sheet is empty.");
  return rows.map((r) => r.join("\t")).join("\n");
}
