import { NextResponse } from "next/server";
import { exchangeGoogleCode, GOOGLE_ADS_SCOPE } from "@acezilla/connectors";
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

  try {
    const { workspace } = await requireWriter();
    const { refreshToken } = await exchangeGoogleCode({
      clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: `${url.origin}/api/connect/google/callback`, code,
    });
    const admin = createAdminClient();
    const row = { workspace_id: workspace.id, platform: "google", scopes: [GOOGLE_ADS_SCOPE], status: "active", token_enc: encryptToken(refreshToken), token_expires_at: null };
    const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", workspace.id).eq("platform", "google").maybeSingle();
    const { error } = existing ? await admin.from("connection").update(row).eq("id", existing.id) : await admin.from("connection").insert(row);
    if (error) return fail(error.message);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not connect Google Ads");
  }
  const res = NextResponse.redirect(`${url.origin}/connections/google`);
  res.cookies.delete({ name: "az_google_state", path: "/api/connect/google" });
  return res;
}
