import "server-only";
import {
  AllegroApiError, buildAllegroDataset, decodeAllegroJwt, loadAllegroFees, loadAllegroOffers, loadAllegroSales, refreshAllegroToken, salesToOrders, summarizeFees, ALLEGRO_ID_PREFIX,
} from "@acezilla/connectors";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { alignCurrency } from "@/lib/currency";
import { ingestDataset } from "@/lib/ingest";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export function allegroEnv() {
  const clientId = process.env.ALLEGRO_CLIENT_ID, clientSecret = process.env.ALLEGRO_CLIENT_SECRET, key = process.env.META_TOKEN_KEY;
  return { clientId, clientSecret, sandbox: process.env.ALLEGRO_SANDBOX === "1", ready: !!(clientId && clientSecret && key && process.env.SUPABASE_SERVICE_ROLE_KEY), stateSecret: `${key ?? ""}:allegro-state` };
}

/**
 * A valid access token for this connection, refreshed when it is about to expire. Allegro rotates the refresh token on
 * every refresh, so the new pair is written only if nobody else already did (compare-and-set on the stored value);
 * the loser of a race simply uses the winner's token.
 */
export async function getAllegroAccessToken(admin: Admin, connectionId: string): Promise<string> {
  const read = async () => {
    const { data } = await admin.from("connection").select("token_enc,token_expires_at").eq("id", connectionId).maybeSingle();
    if (!data?.token_enc) throw new AllegroApiError("Not connected to Allegro", 401, true);
    return { enc: data.token_enc as string, expires: data.token_expires_at as string | null, t: JSON.parse(decryptToken(data.token_enc as string)) as { a: string; r: string } };
  };
  const row = await read();
  if (row.expires && new Date(row.expires).getTime() > Date.now() + 60_000) return row.t.a;
  const { clientId, clientSecret, sandbox } = allegroEnv();
  let fresh;
  try { fresh = await refreshAllegroToken({ clientId: clientId!, clientSecret: clientSecret!, refreshToken: row.t.r, sandbox }); }
  catch (e) {
    // Another request may have rotated the token while ours was refused (the old refresh token is dead the moment it is used).
    for (let i = 0; i < 4; i++) {
      const latest = await read().catch(() => null);
      if (latest && latest.enc !== row.enc) return latest.t.a;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw e;
  }
  const { data: won } = await admin.from("connection").update({
    token_enc: encryptToken(JSON.stringify({ a: fresh.accessToken, r: fresh.refreshToken })), token_expires_at: new Date(Date.now() + fresh.expiresInSec * 1000).toISOString(),
  }).eq("id", connectionId).eq("token_enc", row.enc).select("id");
  if (won?.length) return fresh.accessToken;
  return (await read()).t.a;
}

export interface AllegroStats { syncedAt: string; days: number; orders: number; ordersTruncated: boolean; currency: string; fees: ReturnType<typeof summarizeFees> }

/** Orders (as store sales), ad spend per offer per day, a fee summary and today's offer counters. Read-only. */
export async function syncAllegro(admin: Admin, conn: { id: string; workspace_id: string }, days: number) {
  const token = await getAllegroAccessToken(admin, conn.id);
  const c = { accessToken: token, sandbox: allegroEnv().sandbox };
  const [{ lines, truncated }, fees, offers] = await Promise.all([loadAllegroSales(c, days), loadAllegroFees(c, days), loadAllegroOffers(c)]);
  const orders = salesToOrders(lines);
  const jwt = decodeAllegroJwt(token);
  const currency = lines.find((l) => l.currency)?.currency ?? fees.find((f) => f.currency)?.currency ?? "PLN";
  const warning = await alignCurrency(admin, conn.workspace_id, currency, conn.id);

  const ds = buildAllegroDataset({ sellerId: jwt.userId ?? conn.id.slice(0, 8), sellerName: jwt.userName ?? "", currency, fees, offers, orders });
  const r = await ingestDataset(admin, conn.workspace_id, "allegro", ds);

  // Orders cancelled or changed since the last sync no longer qualify: drop them from the window we just re-read.
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const keep = new Set(orders.map((o) => o.externalId));
  const { data: stored } = await admin.from("order").select("external_id").eq("workspace_id", conn.workspace_id).like("external_id", `${ALLEGRO_ID_PREFIX}%`).gte("created_at", since);
  const stale = (stored ?? []).map((s) => s.external_id as string).filter((id) => !keep.has(id));
  for (let i = 0; i < stale.length; i += 200) await admin.from("order").delete().eq("workspace_id", conn.workspace_id).in("external_id", stale.slice(i, i + 200));

  const day = new Date().toISOString().slice(0, 10);
  if (offers.length) await admin.from("offer_stats_snapshots").upsert(offers.map((o) => ({ workspace_id: conn.workspace_id, platform: "allegro", offer_id: o.offerId, day, name: o.name.slice(0, 200), price: o.price, visits: o.visits, watchers: o.watchers })), { onConflict: "workspace_id,platform,offer_id,day" });

  const stats: AllegroStats = { syncedAt: new Date().toISOString(), days, orders: orders.length, ordersTruncated: truncated, currency, fees: summarizeFees(fees) };
  await admin.from("connection").update({
    status: "active", last_error: warning ?? (truncated ? "Allegro has more orders than we read in one sync; the newest are included." : null),
    ...(jwt.userName ? { external_user_id: jwt.userName } : {}), stats,
  }).eq("id", conn.id);
  return { campaigns: r.campaigns, rows: orders.length + r.insights };
}
