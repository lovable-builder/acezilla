/** An image address from a store, accepted only if it is a plain https URL. Anything else is dropped, never fetched or trusted. */
export function safeImageUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".") ? u.toString() : null;
  } catch { return null; }
}
