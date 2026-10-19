import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { metaAuthUrl } from "@acezilla/connectors";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const { META_APP_ID, META_CONFIG_ID, META_GRAPH_VERSION } = process.env;
  if (!META_APP_ID || !META_CONFIG_ID) return NextResponse.redirect(`${origin}/connections?error=Meta+is+not+configured`);
  try { await requireWriter(); } catch (e) {
    return NextResponse.redirect(`${origin}/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Not allowed")}`);
  }
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(metaAuthUrl({ appId: META_APP_ID, configId: META_CONFIG_ID, redirectUri: `${origin}/api/connect/meta/callback`, state, version: META_GRAPH_VERSION }));
  res.cookies.set("az_meta_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/connect/meta" });
  return res;
}
