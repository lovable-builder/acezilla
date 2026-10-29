import Link from "next/link";
import { listMerchantAccounts, type MerchantAccount } from "@acezilla/connectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { merchantAccessToken } from "@/lib/merchant";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { disconnect } from "../connection-actions";
import { registerDeveloper, saveAndSyncMerchant } from "./actions";

export default async function MerchantAccounts({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const { data: saved } = current
    ? await supabase.from("merchant_account").select("external_id").eq("workspace_id", current.id)
    : { data: [] };
  const synced = new Set((saved ?? []).map((a) => String(a.external_id)));
  const { data: auth } = await supabase.auth.getUser();
  let accounts: MerchantAccount[] = [];
  let loadError = error;
  if (current) {
    try {
      const admin = createAdminClient();
      const { data: conn } = await admin.from("connection").select("token_enc").eq("workspace_id", current.id).eq("platform", "merchant").maybeSingle();
      if (!conn?.token_enc) throw new Error("Google Merchant Center is not connected");
      accounts = await listMerchantAccounts({ accessToken: await merchantAccessToken(conn.token_enc as string) });
    } catch (e) { loadError = e instanceof Error ? e.message : "Could not load accounts"; }
  }
  return (
    <>
      <div>
        <div className="eyebrow">Google Merchant Center · choose accounts</div>
        <h1 className="page">{synced.size > 0 ? "Edit your synced Merchant Center accounts" : "Which Merchant Center account should acezilla read?"}</h1>
        <p className="sub">We read which of your products Google Shopping shows or blocks (and why), and how many clicks and views your free listings and ads get. acezilla only reads. It never edits products, prices or feeds.</p>
      </div>
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}
      {loadError && <Card style={{ color: "var(--neg)" }}>{loadError}</Card>}
      {(loadError ?? "").includes("not registered") && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 12, borderColor: "var(--accent)" }}>
          <b>One-time setup: register acezilla with your Merchant Center</b>
          <p className="sub" style={{ margin: 0, fontSize: 13 }}>
            Google asks every app to be registered once per Merchant Center account before it answers. Enter your Merchant Center account ID (the number at the top right of Merchant Center) and an email for the developer contact.
            This links acezilla&apos;s Google Cloud project to your account and gives that email the &ldquo;API developer&rdquo; role, which only receives notifications. It changes no products, prices or feeds.
            You must be an admin of the account, and it must be a live (not test) account. If the email is not yet a Merchant Center user, Google emails it an invitation to accept within 14 days.
          </p>
          <form action={registerDeveloper} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Merchant Center account ID</span><input name="account_id" required inputMode="numeric" pattern="[0-9 ]+" placeholder="123456789" className="field tabnum" style={{ padding: "8px 10px" }} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Developer contact email</span><input name="email" type="email" required defaultValue={auth.user?.email ?? ""} className="field" style={{ padding: "8px 10px", minWidth: 240 }} /></label>
            <Button>Register</Button>
          </form>
          <p className="sub" style={{ margin: 0, fontSize: 12 }}>After registering, wait about 5 minutes and reload this page.</p>
        </Card>
      )}
      <Card style={{ fontSize: 13 }}>
        <b>About the permission Google asks for.</b> Google has no read-only permission for Merchant Center, so its sign-in screen says &ldquo;manage your product listings&rdquo;. acezilla only uses the parts that list accounts and read reports, and never sends a change.
      </Card>
      {synced.size > 0 && <Card style={{ fontSize: 13 }}>Ticked accounts are syncing now. <b>Unticking an account removes it and its imported data from acezilla.</b></Card>}
      <form action={saveAndSyncMerchant} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {accounts.map((a) => (
          <Card key={a.id} className="conn">
            <input type="checkbox" name="account" value={a.id} defaultChecked={synced.size > 0 ? synced.has(a.id) : accounts.length === 1} style={{ width: 18, height: 18 }} id={`m${a.id}`} />
            <label htmlFor={`m${a.id}`} style={{ flex: 1, cursor: "pointer" }}>
              <b>{a.name}</b>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{a.id}</div>
            </label>
          </Card>
        ))}
        {accounts.length === 0 && !loadError && <Card>No Merchant Center accounts found for this login. Make sure the Google user can open your account in Merchant Center.</Card>}
        {accounts.length > 0 && (
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="eyebrow">Traffic history</span>
            <select name="range" defaultValue="90" className="field" style={{ padding: "8px 10px" }}>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          {accounts.length > 0 && <Button>{synced.size > 0 ? "Save and sync" : "Import selected accounts"}</Button>}
          <Button asChild variant="outline"><Link href="/connections">Back</Link></Button>
        </div>
      </form>

      <Card style={{ borderColor: "var(--neg)" }}>
        <b>Disconnect Google Merchant Center</b>
        <p className="sub" style={{ fontSize: 13 }}>Deletes the stored login and every product status and traffic row imported from Merchant Center. We also ask Google to revoke access. You can reconnect later.</p>
        <form action={disconnect} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="platform" value="merchant" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="confirm" value="yes" required /> I understand this deletes my Merchant Center data in acezilla</label>
          <Button variant="outline" style={{ color: "var(--neg)" }}>Disconnect</Button>
        </form>
      </Card>
    </>
  );
}
