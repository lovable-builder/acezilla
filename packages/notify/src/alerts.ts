export type AlertKind = "needs_reauth" | "sync_error" | "token_expiring";

export interface ConnState {
  platform: string; status: string; lastError: string | null; tokenExpiresAt: string | null;
  lastAlertKind: string | null; lastAlertAt: string | null;
}

export const EXPIRY_WARN_DAYS = 7;
/** How long to stay quiet before repeating the same alert. */
const COOLDOWN_DAYS: Record<AlertKind, number> = { needs_reauth: 7, sync_error: 3, token_expiring: 3 };
const DAY = 86400000;

export function currentCondition(c: ConnState, now: Date): AlertKind | null {
  if (c.status === "needs_reauth") return "needs_reauth";
  if (c.status === "error") return "sync_error";
  if (c.tokenExpiresAt && new Date(c.tokenExpiresAt).getTime() - now.getTime() <= EXPIRY_WARN_DAYS * DAY) return "token_expiring";
  return null;
}

/** Decide whether to email. `clear` means the problem is over, so the dedupe marker should be reset. */
export function decideAlert(c: ConnState, now: Date = new Date()): { send: AlertKind } | { send: null; clear: boolean } {
  const kind = currentCondition(c, now);
  if (!kind) return { send: null, clear: c.lastAlertKind !== null };
  const recent = c.lastAlertKind === kind && c.lastAlertAt !== null && now.getTime() - new Date(c.lastAlertAt).getTime() < COOLDOWN_DAYS[kind] * DAY;
  return recent ? { send: null, clear: false } : { send: kind };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const platformLabel = (p: string) => (p === "meta" ? "Meta Ads" : p === "google" ? "Google Ads" : p === "tiktok" ? "TikTok Ads" : p);

export function renderAlertEmail(kind: AlertKind, o: { platform: string; detail?: string | null; tokenExpiresAt?: string | null; url: string; now?: Date }) {
  const name = platformLabel(o.platform);
  const daysLeft = o.tokenExpiresAt ? Math.max(0, Math.ceil((new Date(o.tokenExpiresAt).getTime() - (o.now ?? new Date()).getTime()) / DAY)) : null;
  const copy = {
    needs_reauth: { subject: `Reconnect ${name} to keep acezilla in sync`, headline: `Your ${name} login has expired`, body: `acezilla can no longer read your ${name} data. Reconnect it and syncing resumes automatically.`, cta: `Reconnect ${name}` },
    sync_error: { subject: `acezilla could not sync ${name}`, headline: `A ${name} sync failed`, body: `We could not refresh your ${name} data${o.detail ? `: ${o.detail}` : ""}. Open Connections to see the status and try again.`, cta: "Open Connections" },
    token_expiring: { subject: `Your ${name} login expires in ${daysLeft ?? "a few"} day${daysLeft === 1 ? "" : "s"}`, headline: `Your ${name} login expires soon`, body: `Your ${name} login expires in ${daysLeft ?? "a few"} day${daysLeft === 1 ? "" : "s"}. Reconnect now so your data keeps updating without a gap.`, cta: `Reconnect ${name}` },
  }[kind];
  const html = `<!doctype html><html><body style="margin:0;background:#F6F5F2;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#17161B">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="font-weight:700;font-size:18px;letter-spacing:-0.03em;margin-bottom:20px">acezilla</div>
  <div style="background:#fff;border:1px solid rgba(23,22,27,.09);border-radius:14px;padding:28px">
    <h1 style="margin:0 0 10px;font-size:22px;letter-spacing:-0.02em">${esc(copy.headline)}</h1>
    <p style="margin:0 0 22px;color:#55535D;line-height:1.6;font-size:15px">${esc(copy.body)}</p>
    <a href="${esc(o.url)}" style="display:inline-block;background:#7C5CFF;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:14px">${esc(copy.cta)}</a>
  </div>
  <p style="color:#86838F;font-size:12px;margin:18px 4px 0;line-height:1.6">You get this because you manage ${esc(name)} in acezilla. acezilla only reads your data and never changes a campaign without your approval.</p>
</div></body></html>`;
  const text = `${copy.headline}\n\n${copy.body}\n\n${copy.cta}: ${o.url}\n\nYou get this because you manage ${name} in acezilla.`;
  return { subject: copy.subject, html, text };
}
