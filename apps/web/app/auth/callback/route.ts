import { NextResponse } from "next/server";
import { safeRedirectPath } from "@acezilla/models";
import { createClient } from "@/lib/supabase/server";

/** Landing point for links in auth emails (confirm sign-up, reset password). Exchanges the one-time code for a session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (m: string) => NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(m)}`);
  const problem = url.searchParams.get("error_description");
  if (problem) return fail(problem);
  const code = url.searchParams.get("code");
  if (!code) return fail("This link is missing its sign-in code. Please request a new one.");
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("This link has expired or was already used. Please request a new one.");
  return NextResponse.redirect(`${url.origin}${safeRedirectPath(url.searchParams.get("next"))}`);
}
