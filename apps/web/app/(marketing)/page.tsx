import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { ProductPreview } from "@/components/landing/product-preview";
import { Reveal } from "@/components/landing/reveal";
import { CONTACT_EMAIL, SITE } from "@/lib/legal";
import hub from "./assets/hub.jpg";
import control from "./assets/control-room.jpg";
import team from "./assets/team.jpg";
import desk from "./assets/desk.jpg";
import "./landing.css";

const TITLE = "acezilla — your AI marketing agency for Meta, Google and TikTok";
const DESC = "One workspace to plan, buy and understand paid media. See what is really working across platforms, and let AI prepare the next move. Nothing changes in a live campaign until you approve it.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, url: SITE, siteName: "acezilla", type: "website", images: [{ url: hub.src, width: hub.width, height: hub.height }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [hub.src] },
};

const FEATURES = [
  { t: "One command center", d: "Spend, revenue, ROAS and CPA from every platform side by side, with the change against the previous period and a platform-by-platform breakdown." },
  { t: "Anomaly alerts", d: "Spots a sudden ROAS drop or a creative wearing out before it quietly drains your budget, and tells you why in plain words." },
  { t: "Always up to date", d: "Your data syncs automatically every day, with a Sync now button. Each connection shows its health and warns you before a login expires." },
  { t: "Modeled ROAS", d: "Connect your store and see the revenue that really happened next to what each platform claims, with the overlap removed." },
  { t: "AI copilot briefing", d: "A plain-language morning briefing: what changed, why it changed, and what to do next. Every number cites its source." },
  { t: "Budget planner", d: "Forecasts from response curves show where your next dollar earns the most, and what each split is expected to return." },
  { t: "One-brief campaign builder", d: "Write one brief and get a valid setup for every platform, created as paused drafts for you to approve." },
  { t: "Approvals and audit log", d: "Every change starts as a draft. A person approves it, and every action is recorded." },
  { t: "Creative analysis", d: "Hook, hold and drop-off for each creative, with fatigue flagged before results fall." },
];
const STEPS = [
  { n: "01", t: "Connect", d: "Sign in with Meta or Google in a few clicks. You choose which ad accounts we can read, and you can change that any time." },
  { n: "02", t: "See what is really working", d: "Every platform in one place, compared on the same footing, with alerts when something changes." },
  { n: "03", t: "Approve the next move", d: "acezilla prepares suggestions as drafts. You review them, approve what you like, and nothing else ever happens." },
];
const FAQ = [
  { q: "Will acezilla change my campaigns on its own?", a: "No. acezilla is suggest-only. Connections are read-only, and any change it proposes is a draft that a person has to approve first." },
  { q: "Which platforms does it work with?", a: "Meta Ads, Google Ads and TikTok Ads for advertising data, and Shopify for store revenue." },
  { q: "Is my data safe?", a: "Platform logins are stored encrypted and used only on our servers. Each workspace's data is isolated from every other. You can disconnect a platform or ask us to delete your account at any time." },
  { q: "Who is it for?", a: "Founders and e-commerce owners who want a clear answer on where the next dollar should go, in-house marketers tired of juggling dashboards, and agencies managing several clients." },
  { q: "Can I choose which ad accounts it reads?", a: "Yes. You pick the accounts when you connect, and you can edit that selection or disconnect a platform at any time." },
];
const BUILT_FOR = [
  { t: "Founders and e-commerce owners", d: "A straight answer to \"where should my next $1,000 go?\", without becoming a media buyer." },
  { t: "In-house marketers", d: "One view across Meta, Google and TikTok in place of three dashboards and a spreadsheet." },
  { t: "Agencies and media buyers", d: "Client workspaces, approvals and shareable reporting, all built around the same suggest-only rule." },
];

