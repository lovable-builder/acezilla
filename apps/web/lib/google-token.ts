import "server-only";
import { refreshGoogleAccessToken } from "@acezilla/connectors";
import { decryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Short-lived access token from the workspace's stored (encrypted) refresh token. */
export async function googleAccessToken(workspaceId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("connection").select("token_enc").eq("workspace_id", workspaceId).eq("platform", "google").maybeSingle();
  if (!data?.token_enc) throw new Error("Google Ads is not connected");
  const accessToken = await refreshGoogleAccessToken({
    clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    refreshToken: decryptToken(data.token_enc as string),
  });
  return { admin, accessToken };
}
