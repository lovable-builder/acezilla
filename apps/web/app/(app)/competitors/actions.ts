"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ANGLES, AD_SOURCES, groupLibraryAds, pageMatches } from "@acezilla/models";
import { fetchMetaLibraryAds } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/workspace";

/** Returns to the page, on the step where the person was working. Steps: 1 best ads, 2 messages, 3 competitors, 4 save an ad. */
const back = (qs = "", step = 0) => redirect(`/competitors${qs}${step ? `#competitors-${step}` : ""}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const fail = (e: unknown, fallback: string) => back(`?error=${encodeURIComponent(e instanceof Error ? e.message : fallback)}`);

/** Competitors and their ads are notes kept inside acezilla. Nothing is sent to any ad platform or to the competitor. */
export async function addCompetitor(formData: FormData) {
  const name = text(formData, "name", 80), category = text(formData, "category", 40);
  let website = text(formData, "website", 200);
  if (!name) return back("?error=Give+the+competitor+a+name");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    // Re-use the spelling of a category that already exists, so "Home" and "home" stay one filter.
    const { data: known } = await admin.from("competitor").select("category").eq("workspace_id", workspace.id);
    const same = (known ?? []).map((k) => String(k.category)).find((c) => c.toLowerCase() === category.toLowerCase());
    const { error } = await admin.from("competitor").insert({ workspace_id: workspace.id, name, website: website || null, category: same ?? category });
    if (error) throw new Error(error.message);
  } catch (e) { return fail(e, "Could not save the competitor"); }
  revalidatePath("/competitors");
  back("", 3);
}

async function removeImages(admin: ReturnType<typeof createAdminClient>, paths: (string | null)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await admin.storage.from("creatives").remove(list).catch(() => undefined);
}

export async function deleteCompetitor(formData: FormData) {
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient(), id = String(formData.get("id"));
    const { data: ads } = await admin.from("competitor_ad").select("image_path").eq("competitor_id", id).eq("workspace_id", workspace.id);
    await removeImages(admin, (ads ?? []).map((a) => a.image_path as string | null));
    const { error } = await admin.from("competitor").delete().eq("id", id).eq("workspace_id", workspace.id);
    if (error) throw new Error(error.message);
  } catch (e) { return fail(e, "Could not remove the competitor"); }
  revalidatePath("/competitors");
  back("", 3);
}

export async function addCompetitorAd(formData: FormData) {
  const competitorId = String(formData.get("competitor_id") ?? "");
  const platform = AD_SOURCES.some((s) => s.id === formData.get("platform")) ? String(formData.get("platform")) : "other";
  const angle = ANGLES.some((a) => a.id === formData.get("angle")) ? String(formData.get("angle")) : "other";
  const startedOn = String(formData.get("started_on") ?? ""), endedOn = String(formData.get("ended_on") ?? "");
  const stillRunning = formData.get("still_running") === "on";
  const variants = Math.min(99, Math.max(1, Math.round(Number(formData.get("variants")) || 1)));
  let link = text(formData, "link", 500);
  if (!competitorId) return back("?error=Pick+the+competitor+this+ad+belongs+to");
  if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
  if (startedOn && !DATE.test(startedOn)) return back("?error=Enter+the+start+date+as+a+date");
  if (endedOn && !DATE.test(endedOn)) return back("?error=Enter+the+end+date+as+a+date");
  if (startedOn && endedOn && endedOn < startedOn) return back("?error=The+end+date+is+before+the+start+date");
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { data: comp } = await admin.from("competitor").select("id").eq("id", competitorId).eq("workspace_id", workspace.id).maybeSingle();
    if (!comp) throw new Error("That competitor was not found");
    const image = text(formData, "image_path", 300);
    const imagePath = image.startsWith(`${workspace.id}/competitors/`) && !image.includes("..") ? image : null;
    const { error } = await admin.from("competitor_ad").insert({
      workspace_id: workspace.id, competitor_id: competitorId, platform, angle, link: link || null,
      started_on: startedOn || null, ended_on: stillRunning ? null : endedOn || null, still_running: stillRunning, variants,
      headline: text(formData, "headline", 200) || null, notes: text(formData, "notes", 600) || null, image_path: imagePath,
    });
    if (error) throw new Error(error.message);
  } catch (e) { return fail(e, "Could not save the ad"); }
  revalidatePath("/competitors");
  back("", 1);
}

