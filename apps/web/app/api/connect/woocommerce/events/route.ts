import { NextResponse } from "next/server";
import { parseWooPush, verifyWooSignature } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import { alignCurrency } from "@/lib/currency";
import { ingestOrders, ingestProducts } from "@/lib/ingest";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY = 512 * 1024;
const unauthorized = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Orders pushed by the acezilla plugin. Every request is signed with the secret created at pairing; anything unsigned,
 * stale or altered gets the same 401, so a caller cannot learn which connections exist.
 */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });

  const id = req.headers.get("x-acezilla-connection") ?? "";
  if (!UUID.test(id)) return unauthorized();
  const admin = createAdminClient();
  const { data: conn } = await admin.from("connection").select("id,workspace_id,token_enc,stats").eq("id", id).eq("platform", "woocommerce").maybeSingle();
  if (!conn?.token_enc) return unauthorized();
  let secret: string;
  try { secret = (JSON.parse(decryptToken(conn.token_enc as string)) as { secret: string }).secret; } catch { return unauthorized(); }
  if (!verifyWooSignature({ secret, timestamp: req.headers.get("x-acezilla-timestamp"), body, signature: req.headers.get("x-acezilla-signature") })) return unauthorized();

  let push;
  try { push = parseWooPush(JSON.parse(body)); } catch { push = null; }
  if (!push) return NextResponse.json({ error: "Unrecognised request" }, { status: 400 });
  const ws = conn.workspace_id as string;
  const now = new Date().toISOString();

  if (push.type === "disconnect") {
    await admin.from("order").delete().eq("workspace_id", ws).like("external_id", "woo:%");
    await admin.from("order_line").delete().eq("workspace_id", ws).eq("platform", "woocommerce");
    await admin.from("store_product").delete().eq("workspace_id", ws).eq("platform", "woocommerce");
    await admin.from("connection").delete().eq("id", conn.id);
    return NextResponse.json({ ok: true, message: "Disconnected. Imported orders were deleted." });
  }

  type Stats = { plugin_version?: string; last_orders_at?: string; skipped_orders?: Record<string, string> };
  const stats = ((conn.stats as Stats | null) ?? {}) as Stats;

  const currencyWarning = (storeCurrency: string | null) => alignCurrency(admin, ws, storeCurrency);

  if (push.type === "ping") {
    const warning = await currencyWarning(push.info.currency);
    const warnings = [warning, push.info.attribution === false ? "WooCommerce order attribution is switched off, so orders will not carry their marketing source. Turn it on in WooCommerce → Settings → Advanced → Features." : null].filter((w): w is string => !!w);
    await admin.from("connection").update({ status: "active", last_sync_at: now, last_error: warnings[0] ?? null, stats: { ...stats, plugin_version: push.info.pluginVersion ?? stats.plugin_version } }).eq("id", conn.id);
    return NextResponse.json({ ok: true, message: "acezilla received the test. Your store is connected.", warnings });
  }

  if (push.type === "products") {
    try {
      const r = await ingestProducts(admin, ws, "woocommerce", push.products, push.remove);
      await admin.from("connection").update({ status: "active", last_sync_at: now }).eq("id", conn.id);
      return NextResponse.json({ ok: true, products: r.products, removed: r.removed });
    } catch (e) {
      console.warn("[woo] products failed", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Could not store the products" }, { status: 500 });
    }
  }

  try {
    const r = await ingestOrders(admin, ws, push.orders, push.remove, push.lines);
    const warning = await currencyWarning(push.currency);
    // Remember which orders were left out and why, by id, so re-sending history never double counts.
    const skippedOrders = { ...(stats.skipped_orders ?? {}) };
    for (const o of push.orders) delete skippedOrders[o.externalId];
    for (const r2 of push.removed) skippedOrders[r2.id] = r2.reason;
    const ids = Object.keys(skippedOrders);
    for (const k of ids.slice(0, Math.max(0, ids.length - 500))) delete skippedOrders[k];
    await admin.from("connection").update({
      status: "active", last_sync_at: now, last_error: warning,
      stats: { ...stats, last_orders_at: now, skipped_orders: skippedOrders },
    }).eq("id", conn.id);
    return NextResponse.json({ ok: true, stored: r.orders, removed: r.removed, warnings: warning ? [warning] : [] });
  } catch (e) {
    console.warn("[woo] ingest failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not store the orders" }, { status: 500 });
  }
}
