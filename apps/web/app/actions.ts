"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getWorkspaceContext, WS_COOKIE } from "@/lib/workspace";

export async function switchWorkspace(formData: FormData) {
  const id = String(formData.get("workspace") ?? "");
  const { workspaces } = await getWorkspaceContext();
  if (workspaces.some((w) => w.id === id)) (await cookies()).set(WS_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
  revalidatePath("/", "layout");
}
