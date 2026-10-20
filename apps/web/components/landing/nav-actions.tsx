"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Sign in / Get started for visitors, Open dashboard for people who are already signed in.
 *  Uses only the presence of the session cookie, so the landing page itself stays static and fast. */
export function NavActions() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(document.cookie.split("; ").some((c) => c.startsWith("sb-"))); }, []);
  return signedIn ? (
    <Link href="/dashboard" className="lp-btn lp-btn-accent">Open dashboard</Link>
  ) : (
    <>
      <Link href="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
      <Link href="/login?mode=signup" className="lp-btn lp-btn-solid">Get started</Link>
    </>
  );
}
