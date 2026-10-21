import { NextResponse } from "next/server";
import { allegroAuthUrl, signAllegroState } from "@acezilla/connectors";
import { allegroEnv } from "@/lib/allegro";
import { requireWriter } from "@/lib/workspace";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const env = allegroEnv();
  const back = (m: string) => NextResponse.redirect(`${origin}/connections?error=${encodeURIComponent(m)}`);
  if (!env.ready) return back("Allegro is not configured");
  let user, workspace;
  try { ({ user, workspace } = await requireWriter()); } catch (e) { return back(e instanceof Error ? e.message : "Not allowed"); }
  const state = signAllegroState(env.stateSecret, user.id, workspace.id);
  return NextResponse.redirect(allegroAuthUrl({ clientId: env.clientId!, redirectUri: `${origin}/api/connect/allegro/callback`, state, sandbox: env.sandbox }));
}
