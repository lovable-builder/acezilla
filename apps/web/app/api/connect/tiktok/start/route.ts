import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { tiktokAuthUrl } from "@acezilla/connectors";
import { tiktokEnv } from "@/lib/tiktok";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const { appId, ready } = tiktokEnv();
  if (!ready || !appId) return NextResponse.redirect(`${origin}/connections?error=TikTok+is+not+configured`);
  let workspaceId = "";
  try { workspaceId = (await requireWriter()).workspace.id; } catch (e) {
    return NextResponse.redirect(`${origin}/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Not allowed")}`);
  }
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(tiktokAuthUrl({ appId, redirectUri: `${origin}/api/connect/tiktok/callback`, state }));
  res.cookies.set("az_tiktok_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/connect/tiktok" });
  // The login belongs to the workspace it was started in. If the person switches workspace before it returns, the callback refuses to attach it to the wrong one.
  res.cookies.set("az_oauth_ws", workspaceId, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/connect/tiktok" });
  return res;
}
