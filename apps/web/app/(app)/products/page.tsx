import Link from "next/link";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Thumb } from "@/components/app/thumb";
import { MerchantPanel } from "@/components/products/merchant-panel";
import { PeriodBar } from "@/components/dash/period-bar";
import { int, money } from "@/lib/format";
import { parsePeriod, todayIso, windowStart } from "@/lib/period";
import { loadAdRows, loadCampaignLinks, loadProducts } from "@/lib/data";
import { adSpendByProduct } from "@/lib/campaign-products";
import { shiftDate, stockLevel, type StockLevel } from "@acezilla/models";

export const metadata = { title: "Products · acezilla" };
export const dynamic = "force-dynamic";
const STORE: Record<string, string> = { woocommerce: "WooCommerce", allegro: "Allegro" };

export default async function Products({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; store?: string; f?: string }> }) {
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

  // Which products have an ad running: campaigns are matched to products by a person's link, or a strict name match.
  const adRows = connected.length ? await loadAdRows(supabase, current.id) : [];
  const links = connected.length ? await loadCampaignLinks(supabase, current.id) : new Map<string, { channel: string; productId: string }>();
  const adSpend = adSpendByProduct(adRows, rows, links, shiftDate(end, -29), end);
  // Only Google Ads campaigns use the Merchant Center feed, so only their spend can be wasted on a blocked product.
  const googleSpend = adSpendByProduct(adRows.filter((r) => r.platform === "google"), rows, links, shiftDate(end, -29), end);
  const googleLines = rows.filter((r) => r.listed && (googleSpend.get(`${r.channel}|${r.productId}`) ?? 0) > 0)
    .map((r) => ({ key: `${r.channel}|${r.productId}`, name: r.name, sku: r.sku, productId: r.productId, spend: googleSpend.get(`${r.channel}|${r.productId}`) ?? 0 }));
  const level = (r: (typeof rows)[number]): StockLevel => stockLevel({ qty: r.stockQty, status: r.stock });
  const spendOf = (r: (typeof rows)[number]) => adSpend.get(`${r.channel}|${r.productId}`) ?? 0;
  const FILTERS = [["all", "All"], ["best", "Best sellers"], ["noads", "No ads"], ["low", "Low stock"], ["out", "Out of stock"]] as const;
  const f = FILTERS.some(([k]) => k === sp.f) ? sp.f! : "all";
  const base = store ? rows.filter((r) => r.channel === store) : rows;
  const shown = base.filter((r) => f === "all" || (f === "best" && r.units > 0) || (f === "noads" && r.listed && level(r) !== "out" && spendOf(r) <= 0) || (f === "low" && r.listed && level(r) === "low") || (f === "out" && r.listed && level(r) === "out"));
  const lowCount = rows.filter((r) => r.listed && level(r) === "low").length, outCount = rows.filter((r) => r.listed && level(r) === "out").length;
  const qsBase = period.custom ? `from=${period.custom.from}&to=${period.custom.to}` : `days=${period.days ?? 30}`;
  const qs = `${qsBase}${store ? `&store=${store}` : ""}`;
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

      <MerchantPanel supabase={supabase} workspaceId={current.id} today={todayIso()} spend={googleLines} currency={cur} />

      {connected.length === 0 ? (
        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}>Connect a store to see its products here.</span>
          <Button asChild><Link href="/connections">Go to Connections</Link></Button>
        </Card>
      ) : (
        <>
          <div className="kpis">
            {connected.map((ch) => {
              const list = count(ch), listedRows = list.filter((r) => r.listed), sold = listedRows.filter((r) => r.units > 0).length, ended = list.filter((r) => !r.listed && r.units > 0).length;
              return (
                <div className="kpi" key={ch}>
                  <span className="eyebrow">{STORE[ch] ?? ch}</span>
                  <span className="tabnum" style={{ fontSize: 26, fontWeight: 600 }}>{int(listedRows.length)}</span>
                  <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>listed · {sold} sold · {listedRows.length - sold} with no sales{ended > 0 ? ` · ${ended} sold but no longer active` : ""}</span>
                </div>
              );
            })}
          </div>
          {wooMissing && (
            <Card style={{ borderColor: "var(--warn)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 240 }}><b>WooCommerce is connected, but its product list has not arrived.</b> Update the acezilla plugin to its latest version (1.4.0 or newer), then open your WordPress admin once. The list is sent automatically, and every product shows here, including ones with no sales.</span>
              <Button asChild variant="outline"><Link href="/connections/woocommerce">Get the plugin</Link></Button>
            </Card>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="eyebrow">Store</span>
            <Link href={`/products?${qsBase}${f !== "all" ? `&f=${f}` : ""}`} className={`nav-item${store === null ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 12px" }}>All</Link>
            {connected.map((ch) => <Link key={ch} href={`/products?${qsBase}&store=${ch}${f !== "all" ? `&f=${f}` : ""}`} className={`nav-item${store === ch ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 12px" }}>{STORE[ch] ?? ch}</Link>)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="eyebrow">Show</span>
            {FILTERS.map(([k, label]) => <Link key={k} href={`/products?${qs}${k === "all" ? "" : `&f=${k}`}`} className={`nav-item${f === k ? " active" : ""}`} style={{ width: "fit-content", padding: "6px 12px" }}>{label}{k === "low" && lowCount > 0 ? ` · ${lowCount}` : k === "out" && outCount > 0 ? ` · ${outCount}` : ""}</Link>)}
          </div>
          <Card style={{ overflowX: "auto" }}>
            <table className="t tabnum">
              <thead><tr><th style={{ textAlign: "left" }}>Product</th><th style={{ textAlign: "left" }}>Store</th><th style={{ textAlign: "left" }}>Status</th><th style={{ textAlign: "left" }}>Stock</th><th>Price</th><th>Ad spend (30 days)</th><th>Units sold</th><th>Revenue</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.channel}|${r.productId}`} style={{ opacity: r.units === 0 ? 0.7 : 1 }}>
                    <td style={{ textAlign: "left", maxWidth: 380, overflowWrap: "anywhere" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Thumb src={r.imageUrl} name={r.name} />{r.name}</span>{!r.listed && <span className="seo-chip seo-chip-attention" style={{ marginLeft: 8 }} title="It sold in this period but is not among your active listings now. It may have ended or sold out.">{r.channel === "allegro" ? "Not active on Allegro" : "No longer listed"}</span>}</td>
                    <td style={{ textAlign: "left" }}>{STORE[r.channel] ?? r.channel}</td>
                    <td style={{ textAlign: "left", color: "var(--ink3)" }}>{[r.status === "publish" ? "Published" : r.status === "active" ? "Active" : r.status, r.stock === "outofstock" ? "out of stock" : null].filter(Boolean).join(" · ") || "—"}</td>
                    <td style={{ textAlign: "left" }}>{(() => { const l = level(r); const c = ({ out: ["missing", "Out"], low: ["attention", "Low"], ok: ["good", "In stock"], unknown: null } as const)[l]; return c ? <span className={`seo-chip seo-chip-${c[0]}`} title={r.stockQty !== null ? `${r.stockQty} in stock` : undefined}>{c[1]}{r.stockQty !== null ? ` · ${r.stockQty}` : ""}</span> : <span className="sub" style={{ fontSize: 12 }}>—</span>; })()}</td>
                    <td>{r.price === null ? "—" : money(r.price, cur)}</td>
                    <td style={{ color: spendOf(r) > 0 ? "var(--ink)" : "var(--ink3)" }}>{r.channel === "allegro" ? "—" : spendOf(r) > 0 ? money(spendOf(r), cur) : "No ad"}</td>
                    <td>{int(r.units)}</td>
                    <td style={{ fontWeight: r.revenue > 0 ? 600 : 400, color: r.revenue > 0 ? "var(--ink)" : "var(--ink3)" }}>{r.revenue > 0 ? money(r.revenue, cur) : "No sales"}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={8} style={{ textAlign: "left" }}>{f === "all" ? "Nothing to show yet." : "Nothing matches this filter."}</td></tr>}
              </tbody>
            </table>
          </Card>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>Revenue is before tax. Allegro prices include VAT, so the rate set on the Attribution page is taken off. WooCommerce variations are counted under their main product. Ad spend is for campaigns linked to the product, by you or by a close name match; Allegro ads are not split by product here. Stock needs WooCommerce to manage it (or Allegro to report it).</p>
        </>
      )}
    </>
  );
}