export async function deleteCompetitorAd(formData: FormData) {
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient(), id = String(formData.get("id"));
    const { data: ad } = await admin.from("competitor_ad").select("image_path").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
    const { error } = await admin.from("competitor_ad").delete().eq("id", id).eq("workspace_id", workspace.id);
    if (error) throw new Error(error.message);
    await removeImages(admin, [(ad?.image_path as string | null) ?? null]);
  } catch (e) { return fail(e, "Could not remove the ad"); }
  revalidatePath("/competitors");
  back("", 1);
}

/**
 * Pulls this competitor's ads from Meta's public Ad Library (read-only) and saves them as notes here.
 * Importing again refreshes dates and the number of versions but never overwrites the message or notes the person edited.
 * Meta only answers for Facebook accounts that finished its Ad Library sign-up, so a refusal is explained rather than treated as a crash.
 */
export async function importMetaAds(formData: FormData) {
  const competitorId = String(formData.get("id") ?? "");
  let notice = "";
  try {
    const { workspace } = await requireWriter();
    const admin = createAdminClient();
    const { data: comp } = await admin.from("competitor").select("id,name").eq("id", competitorId).eq("workspace_id", workspace.id).maybeSingle();
    if (!comp) throw new Error("That competitor was not found");
    const { data: conn } = await admin.from("connection").select("token_enc,status").eq("workspace_id", workspace.id).eq("platform", "meta").maybeSingle();
    if (!conn?.token_enc || conn.status === "needs_reauth") throw new Error("Connect Meta on the Connections page first. The Ad Library is read with your Meta login.");

    const found = await fetchMetaLibraryAds({ accessToken: decryptToken(conn.token_enc as string), version: process.env.META_GRAPH_VERSION }, { search: comp.name as string, country: workspace.country });
    const ads = groupLibraryAds(found.filter((a) => a.pageName && pageMatches(a.pageName, comp.name as string)));
    if (!ads.length) {
      notice = found.length ? `Meta returned ${found.length} ads for "${comp.name}", but none from a page with that name. Check the spelling of the name.` : `Meta has no ads for "${comp.name}" in ${workspace.country}.`;
    } else {
      const { data: existing } = await admin.from("competitor_ad").select("external_id").eq("competitor_id", competitorId).not("external_id", "is", null);
      const known = new Set((existing ?? []).map((r) => r.external_id as string));
      const fresh = ads.filter((a) => !known.has(a.externalId)), old = ads.filter((a) => known.has(a.externalId));
      if (fresh.length) {
        const { error } = await admin.from("competitor_ad").insert(fresh.map((a) => ({
          workspace_id: workspace.id, competitor_id: competitorId, platform: "meta", angle: a.angle, link: a.link, started_on: a.startedOn, ended_on: a.endedOn,
          still_running: a.stillRunning, variants: Math.min(99, a.variants), headline: (a.headline || a.text).slice(0, 200) || null,
          notes: [a.text.slice(0, 400), a.reach ? `Meta says about ${a.reach.toLocaleString("en-GB")} people in the EU saw it.` : ""].filter(Boolean).join("\n\n").slice(0, 600) || null,
          external_id: a.externalId,
        })));
        if (error) throw new Error(error.message);
      }
      for (const a of old) {
        const { error } = await admin.from("competitor_ad").update({ started_on: a.startedOn, ended_on: a.endedOn, still_running: a.stillRunning, variants: Math.min(99, a.variants) }).eq("competitor_id", competitorId).eq("external_id", a.externalId);
        if (error) throw new Error(error.message);
      }
      notice = `Imported ${fresh.length} new ${fresh.length === 1 ? "ad" : "ads"} and refreshed ${old.length} from Meta for ${comp.name}. The message on each ad is a guess from its words; change it if it is wrong.`;
    }
  } catch (e) { return fail(e, "Could not read the Meta Ad Library"); }
  revalidatePath("/competitors");
  back(`?notice=${encodeURIComponent(notice)}`, 1);
}
