"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { listSearchSites } from "@acezilla/connectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { pullSearchConsole, searchConsoleAccessToken } from "@/lib/searchconsole";
import { requireWriter } from "@/lib/workspace";

const fail = (m: string) => redirect(`/connections/searchconsole?error=${encodeURIComponent(m)}`);

/** Saves the chosen websites, then reads their search words. Read-only: only the site list and search reports are called. */
export async function saveAndSyncSearchConsole(formData: FormData) {
  const ids = formData.getAll("site").map(String);
  if (ids.length === 0) return fail("Pick at least one website");
  let result: string;
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { data: conn } = await admin.from("connection").select("id,workspace_id,token_enc").eq("workspace_id", workspace.id).eq("platform", "searchconsole").maybeSingle();
    if (!conn?.token_enc) return fail("Google Search Console is not connected");
    const accessToken = await searchConsoleAccessToken(conn.token_enc as string);
    const chosen = (await listSearchSites({ accessToken })).filter((s) => ids.includes(s.url));
    if (chosen.length === 0) return fail("Those websites are no longer available");
    const { error } = await admin.from("search_site").upsert(
      chosen.map((s) => ({ workspace_id: workspace.id, connection_id: conn.id, external_id: s.url, name: s.name })), { onConflict: "workspace_id,external_id" });
    if (error) return fail(error.message);
    // Unticked websites stop syncing and their imported words go with them.
    const { count: removed } = await admin.from("search_site").delete({ count: "exact" })
      .eq("connection_id", conn.id).not("external_id", "in", `(${chosen.map((s) => `"${s.url}"`).join(",")})`);
    const r = await pullSearchConsole(admin, conn as { id: string; workspace_id: string }, accessToken);
    await admin.from("connection").update({ status: "active", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", conn.id);
    result = `Read ${r.rows} search words from ${r.sites} ${r.sites === 1 ? "website" : "websites"}${removed ? `. Removed ${removed} unselected.` : ""}`;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Google Search Console sync failed");
  }
  revalidatePath("/", "layout");
  redirect(`/connections?notice=${encodeURIComponent(result)}`);
}
