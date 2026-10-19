"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchGoogleDataset, listGoogleAdAccounts, type GoogleAdAccount } from "@acezilla/connectors";
import { googleAccessToken } from "@/lib/google-token";
import { ingestDataset } from "@/lib/ingest";
import { requireWriter } from "@/lib/workspace";

const fail = (m: string) => redirect(`/connections/google?error=${encodeURIComponent(m)}`);
const RANGES = [90, 365, 730, 1095];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Saves the chosen accounts, then pulls the chosen history. Read-only: only the Ads API read calls are used. */
export async function saveAndSyncGoogle(formData: FormData) {
  const ids = formData.getAll("account").map(String);
  const asked = Number(formData.get("range"));
  const DAYS = RANGES.includes(asked) ? asked : 730;
  if (ids.length === 0) return fail("Pick at least one ad account");
  let result: string;
  try {
    const { workspace } = await requireWriter();
    const { admin, accessToken } = await googleAccessToken(workspace.id);
    const opts = { accessToken, version: process.env.GOOGLE_ADS_API_VERSION || undefined };
    const chosen: GoogleAdAccount[] = (await listGoogleAdAccounts(opts)).filter((a) => ids.includes(a.id));
    if (chosen.length === 0) return fail("Those accounts are no longer available");
    const ds = await fetchGoogleDataset(opts, chosen, iso(new Date(Date.now() - DAYS * 86400000)), iso(new Date()));
    const r = await ingestDataset(admin, workspace.id, "google", ds);
    result = r.insights === 0
      ? `Connected ${chosen.map((a) => a.name).join(", ")}, but found no ad spend in the last ${DAYS} days. Try a longer range or an account with campaigns.`
      : `Synced ${r.campaigns} campaigns and ${r.insights} daily rows from Google Ads`;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Google Ads sync failed");
  }
  revalidatePath("/", "layout");
  redirect(`/connections?notice=${encodeURIComponent(result)}`);
}
