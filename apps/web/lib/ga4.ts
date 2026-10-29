import "server-only";
import { fetchGa4Report, refreshGoogleAccessToken, type Ga4Property } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const CHUNK = 500;

/** Short-lived access token from the stored (encrypted) refresh token of the Analytics connection. */
export async function ga4AccessToken(admin: Admin, tokenEnc: string) {
  return refreshGoogleAccessToken({
    clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, refreshToken: decryptToken(tokenEnc),
  });
}

/** Pulls daily traffic for the properties already chosen on this connection. Replaces the window in place, so re-running is safe. */
export async function pullGa4(admin: Admin, conn: { id: string; workspace_id: string }, accessToken: string, days: number) {
  const { data: props } = await admin.from("analytics_property").select("id,external_id").eq("connection_id", conn.id);
  const since = iso(new Date(Date.now() - days * 86400000)), until = iso(new Date());
  let rows = 0;
  for (const p of props ?? []) {
    const report = await fetchGa4Report({ accessToken }, p.external_id as string, since, until);
    await admin.from("analytics_daily").delete().eq("property_id", p.id).gte("date", since).lte("date", until);
    const data = report.rows.map((r) => ({ workspace_id: conn.workspace_id, property_id: p.id, ...r }));
    for (let i = 0; i < data.length; i += CHUNK) {
      const { error } = await admin.from("analytics_daily").insert(data.slice(i, i + CHUNK));
      if (error) throw new Error(`analytics_daily: ${error.message}`);
    }
    if (report.currency) await admin.from("analytics_property").update({ currency: report.currency }).eq("id", p.id);
    rows += data.length;
  }
  return { properties: props?.length ?? 0, rows };
}

export type { Ga4Property };
