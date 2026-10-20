"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn" style={{ padding: "6px 12px", fontSize: 13 }} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard unavailable */ } }}>
      {done ? "Copied ✓" : label}
    </button>
  );
}
