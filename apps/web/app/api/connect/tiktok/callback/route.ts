import { NextResponse } from "next/server";
import { exchangeTiktokCode } from "@acezilla/connectors";
import { encryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { tiktokEnv } from "@/lib/tiktok";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (qs: string) => NextResponse.redirect(`${url.origin}/connections?${qs}`);
  const fail = (m: string) => back(`error=${encodeURIComponent(m)}`);

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error_description") ?? "TikTok login was cancelled");
  const cookieState = req.headers.get("cookie")?.match(/az_tiktok_state=([a-f0-9]+)/)?.[1];
  if (!cookieState || cookieState !== url.searchParams.get("state")) return fail("Login session expired. Please try again.");
  // TikTok sends the one-time code as auth_code (and repeats it as code).
  const authCode = url.searchParams.get("auth_code") ?? url.searchParams.get("code");
  if (!authCode) return fail("TikTok did not return a login code");

  try {
    const { appId, appSecret } = tiktokEnv();
    if (!appId || !appSecret) return fail("TikTok is not configured");
    const { workspace } = await requireWriter();
    const startedIn = req.headers.get("cookie")?.match(/az_oauth_ws=([0-9a-f-]{36})/)?.[1];
    if (startedIn && startedIn !== workspace.id) return fail("You switched workspace during the login. Switch back to the workspace you started from, then connect again.");
    const { accessToken } = await exchangeTiktokCode({ appId, appSecret, authCode });
    const admin = createAdminClient();
    // TikTok advertiser tokens do not carry an expiry; a revoked one shows up as an error on the next sync and asks for a new login.
    const row = { workspace_id: workspace.id, platform: "tiktok", scopes: ["ad_reporting_read"], status: "active", last_error: null, token_enc: encryptToken(accessToken), token_expires_at: null };
    const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", workspace.id).eq("platform", "tiktok").maybeSingle();
    const { error } = existing
      ? await admin.from("connection").update(row).eq("id", existing.id)
      : await admin.from("connection").insert(row);
    if (error) return fail(error.message);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not connect TikTok");
  }
  const res = NextResponse.redirect(`${url.origin}/connections/tiktok`);
  res.cookies.delete({ name: "az_tiktok_state", path: "/api/connect/tiktok" });
  return res;
}
