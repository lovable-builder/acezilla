"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** A page failed to load. Say so plainly and offer a way forward, never a raw error. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }} role="alert">
      <h1 className="h2" style={{ margin: 0 }}>This page could not load</h1>
      <p className="sub" style={{ margin: 0 }}>Something went wrong while reading your data. Your data is safe and nothing was changed. Try again; if it keeps happening, check Connections for a source that needs attention.</p>
      {error.digest && <span className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>Reference: {error.digest}</span>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline"><Link href="/connections">Open Connections</Link></Button>
      </div>
    </Card>
  );
}
