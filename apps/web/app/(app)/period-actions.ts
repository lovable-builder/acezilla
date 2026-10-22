"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PRESETS } from "@/lib/period";

/** Remembers the user's preferred period and comparison setting for the pages that have a period bar. */
export async function savePeriodDefault(formData: FormData) {
  const days = Number(formData.get("days"));
  const compare = formData.get("compare") === "0" ? "0" : "1";
  const path = String(formData.get("path") ?? "/dashboard");
  if (!(PRESETS as readonly number[]).includes(days)) redirect(path);
  (await cookies()).set("az_view", `${days}.${compare}`, { path: "/", maxAge: 365 * 86400, sameSite: "lax", httpOnly: true, secure: true });
  redirect(`${path}?days=${days}${compare === "0" ? "&compare=0" : ""}`);
}
