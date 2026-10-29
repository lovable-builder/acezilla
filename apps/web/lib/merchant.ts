import "server-only";
import { fetchMerchantPerformance, fetchMerchantPrices, fetchMerchantProducts, MerchantApiError, refreshGoogleAccessToken } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const CHUNK = 500;

/** Short-lived access token from the stored (encrypted) refresh token of the Merchant Center connection. */
export async function merchantAccessToken(tokenEnc: string) {
  return refreshGoogleAccessToken({
    clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, refreshToken: decryptToken(tokenEnc),
  });
}

async function insertChunks(admin: Admin, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/** Reads product statuses and daily traffic for the accounts already chosen on this connection. Replaces what was stored, so re-running is safe. Read-only at Google. */
export async function pullMerchant(admin: Admin, conn: { id: string; workspace_id: string }, accessToken: string, days: number) {
  const { data: accounts } = await admin.from("merchant_account").select("id,external_id").eq("connection_id", conn.id);
  const since = iso(new Date(Date.now() - days * 86400000)), until = iso(new Date());
  let products = 0, rows = 0;
  for (const a of accounts ?? []) {
    const o = { accessToken };
    const list = await fetchMerchantProducts(o, a.external_id as string);
    const perf = await fetchMerchantPerformance(o, a.external_id as string, since, until);
    await admin.from("merchant_product").delete().eq("account_id", a.id);
    await insertChunks(admin, "merchant_product", list.map((p) => ({ workspace_id: conn.workspace_id, account_id: a.id, product_id: p.productId, offer_id: p.offerId, title: p.title, status: p.status, click_potential: p.clickPotential, issues: p.issues })));
    await admin.from("merchant_daily").delete().eq("account_id", a.id).gte("date", since).lte("date", until);
    await insertChunks(admin, "merchant_daily", perf.rows.map((r) => ({ workspace_id: conn.workspace_id, account_id: a.id, date: r.date, source: r.source, clicks: r.clicks, impressions: r.impressions, conversions: r.conversions, conversion_value: r.conversionValue })));
    if (perf.currency) await admin.from("merchant_account").update({ currency: perf.currency }).eq("id", a.id);
    // Google only fills the price report for accounts that qualify. Not having it must never fail the sync.
    await admin.from("merchant_price").delete().eq("account_id", a.id);
    try {
      const prices = await fetchMerchantPrices(o, a.external_id as string);
      await insertChunks(admin, "merchant_price", prices.map((p) => ({ workspace_id: conn.workspace_id, account_id: a.id, product_id: p.productId, offer_id: p.offerId, title: p.title, brand: p.brand, price: p.price, benchmark: p.benchmark, currency: p.currency })));
    } catch (e) {
      if (!(e instanceof MerchantApiError) || (e.status && e.status >= 500)) throw e;
    }
    products += list.length; rows += perf.rows.length;
  }
  return { accounts: accounts?.length ?? 0, products, rows };
}
