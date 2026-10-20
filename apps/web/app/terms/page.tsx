import type { Metadata } from "next";
import { Contact, LegalDoc } from "@/components/legal/doc";
import { COMPANY, EFFECTIVE } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service · acezilla" };

export default function Terms() {
  return (
    <LegalDoc title="Terms of Service" updated={EFFECTIVE}>
      <p>These terms govern your use of acezilla, provided by {COMPANY}. By creating an account or using the service you agree to them.</p>

      <h2>The service</h2>
      <p>acezilla connects to advertising and store accounts you authorize, shows your performance data, and prepares suggestions. It is a tool to help you decide; you remain responsible for your advertising and your accounts.</p>

      <h2>Suggest-only</h2>
      <p>acezilla does not change a live campaign, budget or ad on its own. Any change to an advertising platform requires an explicit approval inside acezilla by a person with permission to approve it, and is recorded in an audit log.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must give accurate information and keep your login secure. You are responsible for activity under your account.</li>
        <li>You may only connect accounts you are authorized to manage, and you must follow the terms of each platform you connect (Meta, Google, TikTok, Shopify).</li>
        <li>If you invite others to a workspace, you are responsible for what they do with it.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not misuse the service: no unlawful use, no attempts to access other customers' data, no interfering with or overloading the service, no reverse engineering except as the law allows, and no using it to violate a platform's rules.</p>

      <h2>Third-party platforms</h2>
      <p>Data comes from third parties and can be delayed, incomplete or revised by them. Platforms may change or restrict their APIs, which can affect acezilla. We are not responsible for the platforms' availability or decisions.</p>

      <h2>Estimates are not guarantees</h2>
      <p>Figures such as modeled ROAS, forecasts and recommendations are estimates based on available data and assumptions. They are not guarantees of results.</p>

      <h2>Your data</h2>
      <p>You keep ownership of your data. You give us permission to process it only to provide the service, as described in our <a href="/privacy">Privacy Policy</a>. You can disconnect a platform or ask us to delete your account at any time.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep acezilla running but do not promise uninterrupted service. We may change or discontinue features, and will give reasonable notice of changes that significantly affect you.</p>

      <h2>Ending your use</h2>
      <p>You may stop using acezilla and delete your data at any time. We may suspend or end access for breach of these terms or to protect the service or other users.</p>

      <h2>Disclaimer and limits of liability</h2>
      <p>acezilla is provided "as is" without warranties of any kind, to the extent the law allows. To the extent the law allows, we are not liable for indirect or consequential losses, lost profits or lost advertising spend arising from your use of the service, and our total liability is limited to the amount you paid us in the 12 months before the claim.</p>

      <h2>Changes to these terms</h2>
      <p>We may update these terms. If a change is material we will notify you; continuing to use acezilla after the effective date means you accept the update.</p>

      <h2>Contact</h2>
      <p>Questions: <Contact />.</p>
    </LegalDoc>
  );
}
