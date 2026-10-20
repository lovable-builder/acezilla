import { BrandMark } from "@/components/brand/brand-mark";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/legal";

export function Contact() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent-ink)" }}>{CONTACT_EMAIL}</a> : <span>the contact address on this site (being set up)</span>;
}

export function LegalDoc({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", padding: "40px 16px 80px" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Link href="/" className="logo" style={{ marginBottom: 12 }}>
          <BrandMark size={32} /><span className="logo-word">acezilla</span>
        </Link>
        <div className="eyebrow">Effective {updated}</div>
        <h1 className="page">{title}</h1>
        <div className="legal">{children}</div>
        <nav className="eyebrow" style={{ display: "flex", gap: 16, marginTop: 24 }}>
          <Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/data-deletion">Data deletion</Link>
        </nav>
      </article>
    </div>
  );
}