export default function Landing() {
  return (
    <div className="lp">
      {/* ---------- nav ---------- */}
      <header className="lp-nav">
        <Link href="/" className="lp-brand"><span className="logo-mark">a</span><span className="logo-word">acezilla</span></Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a><a href="#features">Features</a><a href="#trust">Trust</a><a href="#faq">FAQ</a>
        </nav>
        <div className="lp-nav-cta">
          <Link href="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
          <Link href="/login?mode=signup" className="lp-btn lp-btn-solid">Get started</Link>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero">
        <Image src={hub} alt="" fill priority placeholder="blur" sizes="100vw" className="lp-hero-img" />
        <div className="lp-hero-shade" />
        <div className="lp-wrap lp-hero-copy">
          <p className="lp-pill"><i /> Meta · Google · TikTok · Shopify</p>
          <h1>Your AI marketing agency, <span>in one workspace.</span></h1>
          <p className="lp-lede">acezilla connects Meta, Google and TikTok, shows what is really working, and prepares your next move. Nothing changes in a live campaign until you approve it.</p>
          <div className="lp-cta-row">
            <Link href="/login?mode=signup" className="lp-btn lp-btn-accent lp-btn-lg">Get started</Link>
            <a href="#how" className="lp-btn lp-btn-outline lp-btn-lg">See how it works</a>
          </div>
          <ul className="lp-trustline">
            <li>Read-only connections</li><li>Suggest-only AI</li><li>Delete your data any time</li>
          </ul>
        </div>
      </section>

      {/* ---------- product preview ---------- */}
      <section className="lp-wrap lp-preview-wrap">
        <Reveal><ProductPreview /></Reveal>
        <p className="lp-caption">The acezilla command center, shown with sample data.</p>
      </section>

      {/* ---------- platforms ---------- */}
      <section className="lp-wrap lp-platforms-strip">
        <p className="eyebrow">One place for the platforms you already advertise on</p>
        <div>
          {([["meta", "Meta Ads"], ["google", "Google Ads"], ["tiktok", "TikTok Ads"], ["shopify", "Shopify"]] as const).map(([b, n]) => (
            <div key={b} className="lp-chip"><BrandLogo brand={b} size={40} /><span><b>{n}</b></span></div>
          ))}
        </div>
      </section>

      {/* ---------- problem / value ---------- */}
      <section className="lp-section">
        <div className="lp-wrap lp-split">
          <Reveal className="lp-copy">
            <p className="lp-kicker mono">The problem</p>
            <h2>Three dashboards, three versions of the truth.</h2>
            <p>Every platform grades its own homework and claims the same sale. You end up switching tabs, pasting numbers into a spreadsheet, and guessing where the next dollar should go.</p>
            <ul className="lp-ticks">
              <li>Compare Meta, Google and TikTok on the same footing</li>
              <li>See changes the day they happen, not at month end</li>
              <li>Know what to do next, not just what happened</li>
            </ul>
          </Reveal>
          <Reveal delay={120} className="lp-figure"><Image src={team} alt="Two marketers reviewing a combined Meta, Google and TikTok dashboard on one screen" sizes="(max-width: 900px) 100vw, 560px" placeholder="blur" /></Reveal>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="lp-section lp-section-alt">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <p className="lp-kicker mono">How it works</p>
            <h2>From connected to confident in three steps.</h2>
          </Reveal>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 90} className="lp-step"><span className="mono">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- hub feature ---------- */}
      <section className="lp-section">
        <div className="lp-wrap lp-split lp-split-rev">
          <Reveal className="lp-copy">
            <p className="lp-kicker mono">One hub</p>
            <h2>Everything flows into one workspace.</h2>
            <p>Each platform feeds the same normalized view: accounts, campaigns, ads and daily results. The same metrics mean the same thing everywhere, so a number in acezilla is a number you can compare.</p>
            <p>New platforms plug into the same hub. Add a client, a store or another ad account without rebuilding anything.</p>
          </Reveal>
          <Reveal delay={120} className="lp-figure lp-figure-dark"><Image src={control} alt="Meta, Google Ads and TikTok feeding data streams into a single central hub" sizes="(max-width: 900px) 100vw, 520px" placeholder="blur" /></Reveal>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" className="lp-section lp-section-alt">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <p className="lp-kicker mono">Features</p>
            <h2>Everything you need to run paid media.</h2>
            <p>Plan, buy and analyze in one loop, with AI that explains every recommendation.</p>
          </Reveal>
          <div className="lp-grid lp-grid-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={(i % 3) * 70} className="lp-card"><span className="mono">{String(i + 1).padStart(2, "0")}</span><h3>{f.t}</h3><p>{f.d}</p></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- trust ---------- */}
      <section id="trust" className="lp-section">
        <div className="lp-wrap lp-split lp-split-rev">
          <Reveal delay={0} className="lp-figure"><Image src={desk} alt="A marketer reviewing suggested changes on a dashboard before approving them" sizes="(max-width: 900px) 100vw, 600px" placeholder="blur" /></Reveal>
          <Reveal delay={120} className="lp-copy">
            <p className="lp-kicker mono">Trust</p>
            <h2>AI that never touches your live campaigns on its own.</h2>
            <p>acezilla is built around one rule: it suggests, you decide.</p>
            <ul className="lp-ticks">
              <li><b>Read-only access.</b> We request read permissions only.</li>
              <li><b>Suggestions are drafts.</b> A person approves every change, and every action is logged.</li>
              <li><b>Isolated by workspace.</b> One customer can never see another's data.</li>
              <li><b>Yours to delete.</b> Disconnect a platform and its data is removed immediately.</li>
            </ul>
            <p><Link href="/privacy" className="lp-textlink">Read our privacy policy →</Link></p>
          </Reveal>
        </div>
      </section>

      {/* ---------- built for ---------- */}
      <section className="lp-section lp-section-alt">
        <div className="lp-wrap">
          <Reveal className="lp-head"><p className="lp-kicker mono">Built for</p><h2>Whether you are a team of one or fifty.</h2></Reveal>
          <div className="lp-grid lp-grid-3">
            {BUILT_FOR.map((b, i) => <Reveal key={b.t} delay={i * 80} className="lp-card"><h3>{b.t}</h3><p>{b.d}</p></Reveal>)}
          </div>
        </div>
      </section>

      {/* ---------- faq ---------- */}
      <section id="faq" className="lp-section">
        <div className="lp-wrap lp-faq">
          <Reveal className="lp-head"><p className="lp-kicker mono">FAQ</p><h2>Questions, answered straight.</h2></Reveal>
          <div>
            {FAQ.map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="lp-final">
        <Image src={hub} alt="" fill sizes="100vw" className="lp-final-img" />
        <div className="lp-hero-shade" />
        <Reveal className="lp-wrap lp-final-copy">
          <h2>Know where your next dollar should go.</h2>
          <p>Create your workspace and connect your first ad account in minutes.</p>
          <Link href="/login?mode=signup" className="lp-btn lp-btn-accent lp-btn-lg">Get started</Link>
        </Reveal>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <Link href="/" className="lp-brand"><span className="logo-mark">a</span><span className="logo-word">acezilla</span></Link>
          <nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/data-deletion">Data deletion</Link>{CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a> : null}</nav>
          <p>© 2026 acezilla. Meta, Google, TikTok and Shopify are trademarks of their owners and are used only to identify the platforms acezilla connects to.</p>
        </div>
      </footer>
    </div>
  );
}
