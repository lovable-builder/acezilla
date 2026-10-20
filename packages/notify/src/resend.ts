export interface SendArgs {
  apiKey: string; from: string; to: string | string[]; subject: string; html: string; text?: string;
  idempotencyKey?: string; fetch?: typeof fetch;
}
export type SendResult = { ok: true; id: string } | { ok: false; status: number; error: string };

/** Plain REST call to Resend; no SDK needed. The key travels in a header, never in a URL. */
export async function sendEmail(a: SendArgs): Promise<SendResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${a.apiKey}`, "Content-Type": "application/json" };
  if (a.idempotencyKey) headers["Idempotency-Key"] = a.idempotencyKey;
  try {
    const res = await (a.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST", headers,
      body: JSON.stringify({ from: a.from, to: a.to, subject: a.subject, html: a.html, text: a.text }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.id) return { ok: true, id: String(json.id) };
    return { ok: false, status: res.status, error: String(json.message ?? json.error?.message ?? `Resend HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "Network error" };
  }
}
