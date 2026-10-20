"use client";
import { BrandMark } from "@/components/brand/brand-mark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "./nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface Props {
  children: React.ReactNode;
  workspaces: { id: string; name: string }[];
  currentId: string | null;
  syncLabel: string;
  email: string | null;
}

export function Shell({ children, workspaces, currentId, syncLabel, email }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="shell">
      <aside id="app-nav" className={`sidebar${open ? " open" : ""}`}>
        <Link href="/dashboard" className="logo">
          <BrandMark size={30} />
          <span className="logo-word">acezilla</span>
        </Link>
        {currentId && <WorkspaceSwitcher workspaces={workspaces} currentId={currentId} />}
        <nav style={{ flex: 1 }}>
          {NAV.map((g) => (
            <div key={g.label}>
              <div className="nav-label">{g.label}</div>
              {g.items.map((i) => {
                const active = path.startsWith(i.href);
                return (
                  <Link key={i.href} href={i.href} className={`nav-item${active ? " active" : ""}`}>
                    {active && <span className="nav-dot" />}
                    {i.name}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="eyebrow">{syncLabel}</div>
      </aside>
      {open && <button className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div>
        <header className="topbar">
          <button className="menu-btn" aria-label="Open menu" aria-expanded={open} aria-controls="app-nav" onClick={() => setOpen((o) => !o)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
          </button>
          <Link href="/" className="link" title="Back to the acezilla website">← Website</Link>
          <span className="badge">Suggest-only</span>
          {email && <span className="eyebrow" title="Signed in as">{email}</span>}
          <form action="/auth/signout" method="post"><button className="link">Sign out</button></form>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
