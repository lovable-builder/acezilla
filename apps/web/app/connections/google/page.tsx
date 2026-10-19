import Link from "next/link";
import { listGoogleAdAccounts, type GoogleAdAccount } from "@acezilla/connectors";
import { googleAccessToken } from "@/lib/google-token";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveAndSyncGoogle } from "./actions";

export default async function GoogleAccounts({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { current } = await getWorkspaceContext();
  let accounts: GoogleAdAccount[] = [];
  let loadError = error;
  if (current) {
    try {
      const { accessToken } = await googleAccessToken(current.id);
      accounts = await listGoogleAdAccounts({ accessToken, version: process.env.GOOGLE_ADS_API_VERSION || undefined });
    } catch (e) { loadError = e instanceof Error ? e.message : "Could not load ad accounts"; }
  }
  return (
    <>
      <div>
        <div className="eyebrow">Google Ads · choose accounts</div>
        <h1 className="page">Which Google Ads accounts should acezilla read?</h1>
        <p className="sub">Read-only. We import your history and never change a campaign without your approval.</p>
      </div>
      {loadError && <Card style={{ color: "var(--neg)" }}>{loadError}</Card>}
      <form action={saveAndSyncGoogle} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {accounts.map((a) => (
          <Card key={a.id} className="conn">
            <input type="checkbox" name="account" value={a.id} defaultChecked style={{ width: 18, height: 18 }} id={`g${a.id}`} />
            <label htmlFor={`g${a.id}`} style={{ flex: 1, cursor: "pointer" }}>
              <b>{a.name}</b>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{a.id} · {a.currency}{a.loginCustomerId ? ` · via manager ${a.loginCustomerId}` : ""}</div>
            </label>
          </Card>
        ))}
        {accounts.length === 0 && !loadError && <Card>No Google Ads accounts found for this login. Make sure the Google user can open an ad account in Google Ads.</Card>}
        {accounts.length > 0 && (
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="eyebrow">History</span>
            <select name="range" defaultValue="730" className="field" style={{ padding: "8px 10px" }}>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
              <option value="730">Last 24 months</option>
              <option value="1095">Last 36 months</option>
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          {accounts.length > 0 && <Button>Import selected accounts</Button>}
          <Button asChild variant="outline"><Link href="/connections">Back</Link></Button>
        </div>
      </form>
    </>
  );
}
