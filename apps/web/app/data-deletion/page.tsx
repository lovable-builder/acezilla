import type { Metadata } from "next";
import { Contact, LegalDoc } from "@/components/legal/doc";
import { EFFECTIVE } from "@/lib/legal";

export const metadata: Metadata = { title: "Data deletion · acezilla", description: "Disconnect a platform to delete its data instantly, revoke acezilla in Meta, Google or TikTok, or ask us to delete your whole acezilla account.", alternates: { canonical: "/data-deletion" } };

export default function DataDeletion() {
  return (
    <LegalDoc title="How to delete your data" updated={EFFECTIVE}>
      <p>You are in control of the data acezilla holds about you. There are three ways to delete it.</p>

      <h2>1. Disconnect a platform (instant)</h2>
      <ol style={{ paddingLeft: 20, listStyle: "decimal" }}>
        <li>Sign in to acezilla and open <b>Connections</b>.</li>
        <li>Find the connection you want to remove: Meta Ads, Google Ads, Google Analytics, Search Console or Merchant Center (click <b>Choose accounts</b>, <b>Choose properties</b> or <b>Choose websites</b>), or WooCommerce or Allegro (open its page).</li>
        <li>At the bottom of that page, tick the confirmation box and click <b>Disconnect</b>. Repeat for each connection.</li>
      </ol>
      <p>This immediately deletes the stored login and every account, campaign, metric, product, search word and order imported from that platform, and asks the platform to revoke our access (for WooCommerce, also deactivate the acezilla plugin in WordPress).</p>

      <h2>2. Revoke acezilla in the platform itself</h2>
      <ul>
        <li><b>Meta (Facebook / Instagram):</b> Settings → Business Integrations (or Apps and Websites) → find acezilla → Remove. Removing it also lets you ask Meta to delete data it shared with the app.</li>
        <li><b>Google (Ads, Analytics, Search Console, Merchant Center):</b> <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> → acezilla → Remove access. This removes all four at once.</li>
        <li><b>Allegro:</b> your Allegro account settings → connected applications → remove acezilla.</li>
        <li><b>WooCommerce:</b> WordPress → Plugins → deactivate and delete "acezilla for WooCommerce", or click Disconnect under WooCommerce → acezilla.</li>
        <li><b>TikTok:</b> TikTok for Business → Account settings → Authorized apps → remove acezilla.</li>
      </ul>
      <p>Competitor notes, saved ads, your Strategy map plan and website audits are deleted when you delete the competitor, the audit site or the workspace, or under option 3. Revoking stops us from reading new data. To also delete what we already imported, use option 1 or option 3.</p>

      <h2>3. Delete your acezilla account and all data</h2>
      <p>Email <Contact /> from the address you signed up with, with the subject "Delete my data". We will delete your account, workspaces and everything imported, and confirm by reply, within 30 days (usually much sooner). Encrypted backups expire shortly afterwards.</p>

      <p>See our <a href="/privacy">Privacy Policy</a> for details on what we hold and why.</p>
    </LegalDoc>
  );
}
