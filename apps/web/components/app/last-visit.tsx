"use client";
import { useEffect } from "react";

/** Remembers when this browser last opened the Command center. The next visit compares against it. Nothing leaves the browser except this one cookie. */
export function RememberVisit() {
  useEffect(() => {
    try { document.cookie = `az_last_visit=${encodeURIComponent(new Date().toISOString())}; path=/; max-age=31536000; samesite=lax`; } catch { /* cookies blocked: the card simply never shows */ }
  }, []);
  return null;
}
