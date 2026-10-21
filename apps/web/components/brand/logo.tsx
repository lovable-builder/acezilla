import { BRANDS, type BrandId } from "./paths";

/** Official brand glyph on a light tile, so each logo keeps its true colours in light and dark themes. */
export function BrandLogo({ brand, size = 44 }: { brand: BrandId; size?: number }) {
  const b = BRANDS[brand];
  return (
    <span
      title={b.title}
      style={{ width: size, height: size, borderRadius: 10, background: "img" in b ? b.hex : "#fff", border: "1px solid var(--line2)", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}
    >
      {"img" in b ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.img} alt={b.title} width={size} height={size} style={{ display: "block", width: "100%", height: "100%" }} />
      ) : (
      <svg role="img" aria-label={b.title} viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill={b.hex}>
        <path d={b.path} />
      </svg>
      )}
    </span>
  );
}
