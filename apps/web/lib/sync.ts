import "server-only";
import {
  fetchGoogleDataset, fetchMetaDataset, fetchTiktokDataset, GoogleApiError, listGoogleAdAccounts, listMetaAdAccounts, listTiktokAdvertisers, MetaApiError, TiktokApiError, revokeTiktokToken,
  refreshGoogleAccessToken, AllegroApiError, Ga4ApiError, MerchantApiError, SearchConsoleApiError,
} from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import { alertIfNeeded } from "@/lib/alerts";
import { ingestDataset } from "@/lib/ingest";
import { syncAllegro } from "@/lib/allegro";
import { tiktokOptions } from "@/lib/tiktok";
import { ga4AccessToken, pullGa4 } from "@/lib/ga4";
import { merchantAccessToken, pullMerchant } from "@/lib/merchant";
import { pullSearchConsole, searchConsoleAccessToken } from "@/lib/searchconsole";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export interface ConnRow { id: string; workspace_id: string; platform: string; token_enc: string | null }
export type SyncResult = { ok: true; campaigns: number; rows: number } | { ok: false; error: string; needsReauth: boolean };

/** Re-pulled on every sync: attribution windows mean recent days keep changing for up to ~4 weeks. */
export const SYNC_DAYS = 35;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const PREFIX: Record<string, string> = { meta: "meta-acct-", google: "google-acct-", tiktok: "tiktok-acct-" };

/** Pulls recent data for the accounts the user selected on this connection, and records success or failure. */
export async function syncConnection(admin: Admin, conn: ConnRow, days = SYNC_DAYS): Promise<SyncResult> {
  try {
    if (!conn.token_enc) throw new Error("Not connected");
    if (conn.platform === "allegro") { const a = await syncAllegro(admin, conn, days); return { ok: true, campaigns: a.campaigns, rows: a.rows }; }
    if (conn.platform === "ga4") {
      const g = await pullGa4(admin, conn, await ga4AccessToken(admin, conn.token_enc), days);
      await admin.from("connection").update({ status: "active", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", conn.id);
      return { ok: true, campaigns: g.properties, rows: g.rows };
    }
    if (conn.platform === "merchant") {
      const m = await pullMerchant(admin, conn, await merchantAccessToken(conn.token_enc), Math.max(days, 90));
      await admin.from("connection").update({ status: "active", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", conn.id);
      return { ok: true, campaigns: m.accounts, rows: m.products + m.rows };
    }
    if (conn.platform === "searchconsole") {
      const w = await pullSearchConsole(admin, conn, await searchConsoleAccessToken(conn.token_enc));
      await admin.from("connection").update({ status: "active", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", conn.id);
      return { ok: true, campaigns: w.sites, rows: w.rows };
    }
    const prefix = PREFIX[conn.platform];
    if (!prefix) throw new Error(`Unsupported platform ${conn.platform}`);
    const { data: rows } = await admin.from("ad_account").select("external_id").eq("connection_id", conn.id);
    const selected = (rows ?? []).map((r) => String(r.external_id).replace(prefix, ""));
    if (selected.length === 0) return { ok: true, campaigns: 0, rows: 0 };

    const since = iso(new Date(Date.now() - days * 86400000)), until = iso(new Date());
    let ds;
    if (conn.platform === "meta") {
      const o = { accessToken: decryptToken(conn.token_enc), version: process.env.META_GRAPH_VERSION };
      const accounts = (await listMetaAdAccounts(o)).filter((a) => selected.includes(a.id));
      ds = await fetchMetaDataset(o, accounts, since, until);
    } else if (conn.platform === "tiktok") {
      const o = tiktokOptions(decryptToken(conn.token_enc));
      const accounts = (await listTiktokAdvertisers(o)).filter((a) => selected.includes(a.id));
      ds = await fetchTiktokDataset(o, accounts, since, until);
    } else {
      const accessToken = await refreshGoogleAccessToken({
        clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, refreshToken: decryptToken(conn.token_enc),
      });
      const o = { accessToken, version: process.env.GOOGLE_ADS_API_VERSION || undefined };
      const accounts = (await listGoogleAdAccounts(o)).filter((a) => selected.includes(a.id));
      ds = await fetchGoogleDataset(o, accounts, since, until);
    }
    const r = await ingestDataset(admin, conn.workspace_id, conn.platform as "meta" | "google" | "tiktok", ds);
    await admin.from("connection").update({ status: "active", last_error: null }).eq("id", conn.id);
    return { ok: true, campaigns: r.campaigns, rows: r.insights };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Sync failed";
    const needsReauth = (e instanceof MetaApiError && (e.code === 190 || e.code === 102)) || (e instanceof TiktokApiError && e.needsReauth) || (e instanceof GoogleApiError && e.needsReauth) || (e instanceof Ga4ApiError && e.status === 401) || (e instanceof MerchantApiError && e.status === 401 && !/not registered/i.test(error)) || (e instanceof SearchConsoleApiError && e.status === 401) || (e instanceof AllegroApiError && e.needsReauth);
    await admin.from("connection").update({ status: needsReauth ? "needs_reauth" : "error", last_error: error.slice(0, 300) }).eq("id", conn.id);
    return { ok: false, error, needsReauth };
  }
}

/** Every live Meta/Google connection, one after another, within a time budget. */
export async function syncAll(admin: Admin, budgetMs = 240_000) {
  const started = Date.now();
  const { data } = await admin.from("connection").select("id,workspace_id,platform,token_enc,status").in("platform", ["meta", "google", "tiktok", "allegro", "ga4", "merchant", "searchconsole"]).neq("status", "needs_reauth");
  const results: { platform: string; ok: boolean; rows?: number; error?: string }[] = [];
  let skipped = 0;
  for (const c of data ?? []) {
    if (Date.now() - started > budgetMs) { skipped++; continue; }
    const r = await syncConnection(admin, c as ConnRow);
    try { await alertIfNeeded(admin, c.id as string); } catch (e) { console.warn("[alerts] failed", e instanceof Error ? e.message : e); }
    results.push(r.ok ? { platform: c.platform, ok: true, rows: r.rows } : { platform: c.platform, ok: false, error: r.error.slice(0, 120) });
  }
  return { synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, skipped, results };
}

/** Best effort: tell the platform to forget our access. Local deletion never depends on this succeeding. */
export async function revokeAtPlatform(platform: string, tokenEnc: string | null) {
  if (!tokenEnc) return;
  try {
    const token = decryptToken(tokenEnc);
    if (platform === "meta") await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}/me/permissions`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (platform === "tiktok") { const { appId, appSecret } = tiktokOptions(token); if (appId && appSecret) await revokeTiktokToken({ appId, appSecret, accessToken: token }); }
    if (platform === "google" || platform === "ga4" || platform === "merchant" || platform === "searchconsole") await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  } catch { /* ignore */ }
}
