import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAlert, renderAlertEmail, type ConnState } from "./alerts";
import { sendEmail } from "./resend";

const NOW = new Date("2026-10-20T12:00:00Z");
const ok: ConnState = { platform: "meta", status: "active", lastError: null, tokenExpiresAt: "2026-12-18T00:00:00Z", lastAlertKind: null, lastAlertAt: null };
const days = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

test("healthy connection sends nothing and does not clear", () => {
  assert.deepEqual(decideAlert(ok, NOW), { send: null, clear: false });
});

test("expired login and failed sync alert immediately", () => {
  assert.deepEqual(decideAlert({ ...ok, status: "needs_reauth" }, NOW), { send: "needs_reauth" });
  assert.deepEqual(decideAlert({ ...ok, status: "error", lastError: "boom" }, NOW), { send: "sync_error" });
});

test("warns inside the 7-day expiry window, not outside it", () => {
  assert.deepEqual(decideAlert({ ...ok, tokenExpiresAt: "2026-10-25T00:00:00Z" }, NOW), { send: "token_expiring" });
  assert.deepEqual(decideAlert({ ...ok, tokenExpiresAt: "2026-11-05T00:00:00Z" }, NOW), { send: null, clear: false });
});

test("does not repeat the same alert inside its cooldown, but does after", () => {
  const bad = { ...ok, status: "error", lastAlertKind: "sync_error" };
  assert.deepEqual(decideAlert({ ...bad, lastAlertAt: days(1) }, NOW), { send: null, clear: false });
  assert.deepEqual(decideAlert({ ...bad, lastAlertAt: days(4) }, NOW), { send: "sync_error" });
  // a different problem alerts straight away
  assert.deepEqual(decideAlert({ ...bad, status: "needs_reauth", lastAlertAt: days(1) }, NOW), { send: "needs_reauth" });
});

test("resets the marker once the problem is gone", () => {
  assert.deepEqual(decideAlert({ ...ok, lastAlertKind: "sync_error", lastAlertAt: days(1) }, NOW), { send: null, clear: true });
});

test("email copy is escaped and names the platform and days left", () => {
  const e = renderAlertEmail("sync_error", { platform: "google", detail: '<script>alert("x")</script>', url: "https://x/connections", now: NOW });
  assert.match(e.subject, /Google Ads/);
  assert.ok(!e.html.includes("<script>"));
  assert.match(e.html, /&lt;script&gt;/);
  const x = renderAlertEmail("token_expiring", { platform: "meta", tokenExpiresAt: "2026-10-23T12:00:00Z", url: "https://x", now: NOW });
  assert.match(x.subject, /expires in 3 days/);
});

test("sendEmail posts to Resend with a bearer header and reports failures", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const good = (async (url: string, init: RequestInit) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ id: "em_1" }) } as Response; }) as unknown as typeof fetch;
  assert.deepEqual(await sendEmail({ apiKey: "re_key", from: "a <a@x.dev>", to: "b@y.com", subject: "s", html: "<p>h</p>", fetch: good }), { ok: true, id: "em_1" });
  assert.equal(seen!.url, "https://api.resend.com/emails");
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, "Bearer re_key");
  assert.ok(!seen!.url.includes("re_key"));
  const denied = (async () => ({ ok: false, status: 403, json: async () => ({ message: "You can only send testing emails to your own email address" }) }) as Response) as unknown as typeof fetch;
  const r = await sendEmail({ apiKey: "k", from: "f", to: "t", subject: "s", html: "h", fetch: denied });
  assert.deepEqual(r, { ok: false, status: 403, error: "You can only send testing emails to your own email address" });
  const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  assert.deepEqual(await sendEmail({ apiKey: "k", from: "f", to: "t", subject: "s", html: "h", fetch: down }), { ok: false, status: 0, error: "offline" });
});
