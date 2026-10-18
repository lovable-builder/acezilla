"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">a</div>
          <span className="logo-word">acezilla</span>
        </div>
        <nav>
          {NAV.map((g) => (
            <div key={g.label}>
              <div className="nav-label">{g.label}</div>
              {g.items.map((i) => {
                const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
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
      </aside>
      <div>
        <header className="topbar">
          <span className="badge">Suggest-only</span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
