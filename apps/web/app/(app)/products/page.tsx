import Link from "next/link";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PeriodBar } from "@/components/dash/period-bar";
import { int, money } from "@/lib/format";
import { parsePeriod, todayIso, windowStart } from "@/lib/period";
import { loadProducts } from "@/lib/data";

export const metadata = { title: "Products · acezilla" };
export const dynamic = "force-dynamic";
const STORE: Record<string, string> = { woocommerce: "WooCommerce", allegro: "Allegro" };

export default async function Products({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; store?: string }> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>No workspace found for this account.</Card>;
  const cur = current.currency;
  const end = period.endDate ?? todayIso();
  const start = windowStart(end, period.windowDays);
  const { data: conns } = await supabase.from("connection").select("platform,stats").eq("workspace_id", current.id).in("platform", ["woocommerce", "allegro", "shopify"]);
  const connected = (conns ?? []).map((c) => c.platform as string);
  const { rows, wooCatalogSize } = connected.length ? await loadProducts(supabase, current.id, start, end) : { rows: [], wooCatalogSize: 0 };
  const store = connected.includes(sp.store ?? "") ? sp.store! : null;
  const shown = store ? rows.filter((r) => r.channel === store) : rows;
  const qs = period.custom ? `from=${period.custom.from}&to=${period.custom.to}` : `days=${period.days ?? 30}`;
  const wooMissing = connected.includes("woocommerce") && wooCatalogSize === 0;
  const count = (ch: string) => rows.filter((r) => r.channel === ch);

  return (
    <>
      <PeriodBar path="/products" active={period.days} custom={period.custom} />
      <div>
        <div className="eyebrow">Analyze · Products</div>
        <h1 className="page">Your products and listings</h1>
        <p className="sub">Everything you list in your connected stores, including products that have not sold. Sales are for the period above.</p>
      </div>

      {connected.length === 0 ? (
        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}>Connect a store to see its products here.</span>
          <Button asChild><Link href="/connections">Go to Connections</Link></Button>
        </Card>
      ) : (
        <>
          <div className="kpis">
            {connected.map((ch) => {
              const list = count(ch), sold = list.filter((r) => r.units > 0).length;
              return (
                <div className="kpi" key={ch}>
                  <span className="eyebrow">{STORE[ch] ?? ch}</span>
                  <span className="tabnum" style={{ fontSize: 26, fontWeight: 600 }}>{int(list.filter((r) => r.listed).length)}</span>
                  <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>listed · {sold} sold · {list.filter((r) => r.listed).length - list.filter((r) => r.listed && r.units > 0).length} with no sales</span>
                </div>
              );
            })}
          </div>
          {wooMissing && (
            <Card style={{ borderColor: "var(--warn)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 240 }}><b>WooCommerce is connected, but its product list has not arrived.</b> Update the acezilla plugin to version 1.1.0, then open your WordPress admin once. The list is sent automatically, and every product shows here, including ones with no sales.</span>
              <Button asChild variant="outline"><Link href="/connections/woocommerce">Get the plugin</Link></Button>
            </Card>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="eyebrow">Store</span>
            <Link href={`/products?${qs}`} className={`nav-item${store === null ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 12px" }}>All</Link>
            {connected.map((ch) => <Link key={ch} href={`/products?${qs}&store=${ch}`} className={`nav-item${store === ch ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 12px" }}>{STORE[ch] ?? ch}</Link>)}
          </div>
          <Card style={{ overflowX: "auto" }}>
            <table className="t tabnum">
              <thead><tr><th style={{ textAlign: "left" }}>Product</th><th style={{ textAlign: "left" }}>Store</th><th style={{ textAlign: "left" }}>Status</th><th>Price</th><th>Units sold</th><th>Revenue</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.channel}|${r.productId}`} style={{ opacity: r.units === 0 ? 0.7 : 1 }}>
                    <td style={{ textAlign: "left", maxWidth: 340, overflowWrap: "anywhere" }}>{r.name}{!r.listed && <span className="seo-chip seo-chip-attention" style={{ marginLeft: 8 }}>No longer listed</span>}</td>
                    <td style={{ textAlign: "left" }}>{STORE[r.channel] ?? r.channel}</td>
                    <td style={{ textAlign: "left", color: "var(--ink3)" }}>{[r.status === "publish" ? "Published" : r.status === "active" ? "Active" : r.status, r.stock === "outofstock" ? "out of stock" : null].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{r.price === null ? "—" : money(r.price, cur)}</td>
                    <td>{int(r.units)}</td>
                    <td style={{ fontWeight: r.revenue > 0 ? 600 : 400, color: r.revenue > 0 ? "var(--ink)" : "var(--ink3)" }}>{r.revenue > 0 ? money(r.revenue, cur) : "No sales"}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={6} style={{ textAlign: "left" }}>Nothing to show yet.</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Revenue is before tax. Allegro prices include VAT, so the rate set on the Attribution page is taken off. WooCommerce variations are counted under their main product.</p>
        </>
      )}
    </>
  );
}
