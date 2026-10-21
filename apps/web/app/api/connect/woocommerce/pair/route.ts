import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizePairingCode, normalizeStoreUrl } from "@acezilla/connectors";
import { encryptToken } from "@/lib/crypto";
import { SITE } from "@/lib/legal";
import { createAdminClient } from "@/lib/supabase/admin";

const CODE_TTL_MS = 15 * 60_000;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Called by the acezilla plugin when the store owner pastes their pairing code. The code (single use, 15 minutes)
 * is what ties the store to a workspace. We answer with a fresh signing secret that only the plugin and we know.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Invalid request"); }
  const code = normalizePairingCode(body?.code);
  if (!code) return bad("That code does not look right. Copy it again from acezilla.");
  let siteUrl: string;
  try { siteUrl = normalizeStoreUrl(String(body.site_url ?? ""), { allowLocalHttp: process.env.NODE_ENV !== "production" }); } catch (e) { return bad(e instanceof Error ? e.message : "Invalid store address"); }

  const admin = createAdminClient();
  const { data: n } = await admin.from("connect_nonce").delete()
    .eq("token_hash", createHash("sha256").update(code).digest("hex")).eq("platform", "woocommerce")
    .gte("created_at", new Date(Date.now() - CODE_TTL_MS).toISOString()).select("workspace_id").maybeSingle();
  if (!n) return bad("That code has expired or was already used. Create a new one in acezilla.");

  const secret = randomBytes(32).toString("hex");
  const row = {
    workspace_id: n.workspace_id as string, platform: "woocommerce", scopes: ["orders_push"], status: "active", last_error: null, last_sync_at: null,
    token_enc: encryptToken(JSON.stringify({ secret, siteUrl })), token_expires_at: null, external_user_id: new URL(siteUrl).host,
  };
  const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", row.workspace_id).eq("platform", "woocommerce").maybeSingle();
  const { data: saved, error } = existing
    ? await admin.from("connection").update(row).eq("id", existing.id).select("id").single()
    : await admin.from("connection").insert(row).select("id").single();
  if (error || !saved) return bad("Could not save the connection. Please try again.", 500);
  return NextResponse.json({ connection_id: saved.id, secret, events_url: `${SITE}/api/connect/woocommerce/events` });
}
