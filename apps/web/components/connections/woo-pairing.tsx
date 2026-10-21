"use client";
import { useActionState, useEffect, useState } from "react";
import { createWooCode, type CodeState } from "@/app/(app)/connections/woocommerce-actions";
import { Button } from "@/components/ui/button";

const TTL_MS = 15 * 60_000;

/** Shows a one-time pairing code with a countdown. The code is never put in the URL. */
export function WooPairing() {
  const [state, action, pending] = useActionState<CodeState, FormData>(createWooCode, {});
  const [left, setLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!state.at) return;
    const tick = () => setLeft(Math.max(0, state.at! + TTL_MS - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state.at]);
  const live = !!state.code && left > 0;
  const mm = String(Math.floor(left / 60000)), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {live && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <code className="mono tabnum" style={{ fontSize: 22, fontWeight: 600, letterSpacing: ".06em", padding: "8px 14px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--line2)" }}>{state.code}</code>
          <Button variant="outline" type="button" onClick={async () => { try { await navigator.clipboard.writeText(state.code!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}>{copied ? "Copied" : "Copy"}</Button>
          <span className="eyebrow tabnum">Expires in {mm}:{ss}</span>
        </div>
      )}
      {state.code && !live && <div className="sub" style={{ margin: 0 }}>That code expired. Create a new one.</div>}
      {state.error && <div style={{ color: "var(--neg)", fontSize: 13 }}>{state.error}</div>}
      <form action={action}><Button disabled={pending}>{pending ? "Creating…" : live ? "Create a new code" : "Create connection code"}</Button></form>
    </div>
  );
}
