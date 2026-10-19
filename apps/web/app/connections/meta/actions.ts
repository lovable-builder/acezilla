"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMetaDataset, listMetaAdAccounts, type MetaAdAccount } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import { ingestDataset } from "@/lib/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

const fail = (m: string) => redirect(`/connections/meta?error=${encodeURIComponent(m)}`);
const DAYS = 90;
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function token(workspaceId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("connection").select("token_enc").eq("workspace_id", workspaceId).eq("platform", "meta").maybeSingle();
  if (!data?.token_enc) throw new Error("Meta is not connected");
  return { admin, accessToken: decryptToken(data.token_enc as string) };
}

/** Saves the chosen ad accounts, then pulls the last 90 days. Read-only: no write scope is ever requested. */
export async function saveAndSync(formData: FormData) {
  const ids = formData.getAll("account").map(String);
  if (ids.length === 0) return fail("Pick at least one ad account");
  let result: string;
  try {
    const { workspace } = await requireWriter();
    const { admin, accessToken } = await token(workspace.id);
    const all = await listMetaAdAccounts({ accessToken, version: process.env.META_GRAPH_VERSION });
    const chosen: MetaAdAccount[] = all.filter((a) => ids.includes(a.id));
    if (chosen.length === 0) return fail("Those accounts are no longer available");
    const until = new Date(), since = new Date(Date.now() - DAYS * 86400000);
    const ds = await fetchMetaDataset({ accessToken, version: process.env.META_GRAPH_VERSION }, chosen, iso(since), iso(until));
    const r = await ingestDataset(admin, workspace.id, "meta", ds);
    result = `Synced ${r.campaigns} campaigns and ${r.insights} daily rows from Meta`;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Meta sync failed");
  }
  revalidatePath("/", "layout");
  redirect(`/connections?notice=${encodeURIComponent(result)}`);
}
