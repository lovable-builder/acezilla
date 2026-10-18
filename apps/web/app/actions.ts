"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { csvToDataset, generateMockDataset } from "@acezilla/connectors";
import { ingestDataset } from "@/lib/ingest";
import { getWorkspaceContext, WS_COOKIE } from "@/lib/workspace";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const back = (qs: string) => redirect(`/connections?${qs}`);

export async function switchWorkspace(formData: FormData) {
  const id = String(formData.get("workspace") ?? "");
  const { workspaces } = await getWorkspaceContext();
  if (workspaces.some((w) => w.id === id)) (await cookies()).set(WS_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function loadDemoData() {
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return back("error=No+workspace+found");
  try {
    await ingestDataset(supabase, current.id, "mock", generateMockDataset());
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Import failed")}`);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function importCsv(formData: FormData) {
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return back("error=No+workspace+found");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return back("error=Choose+a+CSV+file");
  if (file.size > MAX_CSV_BYTES) return back("error=File+is+over+5+MB");
  const { dataset, rows, errors } = csvToDataset(await file.text());
  if (rows === 0) return back(`error=${encodeURIComponent(errors.slice(0, 3).join(" · ") || "No valid rows")}`);
  try {
    await ingestDataset(supabase, current.id, "csv", dataset);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Import failed")}`);
  }
  revalidatePath("/", "layout");
  redirect(errors.length ? `/connections?notice=${encodeURIComponent(`Imported ${rows} rows, skipped ${errors.length}`)}` : "/");
}

/** Removes demo data. Deleting the connection cascades to accounts → campaigns → ads → insights. */
export async function clearDemoData() {
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return back("error=No+workspace+found");
  await supabase.from("connection").delete().eq("workspace_id", current.id).eq("platform", "mock");
  await supabase.from("creative").delete().eq("workspace_id", current.id).like("external_id", "mock-%");
  await supabase.from("order").delete().eq("workspace_id", current.id).like("external_id", "mock-ord-%");
  revalidatePath("/", "layout");
  back("notice=Demo+data+removed");
}
