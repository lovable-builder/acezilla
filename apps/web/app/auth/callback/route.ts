import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeRedirectPath } from "@acezilla/models";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["recovery", "email", "signup", "magiclink", "invite", "email_change"];

/**
 * Landing point for links in auth emails (confirm sign-up, reset password).
 * Preferred: ?token_hash=…&type=… (works in any browser). Also accepts ?code=… (needs the browser that requested it).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (m: string) => NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(m)}`);
  const ok = () => NextResponse.redirect(`${url.origin}${safeRedirectPath(url.searchParams.get("next"))}`);

  const problem = url.searchParams.get("error_description");
  if (problem) return fail(problem);

  const supabase = await createClient();
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    if (!OTP_TYPES.includes(type)) return fail("This link is not valid. Please request a new one.");
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.warn(`[auth/callback] verifyOtp failed: ${error.name}: ${error.message}`);
      return fail("This link has expired or was already used. Please request a new one.");
    }
    return ok();
  }

  const code = url.searchParams.get("code");
  if (!code) return fail("This link is missing its sign-in code. Please request a new one.");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn(`[auth/callback] code exchange failed: ${error.name}: ${error.message}`);
    return fail(
      error.name === "AuthPKCECodeVerifierMissingError"
        ? "Please open the link in the same browser where you asked for it, or request a new link."
        : "This link has expired or was already used. Please request a new one.",
    );
  }
  return ok();
}
