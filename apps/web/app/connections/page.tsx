import Link from "next/link";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand/logo";
import { ago } from "@/lib/format";

const STEPS = ["Workspace", "Connect accounts", "Goals & KPIs", "Historical import"];
const CONNECTED_BG = "color-mix(in oklab, var(--pos) 7%, var(--surface))";

export default async function Connections({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const [{ data: conns }, { data: accts }] = current
    ? await Promise.all([
        supabase.from("connection").select("platform,last_sync_at").eq("workspace_id", current.id),
        supabase.from("ad_account").select("platform,name").eq("workspace_id", current.id).order("name"),
      ])
    : [{ data: [] }, { data: [] }];
  const conn = (p: string) => conns?.find((c) => c.platform === p);
  const names = (p: string) => (accts ?? []).filter((a) => a.platform === p).map((a) => a.name as string);
  const metaReady = !!(process.env.META_APP_ID && process.env.META_CONFIG_ID && process.env.META_APP_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const googleReady = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <>
      <div>
        <div className="eyebrow">Step 2 of 4 · Connect accounts</div>
        <h1 className="page">Bring in your ad data</h1>
        <p className="sub">Connect your ad platforms. Everything is read-only.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
        {STEPS.map((s, i) => <div key={s} title={s} style={{ height: 3, borderRadius: 2, background: i < 2 ? "var(--accent)" : "var(--line2)" }} />)}
      </div>
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Connector
            logo={<BrandLogo brand="meta" />} name="Meta Ads" desc="Facebook and Instagram campaigns"
            connected={!!conn("meta")} lastSync={conn("meta")?.last_sync_at as string | undefined} accounts={names("meta")}
            action={conn("meta")
              ? <Button asChild variant="outline"><Link href="/connections/meta">Edit accounts</Link></Button>
              : metaReady ? <Button asChild><a href="/api/connect/meta/start">Connect Meta</a></Button>
              : <Button variant="outline" disabled title="Add the Meta secrets">Not configured</Button>}
          />
          <Connector
            logo={<BrandLogo brand="google" />} name="Google Ads" desc="Search, Shopping and Performance Max"
            connected={!!conn("google")} lastSync={conn("google")?.last_sync_at as string | undefined} accounts={names("google")}
            action={conn("google")
              ? <Button asChild variant="outline"><Link href="/connections/google">Edit accounts</Link></Button>
              : googleReady ? <Button asChild><a href="/api/connect/google/start">Connect Google</a></Button>
              : <Button variant="outline" disabled title="Add the Google secrets">Not configured</Button>}
          />
          <Connector
            logo={<BrandLogo brand="tiktok" />} name="TikTok Ads" desc="Campaigns, spend and creative metrics"
            connected={false} action={<Button variant="outline" disabled title="Waiting for TikTok to approve our app">Pending approval</Button>}
          />
          <Connector
            logo={<BrandLogo brand="shopify" />} name="Shopify" desc="Orders and customers for modeled ROAS"
            connected={false} action={<Button variant="outline" disabled>Coming soon</Button>}
          />
          <Connector
            logo={<BrandLogo brand="ga4" />} name="Google Analytics 4" desc="Sessions and on-site conversions"
            connected={false} action={<Button variant="outline" disabled>Coming soon</Button>}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <b>What we'll import</b>
            <ul className="sub" style={{ fontSize: 14, paddingLeft: 18, listStyle: "disc" }}>
              <li>Campaigns, ad sets, ads and creatives</li>
              <li>Daily spend, impressions, clicks, conversions, revenue</li>
              <li>Store orders, for modeled ROAS (next phase)</li>
            </ul>
          </Card>
          <div style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", borderRadius: 10, padding: 16, fontSize: 14 }}>
            <b>Suggest-only.</b> acezilla reads your data. Nothing changes in a live campaign until a person approves it.
          </div>
          <Button asChild><Link href="/">Continue to dashboard →</Link></Button>
        </div>
      </div>
    </>
  );
}

function Connector({ logo, name, desc, connected, lastSync, accounts = [], action }: {
  logo: React.ReactNode; name: string; desc: string; connected: boolean; lastSync?: string; accounts?: string[]; action: React.ReactNode;
}) {
  return (
    <Card
      className="conn"
      style={{ flexWrap: "wrap", ...(connected ? { borderColor: "var(--pos)", background: CONNECTED_BG } : {}) }}
    >
      {logo}
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b>{name}</b>
          {connected && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--pos)", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--pos)" }} />Connected
            </span>
          )}
        </div>
        <div className="sub" style={{ margin: 0, fontSize: 13 }}>
          {connected
            ? accounts.length > 0
              ? `${accounts.length} account${accounts.length === 1 ? "" : "s"}: ${accounts.join(", ")}${lastSync ? ` · synced ${ago(lastSync)}` : ""}`
              : lastSync ? `Synced ${ago(lastSync)}` : "No accounts selected yet. Click Edit accounts."
            : desc}
        </div>
      </div>
      {action}
    </Card>
  );
}
