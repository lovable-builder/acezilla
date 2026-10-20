import { promises as dns } from "node:dns";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}
export type Lookup = (host: string) => Promise<string[]>;
export const defaultLookup: Lookup = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

const v4 = (ip: string) => ip.split(".").map(Number) as [number, number, number, number];

/** True for any address a public website crawler must never contact (loopback, private, link-local, metadata, multicast, reserved). */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b, c] = v4(ip);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  if (kind === 6) {
    const g = expandV6(ip);
    if (!g) return true;
    const mapped = g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0);      // ::ffff:a.b.c.d and ::a.b.c.d
    if (mapped && !(g.slice(0, 7).every((x) => x === 0) && g[7]! <= 1)) return isPrivateIp(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`);
    if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateIp(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`); // NAT64
    return g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) ||                      // :: and ::1
      (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xff00) === 0xff00 ||                // ULA, link-local, multicast
      (g[0] === 0x2001 && g[1] === 0x0db8) || g[0] === 0x2002 || (g[0] === 0x2001 && g[1] === 0);                  // docs, 6to4, Teredo
  }
  return true; // not an IP at all: refuse
}

function expandV6(ip: string): number[] | null {
  let s = ip.split("%")[0]!;
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) { const [a, b, c, d] = v4(s.slice(lastColon + 1)); s = `${s.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`; }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(fill, 0)).fill("0"), ...t].map((x) => parseInt(x || "0", 16));
  return parts.length === 8 && parts.every((n) => Number.isFinite(n)) ? parts : null;
}

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|intranet|corp|home|lan)$/i;

/** Validates a URL the user gave us (or a redirect target) before any request is made. */
export async function assertSafeUrl(input: string | URL, lookup: Lookup = defaultLookup): Promise<URL> {
  let u: URL;
  try { u = new URL(input); } catch { throw new UnsafeUrlError("Not a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("Only http and https links are allowed");
  if (u.username || u.password) throw new UnsafeUrlError("Links with embedded credentials are not allowed");
  if (u.port && u.port !== "80" && u.port !== "443") throw new UnsafeUrlError("Only standard web ports (80, 443) are allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("Missing host");
  if (BLOCKED_NAMES.test(host)) throw new UnsafeUrlError("Local and internal hostnames are not allowed");
  if (isIP(host)) { if (isPrivateIp(host)) throw new UnsafeUrlError("Private and internal addresses are not allowed"); return u; }
  let addrs: string[];
  try { addrs = await lookup(host); } catch { throw new UnsafeUrlError("That host could not be found"); }
  if (addrs.length === 0) throw new UnsafeUrlError("That host could not be found");
  if (addrs.some(isPrivateIp)) throw new UnsafeUrlError("That host resolves to a private or internal address");
  return u;
}
