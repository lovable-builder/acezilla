"use client";
import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    setBusy(false);
    // Same message whether or not the address has an account, so this page cannot be used to find out who is registered.
    if (error && error.status === 429) return setErr("Too many requests. Please wait a minute and try again.");
    setSent(true);
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="logo"><BrandMark size={34} /><span className="logo-word">acezilla</span></div>
        <h1 className="page" style={{ fontSize: 26 }}>Reset your password</h1>
        {sent ? (
          <p className="sub" style={{ margin: 0 }}>If an account exists for <b>{email}</b>, we have sent a link to choose a new password. It can take a minute to arrive, so check your spam folder too.</p>
        ) : (
          <>
            <p className="sub" style={{ margin: 0, fontSize: 14 }}>Enter your email and we will send you a link to choose a new password.</p>
            <input className="field" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            {err && <div className="eyebrow" style={{ color: "var(--neg)" }}>{err}</div>}
            <button className="btn" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </>
        )}
        <Link href="/login" className="link">Back to sign in</Link>
      </form>
    </div>
  );
}
