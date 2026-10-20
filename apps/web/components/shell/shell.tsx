"use client";
import { BrandMark } from "@/components/brand/brand-mark";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  return (
    <div className="shell">
      <aside className="sidebar">
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
      <div>
        <header className="topbar">
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
