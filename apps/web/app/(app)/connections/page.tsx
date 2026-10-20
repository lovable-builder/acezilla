import Link from "next/link";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand/logo";
import { ago } from "@/lib/format";
import { syncNow } from "./connection-actions";

const STEPS = ["Workspace", "Connect accounts", "Goals & KPIs", "Historical import"];
const CONNECTED_BG = "color-mix(in oklab, var(--pos) 7%, var(--surface))";

export default async function Connections({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const [{ data: conns }, { data: accts }] = current
    ? await Promise.all([
        supabase.from("connection").select("platform,last_sync_at,status,last_error,token_expires_at").eq("workspace_id", current.id),
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
          {(["meta", "google"] as const).map((id) => {
            const c = conn(id);
            const ready = id === "meta" ? metaReady : googleReady;
            const label = id === "meta" ? "Meta" : "Google";
            const daysLeft = c?.token_expires_at ? Math.floor((new Date(c.token_expires_at as string).getTime() - Date.now()) / 86400000) : null;
            const broken = c && (c.status === "error" || c.status === "needs_reauth");
            return (
              <Connector
                key={id}
                logo={<BrandLogo brand={id} />}
                name={id === "meta" ? "Meta Ads" : "Google Ads"}
                desc={id === "meta" ? "Facebook and Instagram campaigns" : "Search, Shopping and Performance Max"}
                connected={!!c} lastSync={c?.last_sync_at as string | undefined} accounts={names(id)}
                problem={broken ? (c.status === "needs_reauth" ? "Login expired. Reconnect to keep syncing." : `Sync failed: ${c.last_error ?? "unknown error"}`) : undefined}
                warning={!broken && daysLeft !== null && daysLeft <= 10 ? `Login expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? "" : "s"}. Reconnect to renew.` : undefined}
                action={
                  c ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {c.status === "needs_reauth" || (daysLeft !== null && daysLeft <= 10)
                        ? <Button asChild><a href={`/api/connect/${id}/start`}>Reconnect</a></Button> : null}
                      <form action={syncNow}><input type="hidden" name="platform" value={id} /><Button variant="ghost">Sync now</Button></form>
                      <Button asChild variant="outline"><Link href={`/connections/${id}`}>Edit accounts</Link></Button>
                    </div>
                  ) : ready ? <Button asChild><a href={`/api/connect/${id}/start`}>Connect {label}</a></Button>
                  : <Button variant="outline" disabled title={`Add the ${label} secrets`}>Not configured</Button>
                }
              />
            );
          })}
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
          <Button asChild><Link href="/dashboard">Continue to dashboard →</Link></Button>
        </div>
      </div>
    </>
  );
}

function Connector({ logo, name, desc, connected, lastSync, accounts = [], action, problem, warning }: {
  logo: React.ReactNode; name: string; desc: string; connected: boolean; lastSync?: string; accounts?: string[]; action: React.ReactNode; problem?: string; warning?: string;
}) {
  return (
    <Card
      className="conn"
      style={{ flexWrap: "wrap", ...(connected ? { borderColor: problem ? "var(--neg)" : "var(--pos)", background: problem ? "color-mix(in oklab, var(--neg) 6%, var(--surface))" : CONNECTED_BG } : {}) }}
    >
      {logo}
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b>{name}</b>
          {connected && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: problem ? "var(--neg)" : "var(--pos)", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: problem ? "var(--neg)" : "var(--pos)" }} />{problem ? "Needs attention" : "Connected"}
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
        {problem && <div style={{ fontSize: 13, color: "var(--neg)", marginTop: 2 }}>{problem}</div>}
        {warning && <div style={{ fontSize: 13, color: "var(--warn)", marginTop: 2 }}>{warning}</div>}
      </div>
      {action}
    </Card>
  );
}
