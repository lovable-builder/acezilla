import { test } from "node:test";
import assert from "node:assert/strict";
import { csvToDataset, parseCsv } from "./csv";

test("parses quotes, commas and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [["a", "b"], ["x, y", 'say "hi"']]);
});

test("builds a dataset and merges duplicate campaign-days", () => {
  const r = csvToDataset("Date,Platform,Campaign,Spend,Revenue\n2026-10-01,Facebook,Spring,$100.50,300\n2026-10-01,meta,Spring,50,100\n2026-10-02,google,Brand,20,90\n");
  assert.equal(r.errors.length, 0);
  assert.equal(r.dataset.campaigns.length, 2);
  const spring = r.dataset.insights.find((i) => i.date === "2026-10-01" && i.adExternalId.includes("meta"))!;
  assert.equal(spring.spend, 150.5);
  assert.equal(spring.revenue, 400);
});

test("reports row errors and missing columns without throwing", () => {
  assert.match(csvToDataset("date,campaign\n").errors[0]!, /Missing|no data/);
  const r = csvToDataset("date,platform,campaign,spend\n10/01/2026,meta,A,5\n2026-10-01,snap,A,5\n2026-10-01,meta,,5\n");
  assert.equal(r.rows, 0);
  assert.equal(r.errors.length, 3);
});
