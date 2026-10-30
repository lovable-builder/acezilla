import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { googleScopesAuthUrl } from "@acezilla/connectors";
import { SUITE } from "@/lib/google-suite";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const url = new URL(req.url), origin = url.origin;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(`${origin}/connections?error=Google+is+not+configured`);
  const services = [...new Set(url.searchParams.getAll("s"))].filter((s) => s in SUITE);
  if (services.length === 0) return NextResponse.redirect(`${origin}/connections?error=Tick+at+least+one+Google+service`);
  let workspaceId = "";
  try { workspaceId = (await requireWriter()).workspace.id; } catch (e) {
    return NextResponse.redirect(`${origin}/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Not allowed")}`);
  }
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(googleScopesAuthUrl({ clientId: process.env.GOOGLE_CLIENT_ID, redirectUri: `${origin}/api/connect/google/callback`, state, scopes: services.map((s) => SUITE[s]!.scope) }));
  const opts = { httpOnly: true, sameSite: "lax" as const, maxAge: 600, path: "/api/connect/google" };
  res.cookies.set("az_google_state", state, opts);
  res.cookies.set("az_google_kind", "suite", opts);
  res.cookies.set("az_google_services", services.join("."), opts);
  res.cookies.set("az_oauth_ws", workspaceId, opts);
  return res;
}
