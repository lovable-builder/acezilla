import { NextResponse } from "next/server";
import { exchangeMetaCode } from "@acezilla/connectors";
import { encryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (qs: string) => NextResponse.redirect(`${url.origin}/connections?${qs}`);
  const fail = (m: string) => back(`error=${encodeURIComponent(m)}`);

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error_description") ?? "Meta login was cancelled");
  const cookieState = req.headers.get("cookie")?.match(/az_meta_state=([a-f0-9]+)/)?.[1];
  if (!cookieState || cookieState !== url.searchParams.get("state")) return fail("Login session expired. Please try again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("Meta did not return a login code");

  try {
    const { workspace } = await requireWriter();
    const startedIn = req.headers.get("cookie")?.match(/az_oauth_ws=([0-9a-f-]{36})/)?.[1];
    if (startedIn && startedIn !== workspace.id) return fail("You switched workspace during the login. Switch back to the workspace you started from, then connect again.");
    const { accessToken, expiresInSec } = await exchangeMetaCode({
      appId: process.env.META_APP_ID!, appSecret: process.env.META_APP_SECRET!,
      redirectUri: `${url.origin}/api/connect/meta/callback`, code, version: process.env.META_GRAPH_VERSION,
    });
    const admin = createAdminClient();
    const row = {
      workspace_id: workspace.id, platform: "meta", scopes: ["ads_read", "business_management"], status: "active",
      token_enc: encryptToken(accessToken), token_expires_at: expiresInSec ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null,
    };
    const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", workspace.id).eq("platform", "meta").maybeSingle();
    const { error } = existing
      ? await admin.from("connection").update(row).eq("id", existing.id)
      : await admin.from("connection").insert(row);
    if (error) return fail(error.message);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not connect Meta");
  }
  const res = NextResponse.redirect(`${url.origin}/connections/meta`);
  res.cookies.delete({ name: "az_meta_state", path: "/api/connect/meta" });
  return res;
}
