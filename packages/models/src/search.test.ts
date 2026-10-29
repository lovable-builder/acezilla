import { test } from "node:test";
import assert from "node:assert/strict";
import { nearTop, searchSummary, topByClicks } from "./search";

const q = (query: string, clicks: number, impressions: number, position: number) => ({ query, clicks, impressions, position });

test("summary weights the average position by views and has no rate without views", () => {
  const s = searchSummary([q("a", 10, 1000, 2), q("b", 0, 100, 12)]);
  assert.deepEqual([s.clicks, s.impressions, s.queries], [10, 1100, 2]);
  assert.equal(s.position!.toFixed(2), "2.91");
  assert.equal(s.ctr!.toFixed(4), "0.0091");
  assert.deepEqual(searchSummary([]), { clicks: 0, impressions: 0, ctr: null, position: null, queries: 0 });
});

test("near-top words sit between position 6 and 20 with enough views, most seen first", () => {
  const rows = [q("first page", 50, 900, 3), q("close", 2, 400, 9), q("closer", 1, 200, 6.2), q("far", 0, 500, 35), q("rare", 0, 5, 10)];
  assert.deepEqual(nearTop(rows).map((r) => r.query), ["close", "closer"]);
});

test("top words by clicks leave out words nobody clicked", () => {
  assert.deepEqual(topByClicks([q("a", 3, 10, 1), q("b", 9, 50, 2), q("c", 0, 99, 4)]).map((r) => r.query), ["b", "a"]);
});
