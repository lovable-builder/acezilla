"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { createClient } from "@/lib/supabase/client";

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The emailed link signs the person in (via /auth/callback); without that session there is nothing to reset.
  useEffect(() => { createClient().auth.getUser().then(({ data }) => setReady(data.user ? "yes" : "no")); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setErr("The two passwords do not match.");
    setBusy(true); setErr(null);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="logo"><BrandMark size={34} /><span className="logo-word">acezilla</span></div>
        <h1 className="page" style={{ fontSize: 26 }}>Choose a new password</h1>
        {ready === "no" ? (
          <>
            <p className="sub" style={{ margin: 0 }}>This page needs the link from your reset email. It may have expired.</p>
            <Link href="/forgot-password" className="btn" style={{ textAlign: "center" }}>Request a new link</Link>
          </>
        ) : (
          <>
            <input className="field" type="password" required minLength={8} placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            <input className="field" type="password" required minLength={8} placeholder="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            {err && <div className="eyebrow" style={{ color: "var(--neg)" }}>{err}</div>}
            <button className="btn" disabled={busy || ready === "checking"}>{busy ? "Saving…" : "Save password"}</button>
          </>
        )}
      </form>
    </div>
  );
}
