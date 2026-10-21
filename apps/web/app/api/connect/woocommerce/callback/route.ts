import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { checkWooConnection, parseWooGrant, WooApiError } from "@acezilla/connectors";
import { encryptToken } from "@/lib/crypto";
import { guardedFetch } from "@/lib/store-fetch";
import { syncConnection, type ConnRow } from "@/lib/sync";
import { createAdminClient } from "@/lib/supabase/admin";

const NONCE_TTL_MS = 15 * 60_000;

/**
 * WooCommerce posts the new read-only keys here from the store's server, so there is no browser session.
 * The one-time token we sent along (single use, 15 minutes) is what ties the keys to a workspace, and the
 * store address always comes from our own record, never from this request.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const grant = parseWooGrant(body);
  if (!grant) return NextResponse.json({ error: "Invalid grant" }, { status: 400 });

  const admin = createAdminClient();
  const { data: n } = await admin.from("connect_nonce").delete()
    .eq("token_hash", createHash("sha256").update(grant.userId).digest("hex")).eq("platform", "woocommerce")
    .gte("created_at", new Date(Date.now() - NONCE_TTL_MS).toISOString()).select("workspace_id,store_url").maybeSingle();
  if (!n) return NextResponse.json({ error: "Unknown or expired connection request" }, { status: 400 });
  if (grant.permissions !== "read") return NextResponse.json({ error: "Only read access is accepted" }, { status: 400 });

  const storeUrl = n.store_url as string;
  try { await checkWooConnection({ storeUrl, key: grant.key, secret: grant.secret, fetch: guardedFetch }); }
  catch (e) { return NextResponse.json({ error: e instanceof WooApiError ? e.message : "Could not verify the keys" }, { status: 400 }); }

  const row = {
    workspace_id: n.workspace_id as string, platform: "woocommerce", scopes: ["read_orders"], status: "active", last_error: null,
    token_enc: encryptToken(JSON.stringify({ storeUrl, key: grant.key, secret: grant.secret })), token_expires_at: null, external_user_id: new URL(storeUrl).host,
  };
  const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", row.workspace_id).eq("platform", "woocommerce").maybeSingle();
  const { data: saved, error } = existing
    ? await admin.from("connection").update(row).eq("id", existing.id).select("id,workspace_id,platform,token_enc").single()
    : await admin.from("connection").insert(row).select("id,workspace_id,platform,token_enc").single();
  if (error || !saved) return NextResponse.json({ error: "Could not save the connection" }, { status: 500 });

  after(() => syncConnection(admin, saved as ConnRow, 90));
  return NextResponse.json({ ok: true });
}
