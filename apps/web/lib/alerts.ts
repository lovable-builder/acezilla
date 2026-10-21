import "server-only";
import { decideAlert, renderAlertEmail, sendEmail, type ConnState } from "@acezilla/notify";
import { SITE } from "@/lib/legal";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
const FROM = process.env.RESEND_FROM || "acezilla <onboarding@resend.dev>";

/** Emails the people who manage a workspace (owners and admins). Returns how many sends succeeded. */
export async function notify(admin: Admin, workspaceId: string, subject: string, html: string, text: string, key: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return 0;
  const { data: ws } = await admin.from("workspace").select("org_id").eq("id", workspaceId).maybeSingle();
  if (!ws) return 0;
  const { data: members } = await admin.from("org_member").select("user_id").eq("org_id", ws.org_id).in("role", ["owner", "admin"]);
  let sent = 0;
  for (const m of members ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id as string);
    const to = u.user?.email;
    if (!to) continue;
    const r = await sendEmail({ apiKey, from: FROM, to, subject, html, text, idempotencyKey: `${key}:${m.user_id}` });
    if (r.ok) sent++;
    else console.warn(`[alerts] email not sent (${r.status}): ${r.error}`);
  }
  return sent;
}

/** After a daily sync: email if the connection needs attention, at most once per cooldown, and reset when it recovers. */
export async function alertIfNeeded(admin: Admin, connectionId: string) {
  const { data: c } = await admin.from("connection")
    .select("id,workspace_id,platform,status,last_error,token_expires_at,last_alert_kind,last_alert_at").eq("id", connectionId).maybeSingle();
  if (!c) return;
  const state: ConnState = {
    platform: c.platform as string, status: c.status as string, lastError: (c.last_error as string | null) ?? null,
    tokenExpiresAt: (c.token_expires_at as string | null) ?? null, lastAlertKind: (c.last_alert_kind as string | null) ?? null, lastAlertAt: (c.last_alert_at as string | null) ?? null,
  };
  const d = decideAlert(state);
  if (d.send === null) {
    if (d.clear) await admin.from("connection").update({ last_alert_kind: null, last_alert_at: null }).eq("id", connectionId);
    return;
  }
  const mail = renderAlertEmail(d.send, { platform: state.platform, detail: state.lastError, tokenExpiresAt: state.tokenExpiresAt, url: `${SITE}/connections` });
  const day = new Date().toISOString().slice(0, 10);
  const sent = await notify(admin, c.workspace_id as string, mail.subject, mail.html, mail.text, `${connectionId}:${d.send}:${day}`);
  // Only mark as alerted if someone actually got it, so a misconfigured sender retries tomorrow.
  if (sent > 0) await admin.from("connection").update({ last_alert_kind: d.send, last_alert_at: new Date().toISOString() }).eq("id", connectionId);
}
