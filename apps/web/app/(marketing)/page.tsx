import { BrandMark } from "@/components/brand/brand-mark";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { NavActions } from "@/components/landing/nav-actions";
import { ProductPreview } from "@/components/landing/product-preview";
import { Reveal } from "@/components/landing/reveal";
import { CONTACT_EMAIL, SITE } from "@/lib/legal";
import hub from "./assets/hub.jpg";
import control from "./assets/control-room.jpg";
import team from "./assets/team.jpg";
import desk from "./assets/desk.jpg";
import "./landing.css";

const TITLE = "acezilla — see if your ads really pay for themselves";
const DESC = "Connect your shop, Allegro and your ad platforms. See what your ads really earn, profit per offer, and a plan for what to change next. Suggest-only: nothing changes in a live campaign.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESC, url: SITE, siteName: "acezilla", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

const FEATURES = [
  { t: "One command center", d: "Spend, store sales and the return on your ads side by side, with the change against the previous period." },
  { t: "Real return, not the platform's claim", d: "Connect your store and see the sales that really happened next to what each ad platform says it earned, so you spot over-counting." },
  { t: "Profit per Allegro offer", d: "Allegro fees, ads and the cost of your goods taken off every offer, so you see which ones make money and which lose it." },
  { t: "Strategy map", d: "Enter your margin and get a plan: what to build for each channel, what to watch, and what to change, checked against your own results, with a weekly mission to keep you on track." },
  { t: "Profit forecaster", d: "Play a campaign out 10,000 times before you spend and see the chance of a profit or a loss." },
  { t: "Google Shopping and search words", d: "See which products Google Shopping blocks and why, how your prices compare, and the words people search before they find you." },
  { t: "Competitor ads", d: "Save the ads your competitors keep running, ranked by how long they have run, and see which messages they lean on." },
  { t: "SEO and AI-search audit", d: "A plain-language audit of your website for Google and for AI tools, with wording fixes you can copy." },
  { t: "AI copilot briefing", d: "Ask about your numbers in plain words. Every figure it quotes is checked against your data, and anything it could not match is flagged." },
];
const STEPS = [
  { n: "01", t: "Connect", d: "Connect your store (WooCommerce or Allegro) and the ad platforms you use. You choose which accounts we read, and you can change that any time." },
  { n: "02", t: "See what is really working", d: "Your ads and your real sales in one place, compared on the same footing." },
  { n: "03", t: "Decide the next move", d: "acezilla prepares suggestions. You decide, and you make the change in the ad platform yourself." },
];
const FAQ = [
  { q: "Will acezilla change my campaigns on its own?", a: "No. acezilla is suggest-only. It reads your data and prepares suggestions, and it never changes a campaign, budget or ad." },
  { q: "Which platforms does it work with?", a: "Meta Ads, Google Ads, TikTok Ads, Allegro Ads, Google Analytics, Google Search Console and Google Merchant Center for data, and WooCommerce or Allegro for store sales. Shopify is planned." },
  { q: "Is my data safe?", a: "Platform logins are stored encrypted and used only on our servers. Each workspace's data is isolated from every other. You can disconnect a platform or ask us to delete your account at any time." },
  { q: "Who is it for?", a: "Online sellers, especially in Poland, who sell on their own shop and on Allegro and want a clear answer on whether their ads pay for themselves." },
  { q: "Can I choose which accounts it reads?", a: "Yes. You pick the accounts when you connect, and you can edit that selection or disconnect a platform at any time." },
];
const BUILT_FOR = [
  { t: "Founders and e-commerce owners", d: "A straight answer to \"are my ads paying for themselves?\", without becoming a media buyer." },
  { t: "Allegro and WooCommerce sellers", d: "Profit per offer after fees, ads and goods, next to what your ads cost." },
  { t: "In-house marketers", d: "One view across ad platforms, Analytics and Search Console in place of several dashboards." },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE}/#org`, name: "acezilla", url: SITE, logo: `${SITE}/icon.png` },
    { "@type": "WebSite", "@id": `${SITE}/#site`, url: SITE, name: "acezilla", publisher: { "@id": `${SITE}/#org` }, inLanguage: "en" },
    { "@type": "SoftwareApplication", name: "acezilla", url: SITE, applicationCategory: "BusinessApplication", operatingSystem: "Web", description: DESC, publisher: { "@id": `${SITE}/#org` } },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

export default function Landing() {
  return (
    <div className="lp">
      {/* Structured data mirrors the visible FAQ and product description; "<" is escaped so content can never close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      {/* ---------- nav ---------- */}
      <header className="lp-nav">
        <Link href="/" className="lp-brand"><BrandMark size={34} /><span className="logo-word">acezilla</span></Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a><a href="#features">Features</a><a href="#trust">Trust</a><a href="#faq">FAQ</a>
        </nav>
        <div className="lp-nav-cta">
          <NavActions />
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero">
        <Image src={hub} alt="" fill priority placeholder="blur" sizes="100vw" className="lp-hero-img" />
        <div className="lp-hero-shade" />
        <div className="lp-wrap lp-hero-copy">
          <p className="lp-pill"><i /> Allegro · WooCommerce · Meta · Google</p>
          <h1>Your AI marketing agency, <span>in one workspace.</span></h1>
          <p className="lp-lede">acezilla connects your shop, Allegro and your ad platforms, shows what is really working, and prepares your next move. It never changes a live campaign: you make the changes yourself.</p>
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
          {([["meta", "Meta Ads"], ["google", "Google Ads"], ["allegro", "Allegro"], ["woocommerce", "WooCommerce"]] as const).map(([b, n]) => (
            <div key={b} className="lp-chip"><BrandLogo brand={b} size={40} /><span><b>{n}</b></span></div>
          ))}
        </div>
      </section>

      {/* ---------- definition (a short direct answer for search and AI engines) ---------- */}
      <section className="lp-wrap lp-define">
        <h2>What is acezilla?</h2>
        <p>acezilla is a marketing workspace that connects your store, Allegro and your ad accounts. It shows what is really working in one place, flags problems early, and prepares suggestions for you to act on yourself. Shopify is planned.</p>
      </section>

      {/* ---------- problem / value ---------- */}
      <section className="lp-section">
        <div className="lp-wrap lp-split">
          <Reveal className="lp-copy">
            <p className="lp-kicker mono">The problem</p>
            <h2>Three dashboards, three versions of the truth.</h2>
            <p>Every platform grades its own homework and claims the same sale. You end up switching tabs, pasting numbers into a spreadsheet, and guessing where the next dollar should go.</p>
            <ul className="lp-ticks">
              <li>Compare every platform with your real sales</li>
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
              <li><b>We only read.</b> acezilla only calls read endpoints. Some platforms, such as Google Merchant Center, have no read-only permission, so their sign-in screen may ask for more than we use.</li>
              <li><b>Suggestions only.</b> acezilla never changes a campaign, budget or ad. You decide and make every change yourself.</li>
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
              <details key={f.q}><summary><h3>{f.q}</h3></summary><p>{f.a}</p></details>
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
          <Link href="/" className="lp-brand"><BrandMark size={30} /><span className="logo-word">acezilla</span></Link>
          <nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/data-deletion">Data deletion</Link>{CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a> : null}</nav>
          <p>© 2026 acezilla. Meta, Google, TikTok, Shopify, Allegro and WooCommerce are trademarks of their owners and are used only to identify the platforms acezilla connects to.</p>
        </div>
      </footer>
    </div>
  );
}
