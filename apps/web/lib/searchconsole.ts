import "server-only";
import { fetchSearchQueries, refreshGoogleAccessToken } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const CHUNK = 500;

/** Short-lived access token from the stored (encrypted) refresh token of the Search Console connection. */
export async function searchConsoleAccessToken(tokenEnc: string) {
  return refreshGoogleAccessToken({
    clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, refreshToken: decryptToken(tokenEnc),
  });
}

/** Last 28 complete days. Search Console is about three days behind, so the window ends three days ago. */
export function searchWindow(now = new Date()) {
  const end = new Date(now.getTime() - 3 * 86400000);
  return { since: iso(new Date(end.getTime() - 27 * 86400000)), until: iso(end) };
}

/** Replaces the stored words of every chosen site with the latest 28 days. Read-only at Google. */
export async function pullSearchConsole(admin: Admin, conn: { id: string; workspace_id: string }, accessToken: string) {
  const { data: sites } = await admin.from("search_site").select("id,external_id").eq("connection_id", conn.id);
  const { since, until } = searchWindow();
  let rows = 0;
  for (const s of sites ?? []) {
    const words = await fetchSearchQueries({ accessToken }, s.external_id as string, since, until);
    // Write the new words first, then remove only what belongs to an older period, so a failed write never leaves the site empty.
    const data = words.map((w) => ({ workspace_id: conn.workspace_id, site_id: s.id, query: w.query, clicks: w.clicks, impressions: w.impressions, position: w.position, period_start: since, period_end: until }));
    for (let i = 0; i < data.length; i += CHUNK) {
      const { error } = await admin.from("search_query").upsert(data.slice(i, i + CHUNK), { onConflict: "site_id,query" });
      if (error) throw new Error(`search_query: ${error.message}`);
    }
    await admin.from("search_query").delete().eq("site_id", s.id).lt("period_end", until);
    rows += data.length;
  }
  return { sites: sites?.length ?? 0, rows };
}
