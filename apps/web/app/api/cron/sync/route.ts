import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

/** Called by Vercel Cron. Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is refused. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await syncAll(createAdminClient()));
}
