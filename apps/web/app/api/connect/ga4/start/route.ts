import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ga4AuthUrl } from "@acezilla/connectors";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(`${origin}/connections?error=Google+is+not+configured`);
  try { await requireWriter(); } catch (e) {
    return NextResponse.redirect(`${origin}/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Not allowed")}`);
  }
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(ga4AuthUrl({ clientId: process.env.GOOGLE_CLIENT_ID, redirectUri: `${origin}/api/connect/google/callback`, state }));
  // Reuses the Google Ads redirect address (already registered with Google); the kind cookie tells the callback which connection this is.
  res.cookies.set("az_google_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/connect/google" });
  res.cookies.set("az_google_kind", "ga4", { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/connect/google" });
  return res;
}
