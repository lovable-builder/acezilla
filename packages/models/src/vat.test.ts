import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { netAdRows, netOfVat } from "./vat";
import type { DailyRow } from "./dashboard";
import type { OrderRow } from "./store";

const order = (externalId: string, revenue: number): OrderRow => ({ externalId, createdAt: "2026-10-01T10:00:00Z", revenue, customerId: null, utm: null, clickIds: null });
const ad = (platform: string, spend: number): DailyRow => ({ campaignId: platform, campaignName: platform, platform, status: "active", date: "2026-10-01", spend, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

test("VAT comes off Allegro orders only, and only when a rate is set", () => {
  const r = netOfVat([order("allegro:1", 123), order("woo:2", 100)], 0.23);
  assert.deepEqual(r.map((x) => x.revenue), [100, 100]);
  const same = [order("allegro:1", 123)];
  assert.equal(netOfVat(same, 0), same);
});

test("VAT comes off Allegro ad charges only", () => {
  assert.deepEqual(netAdRows([ad("allegro", 123), ad("meta", 100)], 0.23).map((x) => x.spend), [100, 100]);
});

test("taking VAT off twice shrinks the figure again, which is the bug the guard below prevents", () => {
  const once = netOfVat([order("allegro:1", 123)], 0.23);
  assert.equal(netOfVat(once, 0.23)[0]!.revenue, 81.3);
});

/**
 * The shared loaders (loadAdRows, loadOrders) already take VAT off. A page that calls one of them and then nets the result
 * again takes VAT off twice, so every Allegro figure on it comes out too low. The Strategy page did exactly that.
 */
test("no page nets the output of a loader that already nets", () => {
  const root = join(process.cwd(), "../../apps/web");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(root, "app")); walk(join(root, "components")); walk(join(root, "lib"));
  const bad: string[] = [];
  for (const f of files) {
    if (f.endsWith("lib/data.ts")) continue;                  // the loaders themselves
    const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
    if (/\bloadAdRows\(/.test(src) && /\bnetAdRows\(/.test(src)) bad.push(`${f}: loadAdRows then netAdRows`);
    if (/\bloadOrders\(/.test(src) && /\bnetOfVat\(/.test(src)) bad.push(`${f}: loadOrders then netOfVat`);
  }
  assert.deepEqual(bad, []);
});
