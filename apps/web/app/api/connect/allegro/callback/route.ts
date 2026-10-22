import { after, NextResponse } from "next/server";
import { ALLEGRO_SCOPES, ALLEGRO_SCOPE_VERSION, AllegroApiError, decodeAllegroJwt, exchangeAllegroCode, verifyAllegroState } from "@acezilla/connectors";
import { allegroEnv } from "@/lib/allegro";
import { encryptToken } from "@/lib/crypto";
import { syncConnection, type ConnRow } from "@/lib/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (m: string) => NextResponse.redirect(`${url.origin}/connections?error=${encodeURIComponent(m)}`);
  const env = allegroEnv();
  if (!env.ready) return fail("Allegro is not configured");
  if (url.searchParams.get("error")) return fail("Allegro login was cancelled");

  let user, workspace;
  try { ({ user, workspace } = await requireWriter()); } catch (e) { return fail(e instanceof Error ? e.message : "Sign in to acezilla first"); }
  // The state must be signed by us, recent, and issued to this user for this workspace, even if a code is present.
  const st = verifyAllegroState(env.stateSecret, url.searchParams.get("state"), user.id);
  if (!st.ok) return fail("The Allegro login session expired. Please try again.");
  if (st.workspaceId !== workspace.id) return fail("Switch back to the workspace you started the connection from and try again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("Allegro did not return a login code");

  try {
    const t = await exchangeAllegroCode({ clientId: env.clientId!, clientSecret: env.clientSecret!, code, redirectUri: `${url.origin}/api/connect/allegro/callback`, sandbox: env.sandbox, userAgent: env.userAgent });
    const row = {
      workspace_id: workspace.id, platform: "allegro", status: "active", last_error: null, scopes: [`v${ALLEGRO_SCOPE_VERSION}`, ...ALLEGRO_SCOPES],
      token_enc: encryptToken(JSON.stringify({ a: t.accessToken, r: t.refreshToken })), token_expires_at: new Date(Date.now() + t.expiresInSec * 1000).toISOString(),
      external_user_id: decodeAllegroJwt(t.accessToken).userName,
    };
    const admin = createAdminClient();
    const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", workspace.id).eq("platform", "allegro").maybeSingle();
    const { data: saved, error } = existing
      ? await admin.from("connection").update(row).eq("id", existing.id).select("id,workspace_id,platform,token_enc").single()
      : await admin.from("connection").insert(row).select("id,workspace_id,platform,token_enc").single();
    if (error || !saved) return fail("Could not save the Allegro connection");
    after(() => syncConnection(admin, saved as ConnRow, 90));
  } catch (e) {
    return fail(e instanceof AllegroApiError ? e.message : "Could not connect Allegro");
  }
  return NextResponse.redirect(`${url.origin}/connections/allegro?notice=${encodeURIComponent("Allegro connected. Importing the last 90 days of orders and ad costs now; refresh in a minute.")}`);
}
