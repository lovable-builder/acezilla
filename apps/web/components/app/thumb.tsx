/** Allegro serves the original (large) file by default; its CDN also has a small version for thumbnails. */
const small = (u: string) => u.replace("https://a.allegroimg.com/original/", "https://a.allegroimg.com/s180/");

/** A small product photo. Shows a neutral tile when there is no image. Remote images are loaded without sending a referrer. */
export function Thumb({ src, name, size = 40 }: { src: string | null | undefined; name: string; size?: number }) {
  const box = { width: size, height: size, borderRadius: Math.round(size / 5), flexShrink: 0, border: "1px solid var(--line)", background: "var(--surface2)", overflow: "hidden", display: "inline-grid", placeItems: "center", color: "var(--ink3)", fontSize: size * 0.4, fontWeight: 600 } as const;
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <span style={box}><img src={small(src)} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></span>
    : <span style={box} aria-hidden>{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}
