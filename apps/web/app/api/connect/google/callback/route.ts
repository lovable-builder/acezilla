import { NextResponse } from "next/server";
import { exchangeGoogleCode, GA4_SCOPE, GOOGLE_ADS_SCOPE, MERCHANT_SCOPE, SEARCH_CONSOLE_SCOPE } from "@acezilla/connectors";
import { encryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (m: string) => NextResponse.redirect(`${url.origin}/connections?error=${encodeURIComponent(m)}`);

  if (url.searchParams.get("error")) return fail(`Google login was cancelled (${url.searchParams.get("error")})`);
  const cookieState = req.headers.get("cookie")?.match(/az_google_state=([a-f0-9]+)/)?.[1];
  if (!cookieState || cookieState !== url.searchParams.get("state")) return fail("Login session expired. Please try again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("Google did not return a login code");

  const kind = req.headers.get("cookie")?.match(/az_google_kind=(ga4|merchant|searchconsole)/)?.[1];
  const platform = kind ?? "google";
  const scope = kind === "ga4" ? GA4_SCOPE : kind === "merchant" ? MERCHANT_SCOPE : kind === "searchconsole" ? SEARCH_CONSOLE_SCOPE : GOOGLE_ADS_SCOPE;
  try {
    const { workspace } = await requireWriter();
    const startedIn = req.headers.get("cookie")?.match(/az_oauth_ws=([0-9a-f-]{36})/)?.[1];
    if (startedIn && startedIn !== workspace.id) return fail("You switched workspace during the login. Switch back to the workspace you started from, then connect again.");
    const { refreshToken } = await exchangeGoogleCode({
      clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: `${url.origin}/api/connect/google/callback`, code,
    });
    const admin = createAdminClient();
    const row = { workspace_id: workspace.id, platform, scopes: [scope], status: "active", token_enc: encryptToken(refreshToken), token_expires_at: null };
    const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", workspace.id).eq("platform", platform).maybeSingle();
    const { error } = existing ? await admin.from("connection").update(row).eq("id", existing.id) : await admin.from("connection").insert(row);
    if (error) return fail(error.message);
  } catch (e) {
    return fail(e instanceof Error ? e.message : kind === "ga4" ? "Could not connect Google Analytics" : kind === "merchant" ? "Could not connect Google Merchant Center" : kind === "searchconsole" ? "Could not connect Google Search Console" : "Could not connect Google Ads");
  }
  const res = NextResponse.redirect(`${url.origin}/connections/${platform}`);
  res.cookies.delete({ name: "az_google_state", path: "/api/connect/google" });
  res.cookies.delete({ name: "az_google_kind", path: "/api/connect/google" });
  return res;
}
