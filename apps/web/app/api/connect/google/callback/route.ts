import { NextResponse } from "next/server";
import { exchangeGoogleCode, GA4_SCOPE, GOOGLE_ADS_SCOPE, MERCHANT_SCOPE, SEARCH_CONSOLE_SCOPE } from "@acezilla/connectors";
import { encryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";
import { SUITE } from "@/lib/google-suite";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (m: string) => NextResponse.redirect(`${url.origin}/connections?error=${encodeURIComponent(m)}`);

  if (url.searchParams.get("error")) return fail(`Google login was cancelled (${url.searchParams.get("error")})`);
  const cookieState = req.headers.get("cookie")?.match(/az_google_state=([a-f0-9]+)/)?.[1];
  if (!cookieState || cookieState !== url.searchParams.get("state")) return fail("Login session expired. Please try again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("Google did not return a login code");

  const kind = req.headers.get("cookie")?.match(/az_google_kind=(ga4|merchant|searchconsole|suite)/)?.[1];
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
    // One login can serve several Google services. Each becomes its own connection, with the same stored login.
    const services = kind === "suite" ? (req.headers.get("cookie")?.match(/az_google_services=([a-z0-9.]+)/)?.[1] ?? "").split(".").filter((x) => x in SUITE) : [];
    const targets = kind === "suite" ? services.map((x) => SUITE[x]!) : [{ platform, scope, label: platform }];
    if (targets.length === 0) return fail("No Google service was selected. Please try again.");
    for (const t of targets) {
      const row = { workspace_id: workspace.id, platform: t.platform, scopes: [t.scope], status: "active", token_enc: encryptToken(refreshToken), token_expires_at: null };
      const { data: existing } = await admin.from("connection").select("id").eq("workspace_id", workspace.id).eq("platform", t.platform).maybeSingle();
      const { error } = existing ? await admin.from("connection").update(row).eq("id", existing.id) : await admin.from("connection").insert(row);
      if (error) return fail(error.message);
    }
    if (kind === "suite") {
      const done = NextResponse.redirect(`${url.origin}/connections?notice=${encodeURIComponent(`Connected ${targets.map((t) => t.label).join(", ")}. Now choose which account to read in each card below.`)}`);
      for (const c of ["az_google_state", "az_google_kind", "az_google_services", "az_oauth_ws"]) done.cookies.delete({ name: c, path: "/api/connect/google" });
      return done;
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : kind === "ga4" ? "Could not connect Google Analytics" : kind === "merchant" ? "Could not connect Google Merchant Center" : kind === "searchconsole" ? "Could not connect Google Search Console" : "Could not connect Google Ads");
  }
  const res = NextResponse.redirect(`${url.origin}/connections/${platform}`);
  res.cookies.delete({ name: "az_google_state", path: "/api/connect/google" });
  res.cookies.delete({ name: "az_google_kind", path: "/api/connect/google" });
  return res;
}
