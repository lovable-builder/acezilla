import Link from "next/link";
import { loadDemoData, importCsv, clearDemoData } from "@/app/actions";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ago } from "@/lib/format";

const STEPS = ["Workspace", "Connect accounts", "Goals & KPIs", "Historical import"];
const PLATFORMS = [
  { id: "tiktok", name: "TikTok Ads", desc: "Campaigns, spend and creative metrics", letter: "T", color: "var(--tt)" },
  { id: "meta", name: "Meta Ads", desc: "Facebook and Instagram campaigns", letter: "M", color: "var(--me)" },
  { id: "google", name: "Google Ads", desc: "Search, Shopping and Performance Max", letter: "G", color: "var(--go)" },
  { id: "shopify", name: "Shopify", desc: "Orders and customers for modeled ROAS", letter: "S", color: "var(--pos)" },
  { id: "ga4", name: "GA4", desc: "Sessions and on-site conversions", letter: "A", color: "var(--warn)" },
];

export default async function Connections({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const { data: conns } = current
    ? await supabase.from("connection").select("platform,last_sync_at").eq("workspace_id", current.id)
    : { data: [] };
  const mock = conns?.find((c) => c.platform === "mock");
  const csv = conns?.find((c) => c.platform === "csv");

  return (
    <>
      <div>
        <div className="eyebrow">Step 2 of 4 · Connect accounts</div>
        <h1 className="page">Bring in your ad data</h1>
        <p className="sub">Live platform connections are waiting on API approvals. Start now with demo data or your own CSV export.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
        {STEPS.map((s, i) => <div key={s} title={s} style={{ height: 3, borderRadius: 2, background: i < 2 ? "var(--accent)" : "var(--line2)" }} />)}
      </div>
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card className="conn">
            <Tile letter="D" color="var(--accent)" />
            <div style={{ flex: 1 }}>
              <b>Demo data</b>
              <div className="sub" style={{ margin: 0, fontSize: 13 }}>60 days across TikTok, Meta and Google, plus store orders.{mock ? ` Loaded ${ago(mock.last_sync_at as string)}.` : ""}</div>
            </div>
            <form action={loadDemoData}><Button variant={mock ? "outline" : "solid"}>{mock ? "Reload" : "Load demo data"}</Button></form>
            {mock && <form action={clearDemoData}><Button variant="ghost">Remove</Button></form>}
          </Card>
          <Card className="conn" style={{ flexWrap: "wrap" }}>
            <Tile letter="C" color="var(--ink2)" />
            <div style={{ flex: 1, minWidth: 180 }}>
              <b>CSV import</b>
              <div className="sub" style={{ margin: 0, fontSize: 13 }}>
                Columns: <span className="mono">date, platform, campaign, spend</span> (+ impressions, clicks, conversions, revenue).{csv ? ` Last import ${ago(csv.last_sync_at as string)}.` : ""}
              </div>
            </div>
            <form action={importCsv} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="file" name="file" accept=".csv,text/csv" required className="text-xs" style={{ maxWidth: 190 }} />
              <Button variant="outline">Import</Button>
            </form>
          </Card>
          {PLATFORMS.map((p) => (
            <Card key={p.id} className="conn" style={{ opacity: 0.75 }}>
              <Tile letter={p.letter} color={p.color} />
              <div style={{ flex: 1 }}>
                <b>{p.name}</b>
                <div className="sub" style={{ margin: 0, fontSize: 13 }}>{p.desc}</div>
              </div>
              <Button variant="outline" disabled title="Needs platform API approval">Coming soon</Button>
            </Card>
          ))}
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

function Tile({ letter, color }: { letter: string; color: string }) {
  return <div style={{ width: 40, height: 40, borderRadius: 10, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>{letter}</div>;
}
