"use client";
import { BrandMark } from "@/components/brand/brand-mark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Landing-page buttons link here with ?mode=signup
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "signup") setMode("up");
    const e = q.get("error");
    if (e) setMsg(e);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (!data.session) return setMsg("Check your email to confirm your account, then sign in.");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="logo">
          <BrandMark size={34} />
          <span className="logo-word">acezilla</span>
        </div>
        <h1 className="page" style={{ fontSize: 26 }}>{mode === "in" ? "Welcome back" : "Create your workspace"}</h1>
        <input className="field" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field" type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
        {msg && <div className="eyebrow" style={{ color: "var(--neg)" }}>{msg}</div>}
        <button className="btn" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</button>
        {mode === "in" && <Link href="/forgot-password" className="link">Forgot password?</Link>}
        <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
