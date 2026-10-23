import type { MediaPlatform } from "@acezilla/models";

interface Props {
  platform: MediaPlatform; format: string; brand: string; headline: string; text: string; description?: string; cta?: string; hashtags?: string[]; hook?: string;
}

const Count = ({ n, max }: { n: number; max: number }) => max > 0 ? <span className="mono tabnum" style={{ fontSize: 11, color: n > max ? "var(--neg)" : "var(--ink3)" }}>{n}/{max}</span> : null;

/** A rough picture of how the ad will look. It is a guide to layout and length, not a pixel-exact render. */
export function AdPreview({ platform, format, brand, headline, text, description = "", cta = "Shop now", hashtags = [], hook = "" }: Props) {
  if (platform === "tiktok") {
    return (
      <div className="ap ap-phone" aria-label="TikTok preview">
        <div className="ap-phone-screen">
          {hook && <div className="ap-hook">▶ {hook}</div>}
          <div className="ap-phone-bottom">
            <b>@{brand.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbrand"}</b>
            <div>{text || "Your caption appears here"} {hashtags.join(" ")}</div>
            <span className="ap-cta">{cta}</span>
          </div>
        </div>
        <div className="ap-foot"><span>Caption</span><Count n={text.length} max={100} /></div>
      </div>
    );
  }
  if (platform === "google") {
    return (
      <div className="ap" aria-label="Google preview">
        <div className="ap-g">
          <div className="ap-g-url"><b>Ad</b> · yourstore.com</div>
          <div className="ap-g-title">{headline || "Headline"}{format === "search" ? " | Second headline" : ""}</div>
          <div className="ap-g-desc">{text || "Your description appears here."}</div>
        </div>
        <div className="ap-foot"><span>Headline</span><Count n={headline.length} max={30} /><span>Description</span><Count n={text.length} max={90} /></div>
      </div>
    );
  }
  return (
    <div className="ap" aria-label="Meta preview">
      <div className="ap-head"><span className="ap-avatar">{(brand[0] ?? "A").toUpperCase()}</span><div><b>{brand || "Your brand"}</b><div className="eyebrow">Sponsored</div></div></div>
      <div className="ap-text">{text || "Your primary text appears here."}</div>
      <div className={`ap-media${format === "carousel" ? " ap-car" : ""}`}>{format === "carousel" ? <><i /><i /><i /></> : <span>Image or video</span>}</div>
      <div className="ap-bar"><div><div className="eyebrow">yourstore.com</div><b>{headline || "Headline"}</b>{description && <div className="sub" style={{ margin: 0, fontSize: 12 }}>{description}</div>}</div><span className="ap-cta">{cta}</span></div>
      {hashtags.length > 0 && <div className="ap-text" style={{ color: "var(--accent-ink)" }}>{hashtags.join(" ")}</div>}
      <div className="ap-foot"><span>Primary</span><Count n={text.length} max={125} /><span>Headline</span><Count n={headline.length} max={40} /></div>
    </div>
  );
}
