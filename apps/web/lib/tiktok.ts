import "server-only";

/** The TikTok app credentials (server only). The secret must never leave the server. */
export function tiktokEnv() {
  const { TIKTOK_APP_ID: appId, TIKTOK_APP_SECRET: appSecret } = process.env;
  return { appId, appSecret, ready: !!(appId && appSecret && process.env.SUPABASE_SERVICE_ROLE_KEY) };
}

/** Options for every connector call: the person's token plus the app credentials TikTok asks for when listing ad accounts. */
export function tiktokOptions(accessToken: string) {
  const { appId, appSecret } = tiktokEnv();
  return { accessToken, appId, appSecret };
}
