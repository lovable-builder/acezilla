import Link from "next/link";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand/logo";
import { AutoRefresh } from "@/components/seo/auto-refresh";
import { WooPairing } from "@/components/connections/woo-pairing";
import { ago } from "@/lib/format";
import { disconnect } from "../connection-actions";
import { setWorkspaceCurrency } from "../woocommerce-actions";

export const dynamic = "force-dynamic";
const PLUGIN_ZIP = "/downloads/acezilla-for-woocommerce.zip";
const PLUGIN_VERSION = "1.0.2"; // keep in step with plugins/acezilla-for-woocommerce/acezilla-for-woocommerce.php

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <Card style={{ display: "flex", gap: 16, alignItems: "flex-start", ...(done ? { borderColor: "var(--pos)" } : {}) }}>
      <span className="mono" style={{ width: 28, height: 28, borderRadius: 14, display: "grid", placeItems: "center", flexShrink: 0, fontSize: 13, fontWeight: 600, background: done ? "var(--pos)" : "var(--accent-soft)", color: done ? "var(--bg)" : "var(--accent-ink)" }}>{done ? "✓" : n}</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <b>{title}</b>
        {children}
      </div>
    </Card>
  );
}

export default async function WooCommerceSetup({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { notice, error } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const { data: conn } = current ? await supabase.from("connection").select("id,status,last_sync_at,last_error,external_user_id,stats").eq("workspace_id", current.id).eq("platform", "woocommerce").maybeSingle() : { data: null };
  const [{ count }, { data: latest }] = current && conn
    ? await Promise.all([
        supabase.from("order").select("id", { count: "exact", head: true }).eq("workspace_id", current.id).like("external_id", "woo:%"),
        supabase.from("order").select("created_at").eq("workspace_id", current.id).like("external_id", "woo:%").order("created_at", { ascending: false }).limit(1),
      ])
    : [{ count: 0 }, { data: [] }];
  const heard = !!conn?.last_sync_at;
  const stats = (conn?.stats ?? null) as { plugin_version?: string; last_orders_at?: string; skipped_orders?: Record<string, string> } | null;
  const skippedCounts = Object.values(stats?.skipped_orders ?? {}).reduce<Record<string, number>>((a, r) => { a[r] = (a[r] ?? 0) + 1; return a; }, {});
  const skippedTotal = Object.values(skippedCounts).reduce((a, n) => a + n, 0);
  const skippedText = Object.entries(skippedCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(", ");
  const received = (count ?? 0) + skippedTotal;
  const oldPlugin = !!stats?.plugin_version && stats.plugin_version.localeCompare(PLUGIN_VERSION, undefined, { numeric: true }) < 0;
  const storeCurrency = /^Your store sells in ([A-Z]{3})/.exec((conn?.last_error as string | undefined) ?? "")?.[1] ?? null;
  const { data: adAccts } = current && storeCurrency ? await supabase.from("ad_account").select("currency").eq("workspace_id", current.id) : { data: [] };
  const adCurrencies = [...new Set((adAccts ?? []).map((a) => String(a.currency ?? "").toUpperCase()).filter(Boolean))];
  const adMismatch = storeCurrency ? adCurrencies.filter((c) => c !== storeCurrency) : [];

  return (
    <>
      <AutoRefresh active={!heard} />
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <BrandLogo brand="woocommerce" />
        <div>
          <div className="eyebrow"><Link href="/connections" style={{ color: "var(--accent-ink)" }}>Connections</Link> · WooCommerce</div>
          <h1 className="page" style={{ marginTop: 0 }}>Connect your WordPress store</h1>
        </div>
      </div>
      <p className="sub" style={{ margin: 0, maxWidth: 680 }}>You install a small plugin on your store. It sends each order's value, date and marketing source to acezilla so we can measure real return on ad spend. It is read-only: acezilla never changes your store, and customer names, emails and addresses never leave it.</p>

      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}
      {conn ? (
        <Card style={{ borderColor: conn.last_error ? "var(--warn)" : heard ? "var(--pos)" : "var(--line2)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>{conn.external_user_id as string}</b>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: heard ? "var(--pos)" : "var(--warn)", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: heard ? "var(--pos)" : "var(--warn)" }} />{heard ? "Connected" : "Paired, waiting for the first message"}
            </span>
          </div>
          <div className="sub tabnum" style={{ margin: 0, fontSize: 13 }}>
            {heard ? `Last heard from your store ${ago(conn.last_sync_at as string)} · ` : ""}{count ?? 0} order{count === 1 ? "" : "s"} stored{latest?.[0] ? ` · latest order ${ago(latest[0].created_at as string)}` : ""}
          </div>
          <div className="sub tabnum" style={{ margin: 0, fontSize: 13 }}>
            Plugin {stats?.plugin_version ?? "version unknown"} ·{" "}
            {received > 0 ? `${received} order${received === 1 ? "" : "s"} received from your store: ${count ?? 0} counted as sales${skippedText ? `, ${skippedTotal} not counted (${skippedText})` : ""}.` : "no orders received from your store yet."}
          </div>
          {oldPlugin && <div style={{ fontSize: 13, color: "var(--warn)" }}>Your store runs an older plugin ({stats!.plugin_version}). Download {PLUGIN_VERSION} below and replace it.</div>}
          {received === 0 && heard && <div style={{ fontSize: 13, color: "var(--warn)" }}>In WordPress open <b>acezilla</b> and click <b>Send last 90 days of orders</b>. The plugin will tell you how many it sent, or that your store has no recent orders.</div>}
          {conn.last_error && <div style={{ fontSize: 13, color: "var(--warn)" }}>{conn.last_error as string}</div>}
          {storeCurrency && current && (
            <form action={setWorkspaceCurrency} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              <input type="hidden" name="currency" value={storeCurrency} />
              <Button>Switch this workspace to {storeCurrency}</Button>
              <div className="sub" style={{ margin: 0, fontSize: 12 }}>
                Dashboards will show money in {storeCurrency}.{adMismatch.length > 0 ? ` Your connected ad accounts report in ${adMismatch.join(", ")}, so spend and revenue still would not match until they use the same currency.` : adCurrencies.length > 0 ? " Your ad accounts already use it." : ""}
              </div>
            </form>
          )}
          {!heard && <div className="sub" style={{ margin: 0, fontSize: 13 }}>In WordPress open <b>acezilla</b> and click <b>Send test</b>. This page updates by itself.</div>}
          {heard && <div className="sub" style={{ margin: 0, fontSize: 13 }}>To test again, click <b>Send test</b> in <b>acezilla</b>, then refresh this page.</div>}
          <form action={disconnect} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <input type="hidden" name="platform" value="woocommerce" />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="confirm" value="yes" required /> Delete the connection and imported orders</label>
            <Button variant="outline" style={{ color: "var(--neg)" }}>Disconnect</Button>
          </form>
        </Card>
      ) : null}

      <Step n={1} title="Download the plugin" done={!!conn}>
        <div className="sub" style={{ margin: 0, fontSize: 14 }}>Version {PLUGIN_VERSION}. Needs WordPress 6.0+, WooCommerce 7.0+ and a store on https.</div>
        <div><Button asChild><a href={PLUGIN_ZIP} download>Download acezilla-for-woocommerce.zip</a></Button></div>
      </Step>
      <Step n={2} title="Install it in WordPress" done={!!conn}>
        <ol className="sub" style={{ margin: 0, paddingLeft: 18, listStyle: "decimal", fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>In your WordPress admin go to <b>Plugins → Add New Plugin → Upload Plugin</b>.</li>
          <li>Choose the zip you just downloaded, click <b>Install Now</b>, then <b>Activate</b>.</li>
          <li>After activating you land on the plugin's page. You can always find it as <b>acezilla</b> in the WordPress left menu, or via <b>Settings</b> under the plugin on the Plugins page.</li>
        </ol>
      </Step>
      <Step n={3} title="Create a connection code" done={!!conn}>
        <div className="sub" style={{ margin: 0, fontSize: 14 }}>The code links your store to this workspace. It works once and expires after 15 minutes.</div>
        <WooPairing />
      </Step>
      <Card style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <b>Can't see acezilla in WordPress?</b>
        <ul className="sub" style={{ margin: 0, paddingLeft: 18, listStyle: "disc", fontSize: 13, display: "flex", flexDirection: "column", gap: 3 }}>
          <li>Open <b>Plugins → Installed Plugins</b>. "acezilla for WooCommerce" must show <b>Deactivate</b>; if it shows <b>Activate</b>, click it.</li>
          <li>Sign in as an <b>Administrator</b>. Other roles don't see the menu.</li>
          <li>Install and activate <b>WooCommerce</b> first. The plugin needs it to read orders.</li>
          <li>On WordPress.com, uploading plugins needs a Business plan or higher.</li>
          <li>Already installed an older copy? Deactivate and delete it, then upload this version.</li>
        </ul>
      </Card>
      <Step n={4} title="Paste the code and test" done={heard}>
        <ol className="sub" style={{ margin: 0, paddingLeft: 18, listStyle: "decimal", fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>In <b>acezilla</b>, paste the code and click <b>Connect</b>.</li>
          <li>Click <b>Send test</b>. The plugin tells you if acezilla heard it, and this page turns green.</li>
          <li>Click <b>Send last 90 days of orders</b> to import your history. New orders arrive on their own.</li>
        </ol>
      </Step>
    </>
  );
}
