"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While an audit is running, re-fetch the page every 3 seconds so results appear on their own. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
