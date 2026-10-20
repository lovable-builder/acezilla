import type { Metadata } from "next";
import { Contact, LegalDoc } from "@/components/legal/doc";
import { COMPANY, EFFECTIVE } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · acezilla", description: "What acezilla collects, why, how long it keeps it and how to delete it. Read-only access to your ad accounts, encrypted logins, and no selling of your data.", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <LegalDoc title="Privacy Policy" updated={EFFECTIVE}>
      <p>{COMPANY} ("acezilla", "we") is a marketing analytics and planning tool. You connect your own advertising accounts, and we show you your results and prepare suggestions. This policy explains what we collect, why, and how to delete it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account data:</b> your email address and a password (stored only as a salted hash by our authentication provider), and the names of your workspaces.</li>
        <li><b>Login tokens for platforms you connect</b> (Meta, Google Ads, TikTok, Shopify): a token that lets us read your advertising data. Tokens are stored encrypted at rest and are only used on our servers. They are never sent to your browser.</li>
        <li><b>Advertising data you authorize us to read:</b> ad account names and IDs, campaign, ad set and ad names, status and budgets, and daily performance figures such as spend, impressions, clicks, conversions and conversion value.</li>
        <li><b>Basic technical data</b> needed to run the service, such as security and error logs.</li>
      </ul>
      <p>We do not collect the personal information of the people who see or click your ads, and we do not read private messages, posts or profiles.</p>

      <h2>Permissions we request</h2>
      <p>We request read access only. For Meta: <code>ads_read</code> and <code>business_management</code>. For Google: the Google Ads API scope, which Google defines as a single scope; acezilla uses it only to read reporting data. For TikTok: ad account and reporting access. acezilla never changes a campaign, budget or ad without a person approving that specific change inside acezilla first.</p>

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
