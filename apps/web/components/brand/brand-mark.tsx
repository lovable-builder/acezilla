import Image from "next/image";
import mark from "./logo-mark.png";

/** The acezilla dragon AZ mark as a rounded tile. Decorative: the wordmark beside it carries the name. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return <Image src={mark} alt="" width={size} height={size} style={{ borderRadius: Math.round(size * 0.24), flexShrink: 0 }} />;
}
