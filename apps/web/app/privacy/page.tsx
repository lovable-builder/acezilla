import type { Metadata } from "next";
import { Contact, LegalDoc } from "@/components/legal/doc";
import { COMPANY, EFFECTIVE } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · acezilla", description: "What acezilla collects, why, how long it keeps it and how to delete it. We only read from your connected accounts, logins are encrypted, and we never sell your data.", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <LegalDoc title="Privacy Policy" updated={EFFECTIVE}>
      <p>{COMPANY} ("acezilla", "we") is a marketing analytics and planning tool. You connect your own advertising accounts, and we show you your results and prepare suggestions. This policy explains what we collect, why, and how to delete it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account data:</b> your email address and a password (stored only as a salted hash by our authentication provider), and the names of your workspaces.</li>
        <li><b>Login tokens for platforms you connect</b> (Meta, Google Ads, Google Analytics, Google Search Console, Google Merchant Center, TikTok, Shopify, WooCommerce, Allegro): a token that lets us read your advertising data. Tokens are stored encrypted at rest and are only used on our servers. They are never sent to your browser.</li>
        <li><b>Advertising data you authorize us to read:</b> ad account names and IDs, campaign, ad set and ad names, status and budgets, and daily performance figures such as spend, impressions, clicks, conversions and conversion value.</li>
        <li><b>Store order data you authorize us to receive</b> (Shopify, WooCommerce): for each order, its date, its value after tax, shipping and refunds, the marketing source recorded on it (such as UTM tags and ad click IDs), and a one-way hash of the customer, so repeat buyers can be recognised. We do not store customer names, email addresses, phone numbers or delivery addresses; the customer hash is made inside your store, so email addresses never reach us. For WooCommerce, the acezilla plugin on your store sends this data to us, signed with a secret only your store and acezilla share. We get no key or login to your store, and you can stop the flow at any time by deactivating the plugin or disconnecting in acezilla.</li>
        <li><b>Allegro data you authorize us to read:</b> for each order, its date and the value of the items, and a one-way hash of the buyer so repeat buyers can be recognised; your Allegro billing entries (commissions, delivery, advertising and other fees); and your offers' names, prices and visit and watcher counters. We do not store buyer names, addresses, emails or phone numbers. Access is read-only and you can disconnect at any time.</li>
        <li><b>Google Analytics, Search Console and Merchant Center data you authorize us to read:</b> from Analytics, daily visits, key events and purchase revenue per traffic channel for the properties you choose; from Search Console, the search words people used to reach your website, with clicks, views and average position over the last 28 days (aggregated, with no information about the people who searched); from Merchant Center, each product's name, ID, approval status and the problems Google reports, its price next to Google's market price, and daily clicks and views for free listings and ads.</li>
        <li><b>Competitor notes:</b> the competitors you add (name, website, category), the ads you save about them (dates, wording, notes, screenshots you upload), and, when you press Import, the public ads of that competitor that Meta publishes in its Ad Library (wording, dates and Meta's reach estimate). These contain no personal data about the people who saw the ads.</li>
        <li><b>Your plan and settings:</b> the margin, budget, channels and ticked steps you enter in the Strategy map, and product costs and VAT you enter.</li>
        <li><b>Websites you submit for an SEO audit:</b> the address, and the public pages we read on it (titles, headings, text excerpts, links and technical tags). Short excerpts of those public pages are sent to Google's Gemini API to draft suggested wording. We do not send your ad, order or customer data to it. Deleting a website in acezilla deletes its audits and drafts.</li>
        <li><b>AI features (Copilot, weekly summary, campaign builder):</b> when you use them, a summary of your workspace figures (spend, sales totals, campaign and offer names and their results; never customer names, emails or addresses) or the brief you type is sent to Google\'s Gemini models through Vertex AI to write the answer. The AI cannot change anything in your accounts. Drafts and summaries are saved in your workspace and deleted with it. We use Google Cloud under its terms for customer data; we do not use your data to train our own models.</li>
        <li><b>Basic technical data</b> needed to run the service, such as security and error logs.</li>
      </ul>
      <p>We do not collect the personal information of the people who see or click your ads, and we do not read private messages, posts or profiles.</p>

      <h2>Permissions we request</h2>
      <p>acezilla only calls read endpoints of the platforms you connect, and it never changes a campaign, budget, ad or product. Some platforms do not offer a read-only permission, so their sign-in screen can ask for more than we use:</p>
      <ul>
        <li><b>Meta:</b> <code>ads_read</code> and <code>business_management</code>, and your Meta login to read the public Ad Library when you press Import.</li>
        <li><b>Google Ads:</b> the Google Ads API scope, which Google defines as one scope covering reading and changing. We only read reports.</li>
        <li><b>Google Analytics:</b> read-only (<code>analytics.readonly</code>). <b>Search Console:</b> read-only (<code>webmasters.readonly</code>).</li>
        <li><b>Google Merchant Center:</b> <code>auth/content</code>, the only scope Google offers for it, which also covers managing products. We only read product lists, statuses and reports. The one other call is a one-time setup request, started by a button you press, that registers acezilla's developer contact with your Merchant Center account.</li>
        <li><b>Allegro:</b> the scopes shown on Allegro's own consent screen. <b>TikTok:</b> ad account and reporting access, once TikTok approves our application.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To show dashboards and analysis of your advertising performance.</li>
        <li>To prepare suggestions and drafts that you can approve or reject.</li>
        <li>To keep your data up to date (we refresh it automatically once a day and when you ask), to secure the service and to fix problems.</li>
      </ul>
      <p>We do not sell your data, do not use it for advertising, and do not use it to build profiles for any purpose other than showing it back to you.</p>

      <h2>Google user data</h2>
      <p>acezilla's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. Data from Google is used only to provide the user-facing features described above, is not transferred to others except as needed to provide those features, comply with law or protect security, is not used for advertising, and is not read by humans except with your consent, for security, or to comply with law.</p>

      <h2>Who we share it with</h2>
      <p>Only the service providers that run acezilla: Supabase (database and sign-in) and Vercel (hosting), plus the advertising platforms you choose to connect. Each processes data on our behalf under its own terms. We disclose data if required by law.</p>

      <h2>How long we keep it</h2>
      <p>We keep your data while your account is active. When you disconnect a platform inside acezilla, the stored login and everything imported from that platform are deleted immediately, and we ask the platform to revoke our access. When you ask us to delete your account, we delete your account and workspaces within 30 days. Short-lived encrypted backups may persist slightly longer before they expire.</p>

      <h2>Your choices and rights</h2>
      <p>You can disconnect any platform at any time from the Connections page, and you can also revoke acezilla in the platform's own settings. Depending on where you live (for example under the GDPR or CCPA) you may have the right to access, correct, export or delete your data, or to object to its processing. See <a href="/data-deletion">how to delete your data</a> or contact us at <Contact />.</p>

      <h2>Security</h2>
      <p>Platform tokens are encrypted at rest; data is stored with per-workspace access controls so one customer cannot read another's data; connections use HTTPS. No system is perfectly secure, and we will notify affected users of a breach as required by law.</p>

      <h2>Children</h2>
      <p>acezilla is for businesses and is not directed at children under 16.</p>

      <h2>Changes</h2>
      <p>We will post updates here and change the effective date. If a change is material we will tell you in the product or by email.</p>

      <h2>Contact</h2>
      <p>Questions or requests: <Contact />.</p>
    </LegalDoc>
  );
}
