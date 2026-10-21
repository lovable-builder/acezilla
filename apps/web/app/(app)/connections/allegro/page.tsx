import Link from "next/link";
import { ALLEGRO_SCOPE_VERSION } from "@acezilla/connectors";
import { getWorkspaceContext } from "@/lib/workspace";
import { allegroEnv, type AllegroStats } from "@/lib/allegro";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand/logo";
import { ago, int, money } from "@/lib/format";
import { disconnect, syncNow } from "../connection-actions";

export const dynamic = "force-dynamic";
const CAT = { commission: "Commission", ads: "Ads", delivery: "Delivery", fulfillment: "Fulfillment", other: "Other", settlement: "Settlement (not counted)" } as const;

export default async function AllegroPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { notice, error } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const { data: conn } = current ? await supabase.from("connection").select("id,status,last_sync_at,last_error,external_user_id,scopes,stats").eq("workspace_id", current.id).eq("platform", "allegro").maybeSingle() : { data: null };
  const ready = allegroEnv().ready;
  const stats = (conn?.stats ?? null) as AllegroStats | null;
  const cur = stats?.currency ?? current?.currency ?? "PLN";
  const needsReconnect = !!conn && (conn.status === "needs_reauth" || !((conn.scopes as string[] | null) ?? []).includes(`v${ALLEGRO_SCOPE_VERSION}`));
  const { count: orderCount } = current && conn ? await supabase.from("order").select("id", { count: "exact", head: true }).eq("workspace_id", current.id).like("external_id", "allegro:%") : { count: 0 };

  return (
    <>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <BrandLogo brand="allegro" />
        <div>
          <div className="eyebrow"><Link href="/connections" style={{ color: "var(--accent-ink)" }}>Connections</Link> · Allegro</div>
          <h1 className="page" style={{ marginTop: 0 }}>Allegro</h1>
        </div>
      </div>
      <p className="sub" style={{ margin: 0, maxWidth: 680 }}>Reads your orders, your Allegro ad costs and fees, and your offers. It is read-only: acezilla never changes anything in your Allegro account.</p>
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}

      {!conn ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b>Connect your Allegro seller account</b>
          <div className="sub" style={{ margin: 0, fontSize: 14 }}>You sign in on allegro.pl and approve read access. acezilla never sees your Allegro password.</div>
          <div>{ready ? <Button asChild><a href="/api/connect/allegro/start">Connect Allegro</a></Button> : <Button variant="outline" disabled title="Add the Allegro client ID and secret">Not configured</Button>}</div>
        </Card>
      ) : (
        <Card style={{ borderColor: needsReconnect || conn.last_error ? "var(--warn)" : "var(--pos)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>{(conn.external_user_id as string | null) ?? "Allegro seller"}</b>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: needsReconnect ? "var(--warn)" : "var(--pos)", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: needsReconnect ? "var(--warn)" : "var(--pos)" }} />{needsReconnect ? "Reconnect needed" : "Connected"}
            </span>
          </div>
          <div className="sub tabnum" style={{ margin: 0, fontSize: 13 }}>
            {conn.last_sync_at ? `Synced ${ago(conn.last_sync_at as string)} · ` : "First import running… · "}{int(orderCount ?? 0)} orders stored{stats ? ` · last ${stats.days} days` : ""}
          </div>
          {needsReconnect && <div style={{ fontSize: 13, color: "var(--warn)" }}>Allegro needs you to sign in again{conn.status === "needs_reauth" ? " (the login expired)" : " to grant updated permissions"}.</div>}
          {conn.last_error && <div style={{ fontSize: 13, color: "var(--warn)" }}>{conn.last_error as string}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {needsReconnect && <Button asChild><a href="/api/connect/allegro/start">Reconnect</a></Button>}
            <form action={syncNow}><input type="hidden" name="platform" value="allegro" /><Button variant="ghost">Sync now</Button></form>
          </div>
          <form action={disconnect} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="platform" value="allegro" />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="confirm" value="yes" required /> Delete the connection and imported data</label>
            <Button variant="outline" style={{ color: "var(--neg)" }}>Disconnect</Button>
          </form>
        </Card>
      )}

      {stats && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">01</span>Costs in the last {stats.days} days</h2>
          <div className="kpis">
            {(["ads", "commission", "delivery", "fulfillment", "other"] as const).map((k) => (
              <div className="kpi" key={k}><span className="eyebrow">{CAT[k]}</span><span className="tabnum" style={{ fontSize: 22, fontWeight: 600 }}>{money(stats.fees.byCategory[k], cur)}</span></div>
            ))}
          </div>
          <Card style={{ overflowX: "auto", padding: 0 }}>
            <table className="t tabnum" style={{ margin: 0 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Charge type on Allegro</th><th style={{ textAlign: "left" }}>We treat it as</th><th>Entries</th><th>Total</th></tr></thead>
              <tbody>
                {stats.fees.types.map((t) => (
                  <tr key={`${t.category}|${t.name}`}><td style={{ textAlign: "left" }}>{t.name}</td><td style={{ textAlign: "left" }}><span className={`seo-chip seo-chip-${t.category === "settlement" ? "not_measured" : t.category === "ads" ? "good" : "attention"}`}>{CAT[t.category]}</span></td><td>{int(t.count)}</td><td>{money(t.total, cur)}</td></tr>
                ))}
                {stats.fees.types.length === 0 && <tr><td colSpan={4} style={{ textAlign: "left" }}>No charges in this period.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Allegro bills fees including VAT, and order values are what buyers paid, so all Allegro figures here are gross. Settlement lines only repeat fees that have their own entries, so they are never counted. If a charge type is in the wrong group, tell us. Allegro does not provide ad clicks or impressions through its API, so ads are measured by what they cost.</p>
        </section>
      )}
    </>
  );
}
