import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dataset } from "@acezilla/connectors";

const CHUNK = 500;
const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / CHUNK) }, (_, i) => a.slice(i * CHUNK, (i + 1) * CHUNK));

async function upsertIds(sb: SupabaseClient, table: string, rows: Record<string, unknown>[], conflict: string) {
  const ids = new Map<string, string>();
  for (const part of chunks(rows)) {
    const { data, error } = await sb.from(table).upsert(part, { onConflict: conflict }).select("id,platform,external_id");
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data ?? []) ids.set(`${r.platform}|${r.external_id}`, r.id as string);
  }
  return ids;
}

/** Writes a normalised Dataset into one workspace. Idempotent: re-running updates in place. */
export async function ingestDataset(sb: SupabaseClient, workspaceId: string, platform: "mock" | "csv", ds: Dataset) {
  const now = new Date().toISOString();
  const { data: existing } = await sb.from("connection").select("id").eq("workspace_id", workspaceId).eq("platform", platform).limit(1);
  let connectionId = existing?.[0]?.id as string | undefined;
  if (connectionId) {
    const { error } = await sb.from("connection").update({ last_sync_at: now, status: "active" }).eq("id", connectionId);
    if (error) throw new Error(`connection: ${error.message}`);
  } else {
    const { data, error } = await sb.from("connection").insert({ workspace_id: workspaceId, platform, scopes: ["read"], last_sync_at: now }).select("id").single();
    if (error) throw new Error(`connection: ${error.message}`);
    connectionId = data.id as string;
  }

  const ws = workspaceId;
  const acc = await upsertIds(sb, "ad_account", ds.accounts.map((a) => ({ workspace_id: ws, connection_id: connectionId, platform: a.platform, external_id: a.externalId, name: a.name, currency: a.currency })), "workspace_id,platform,external_id");
  const camp = await upsertIds(sb, "campaign", ds.campaigns.map((c) => ({ workspace_id: ws, ad_account_id: acc.get(`${c.platform}|${c.accountExternalId}`), platform: c.platform, external_id: c.externalId, name: c.name, objective: c.objective, status: c.status, daily_budget: c.dailyBudget })), "workspace_id,platform,external_id");
  const grp = await upsertIds(sb, "ad_group", ds.adGroups.map((g) => ({ workspace_id: ws, campaign_id: camp.get(`${g.platform}|${g.campaignExternalId}`), platform: g.platform, external_id: g.externalId, name: g.name, status: g.status })), "workspace_id,platform,external_id");
  const cre = await upsertIds(sb, "creative", ds.creatives.map((c) => ({ workspace_id: ws, platform: c.platform, external_id: c.externalId, kind: c.kind })), "workspace_id,platform,external_id");
  const ads = await upsertIds(sb, "ad", ds.ads.map((a) => ({ workspace_id: ws, ad_group_id: grp.get(`${a.platform}|${a.adGroupExternalId}`), creative_id: a.creativeExternalId ? cre.get(`${a.platform}|${a.creativeExternalId}`) : null, platform: a.platform, external_id: a.externalId, name: a.name, status: a.status })), "workspace_id,platform,external_id");

  const adByExternal = new Map([...ads].map(([k, v]) => [k.split("|")[1]!, v]));
  const insights = ds.insights.map((i) => ({ workspace_id: ws, ad_id: adByExternal.get(i.adExternalId), date: i.date, spend: i.spend, impressions: i.impressions, clicks: i.clicks, conversions: i.conversions, revenue: i.revenue }));
  for (const part of chunks(insights)) {
    const { error } = await sb.from("insight_daily").upsert(part, { onConflict: "ad_id,date" });
    if (error) throw new Error(`insight_daily: ${error.message}`);
  }
  const orders = ds.orders.map((o) => ({ workspace_id: ws, external_id: o.externalId, created_at: o.createdAt, revenue: o.revenue, customer_id: o.customerId, utm: o.utm, click_ids: o.clickIds }));
  for (const part of chunks(orders)) {
    const { error } = await sb.from("order").upsert(part, { onConflict: "workspace_id,external_id" });
    if (error) throw new Error(`order: ${error.message}`);
  }
  return { insights: insights.length, orders: orders.length, campaigns: ds.campaigns.length };
}
