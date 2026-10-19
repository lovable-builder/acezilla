import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM. Format: base64(iv[12] | tag[16] | ciphertext). Key: META_TOKEN_KEY (32 bytes, base64). */
const key = () => {
  const k = Buffer.from(process.env.META_TOKEN_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("META_TOKEN_KEY must be 32 bytes, base64-encoded");
  return k;
};

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function decryptToken(blob: string): string {
  const b = Buffer.from(blob, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
