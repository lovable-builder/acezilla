import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approvalRate, feedSpendReport, issueLabel, issueSummary, needsFix, priceReport, shiftDate, shoppingTotals, statusCounts, type FeedProduct, type PriceRow, type ShoppingDay, type SpendLine } from "@acezilla/models";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/app/term";
import { ago, int, money } from "@/lib/format";

const PAGE = 1000;

async function all<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await read(from, from + PAGE - 1);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

const CHIP = { eligible: ["good", "Shown"], limited: ["attention", "Limited"], pending: ["attention", "Pending"], disapproved: ["missing", "Blocked"], unknown: ["attention", "Unknown"] } as const;
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`);

/** Which products Google Shopping shows or blocks and why, plus 30 days of clicks from free listings and ads. Read from Merchant Center. */
export async function MerchantPanel({ supabase, workspaceId, today, spend, currency }: { supabase: SupabaseClient; workspaceId: string; today: string; /** Google Ads spend per store product over the last 30 days. */ spend: SpendLine[]; currency: string }) {
  const { data: conn } = await supabase.from("connection").select("status,last_sync_at,last_error").eq("workspace_id", workspaceId).eq("platform", "merchant").maybeSingle();
  if (!conn) {
    return (
      <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 240 }}><b>See which products Google Shopping blocks.</b> <span className="sub" style={{ fontSize: 14 }}>Connect Google Merchant Center to find products Google refuses to show, with the reason, and to see clicks from free listings and ads.</span></span>
        <Button asChild variant="outline"><Link href="/connections">Connect Merchant Center</Link></Button>
      </Card>
    );
  }
  const { data: accounts } = await supabase.from("merchant_account").select("id,name").eq("workspace_id", workspaceId);
  if (!accounts?.length) {
    return (
      <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 240 }}>Google Merchant Center is connected. Choose the account to read.</span>
        <Button asChild><Link href="/connections/merchant">Choose accounts</Link></Button>
      </Card>
    );
  }
  const from = shiftDate(today, -29);
  const [rows, daily, priceRows] = await Promise.all([
    all<{ product_id: string; offer_id: string; title: string; status: string; issues: unknown }>((a, b) =>
      supabase.from("merchant_product").select("product_id,offer_id,title,status,issues").eq("workspace_id", workspaceId).order("product_id").range(a, b)),
    all<{ date: string; source: string; clicks: number; impressions: number; conversions: number; conversion_value: number }>((a, b) =>
      supabase.from("merchant_daily").select("date,source,clicks,impressions,conversions,conversion_value").eq("workspace_id", workspaceId).gte("date", from).order("date").range(a, b)),
    all<{ product_id: string; offer_id: string; title: string; price: number; benchmark: number; currency: string }>((a, b) =>
      supabase.from("merchant_price").select("product_id,offer_id,title,price,benchmark,currency").eq("workspace_id", workspaceId).order("product_id").range(a, b)),
  ]);
  const prices = priceReport(priceRows.map((r): PriceRow => ({ productId: r.product_id, offerId: r.offer_id, title: r.title || r.offer_id || r.product_id, price: Number(r.price), benchmark: Number(r.benchmark), currency: r.currency })));
  const products: FeedProduct[] = rows.map((r) => ({
    productId: r.product_id, offerId: r.offer_id, title: r.title || r.offer_id || r.product_id, status: (r.status in CHIP ? r.status : "unknown") as FeedProduct["status"],
    issues: Array.isArray(r.issues) ? (r.issues as FeedProduct["issues"]) : [],
  }));
  const days: ShoppingDay[] = daily.map((d) => ({ date: d.date, source: d.source === "ads" ? "ads" : "free", clicks: Number(d.clicks), impressions: Number(d.impressions), conversions: Number(d.conversions), conversionValue: Number(d.conversion_value) }));
  const counts = statusCounts(products), rate = approvalRate(counts);
  const free = shoppingTotals(days, "free", from, today), ads = shoppingTotals(days, "ads", from, today);
  const fix = needsFix(products), issues = issueSummary(products).slice(0, 8);
  const waste = feedSpendReport(spend, products);
  const flagged = [...waste.blocked, ...waste.limited];
  const broken = conn.status === "error" || conn.status === "needs_reauth";

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h2" style={{ margin: 0 }}>Google Shopping</h2>
        <span className="eyebrow">{accounts.map((a) => a.name as string).join(", ")}{conn.last_sync_at ? ` · read ${ago(conn.last_sync_at as string)}` : ""}</span>
        <Button asChild variant="ghost" size="sm"><Link href="/connections/merchant" style={{ marginLeft: "auto" }}>Accounts</Link></Button>
      </div>
      {broken && <div style={{ color: "var(--neg)", fontSize: 13 }}>{conn.status === "needs_reauth" ? "Login expired. Reconnect on the Connections page." : `Last sync failed: ${conn.last_error ?? "unknown error"}`}</div>}
      {counts.total === 0 ? (
        <p className="sub" style={{ margin: 0 }}>No products have been read yet. Press Sync now on the Connections page.</p>
      ) : (
        <>
          <div className="kpis">
            {([
              ["Shown in Shopping", int(counts.eligible), `${pct(rate)} approved of those decided`, "var(--pos)"],
              ["Limited", int(counts.limited), "shown, but with reduced reach", counts.limited ? "var(--warn)" : "var(--ink)"],
              ["Pending review", int(counts.pending), "Google has not decided yet", "var(--ink)"],
              ["Blocked", int(counts.disapproved), "not shown at all", counts.disapproved ? "var(--neg)" : "var(--ink)"],
              ["Free listing clicks", int(free.clicks), `last 30 days · ${int(free.impressions)} views · ${pct(free.ctr)} clicked`, "var(--ink)"],
              ["Shopping ad clicks", int(ads.clicks), `last 30 days · ${int(ads.impressions)} views`, "var(--ink)"],
            ] as [string, string, string, string][]).map(([label, value, sub, color]) => (
              <div className="kpi" key={label}>
                <span className="eyebrow"><Term>{label}</Term></span>
                <span className="tabnum" style={{ fontSize: 24, fontWeight: 600, color }}>{value}</span>
                <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{sub}</span>
              </div>
            ))}
          </div>
          {flagged.length > 0 ? (
            <div style={{ border: `1px solid ${waste.blocked.length ? "var(--neg)" : "var(--warn)"}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <b style={{ fontWeight: 600 }}>
                {waste.blocked.length > 0
                  ? <>You spent <span className="tabnum" style={{ color: "var(--neg)" }}>{money(waste.blockedSpend, currency)}</span> in 30 days on Google ads for {waste.blocked.length} {waste.blocked.length === 1 ? "product" : "products"} that Google Shopping blocks.</>
                  : <>You spent <span className="tabnum" style={{ color: "var(--warn)" }}>{money(waste.limitedSpend, currency)}</span> in 30 days on Google ads for products Google shows with reduced reach.</>}
              </b>
              <div style={{ overflowX: "auto" }}>
                <table className="t">
                  <thead><tr><th style={{ textAlign: "left" }}>Product</th><th style={{ textAlign: "left" }}>Google says</th><th style={{ textAlign: "left" }}>Why</th><th>Google ad spend (30 days)</th></tr></thead>
                  <tbody>
                    {flagged.map((l) => {
                      const c = CHIP[l.match!.status], codes = [...new Set(l.match!.issues.map((i) => i.code))];
                      return (
                        <tr key={l.key}>
                          <td style={{ textAlign: "left", maxWidth: 320, overflowWrap: "anywhere", whiteSpace: "normal" }}>{l.name}</td>
                          <td style={{ textAlign: "left" }}><span className={`seo-chip seo-chip-${c[0]}`}>{c[1]}</span></td>
                          <td style={{ textAlign: "left", whiteSpace: "normal" }}>{codes.length ? codes.map(issueLabel).join(", ") : <span className="sub">Google gave no reason</span>}</td>
                          <td className="tabnum">{money(l.spend, currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <span className="sub" style={{ fontSize: 12 }}>Only Google Ads campaigns that use your product feed (Shopping and Performance Max) are held back by this. If one of these campaigns is a search campaign, the spend may be fine. Fix the reasons above, or pause the campaign until Google approves the product.</span>
            </div>
          ) : spend.length > 0 ? (
            <p className="sub" style={{ margin: 0, fontSize: 13 }}>None of the products you advertise on Google is blocked or limited{waste.unmatched.length ? `, but ${waste.unmatched.length} could not be found in Merchant Center` : ""}.</p>
          ) : null}
          {waste.unmatched.length > 0 && flagged.length > 0 && (
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>{waste.unmatched.length} advertised {waste.unmatched.length === 1 ? "product was" : "products were"} not found in Merchant Center ({money(waste.unmatchedSpend, currency)}). Either they are missing from your feed, or the feed uses a different ID than your store&apos;s SKU.</p>
          )}
          {fix.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>No product is blocked or limited. Nothing to fix.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="t">
                <thead><tr><th style={{ textAlign: "left" }}>Fix these first</th><th style={{ textAlign: "left" }}>Status</th><th style={{ textAlign: "left" }}>What Google says is wrong</th></tr></thead>
                <tbody>
                  {fix.slice(0, 12).map((p) => {
                    const c = CHIP[p.status];
                    const codes = [...new Set(p.issues.map((i) => i.code))];
                    return (
                      <tr key={p.productId}>
                        <td style={{ textAlign: "left", maxWidth: 360, overflowWrap: "anywhere", whiteSpace: "normal" }}>{p.title}</td>
                        <td style={{ textAlign: "left" }}><span className={`seo-chip seo-chip-${c[0]}`}>{c[1]}</span></td>
                        <td style={{ textAlign: "left", whiteSpace: "normal" }}>{codes.length ? codes.map(issueLabel).join(", ") : <span className="sub">Google gave no reason</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {fix.length > 12 && <p className="sub" style={{ fontSize: 12, margin: "8px 0 0" }}>{fix.length - 12} more not shown. Fix the common problems below first.</p>}
            </div>
          )}
          {prices.rows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b style={{ fontWeight: 600 }}>
                {prices.above > 0
                  ? <><span className="tabnum">{int(prices.above)}</span> of {int(prices.rows.length)} products cost more than <Term>Google&apos;s market price</Term>.</>
                  : <>No product costs more than <Term>Google&apos;s market price</Term>.</>}
                <span className="sub tabnum" style={{ fontWeight: 400, fontSize: 13 }}> {int(prices.near)} about the same · {int(prices.below)} cheaper</span>
              </b>
              {prices.overpriced.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table className="t">
                    <thead><tr><th style={{ textAlign: "left" }}>Priced above the market</th><th>Your price</th><th>Market price</th><th>Above by</th></tr></thead>
                    <tbody>
                      {prices.overpriced.slice(0, 10).map((r) => (
                        <tr key={r.productId}>
                          <td style={{ textAlign: "left", maxWidth: 360, overflowWrap: "anywhere", whiteSpace: "normal" }}>{r.title}</td>
                          <td className="tabnum">{money(r.price, r.currency || currency)}</td>
                          <td className="tabnum">{money(r.benchmark, r.currency || currency)}</td>
                          <td className="tabnum" style={{ color: "var(--neg)" }}>+{(r.gap * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <span className="sub" style={{ fontSize: 12 }}>Shoppers compare prices in Google Shopping, so a product well above the market tends to get fewer clicks and sales. A higher price can still be right if your product is better or your delivery is faster. This is a prompt to look, not an instruction to cut the price.</span>
            </div>
          ) : (
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>No market price comparison yet. Google only provides it for accounts with enough Shopping traffic, so it may stay empty for a small shop.</p>
          )}
          {issues.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="t">
                <thead><tr><th style={{ textAlign: "left" }}>Most common problems</th><th style={{ textAlign: "left" }}>Effect</th><th>Products</th></tr></thead>
                <tbody>
                  {issues.map((i) => (
                    <tr key={i.code}>
                      <td style={{ textAlign: "left" }}>{issueLabel(i.code)}</td>
                      <td style={{ textAlign: "left", color: i.severity === "disapproved" ? "var(--neg)" : "var(--ink2)" }}>{i.severity === "disapproved" ? "Blocks the product" : i.severity === "demoted" ? "Lowers reach" : i.severity || "—"}</td>
                      <td className="tabnum">{int(i.products)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="sub" style={{ fontSize: 12, margin: 0 }}>Straight from Google Merchant Center, read-only. Clicks are Google&apos;s own count of Shopping clicks, not orders; your store&apos;s orders remain the source of truth. Fix problems in Merchant Center or in your store&apos;s feed, then press Sync now.</p>
    </Card>
  );
}
