import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWeeklyAudits } from "@/lib/seo-monitor";

export const maxDuration = 300;

/** Called weekly by Vercel Cron. Same bearer-secret check as the sync job. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runWeeklyAudits(createAdminClient()));
}
