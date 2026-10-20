import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "acezilla: your AI marketing agency for Meta, Google and TikTok";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "components/brand/logo-mark.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #111015 0%, #1d1830 55%, #3a2a8a 130%)", color: "#F2F1F4", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={84} height={84} alt="" style={{ borderRadius: 20 }} />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>acezilla</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 78, fontWeight: 700, lineHeight: 1.03, letterSpacing: -3, maxWidth: 980 }}>Your AI marketing agency, in one workspace.</div>
          <div style={{ fontSize: 30, color: "#B6B3BE" }}>Meta · Google · TikTok · Shopify. Nothing changes until you approve it.</div>
        </div>
      </div>
    ),
    size,
  );
}
