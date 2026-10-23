import { fitNote, PLACEMENTS, type MediaPlatform } from "@acezilla/models";

export interface PreviewProps {
  platform: MediaPlatform; format: string; brand: string; headline: string; text: string; description?: string; cta?: string; hashtags?: string[]; hook?: string;
  /** The picture or video to show: uploaded files or product photos. Optional; a labelled block is shown without it. */
  media?: { images: string[]; video?: string };
  /** Shape of the file (width / height), when known, to say whether a placement crops it. */
  mediaRatio?: number | null;
  /** Which placement to draw. Defaults to the platform's main one. */
  placement?: string;
  /** Shade the parts of a full-screen placement that the app's own buttons cover. */
  safeZones?: boolean;
}

const Count = ({ n, max }: { n: number; max: number }) => max > 0 ? <span className="mono tabnum" style={{ fontSize: 11, color: n > max ? "var(--neg)" : "var(--ink3)" }}>{n}/{max}</span> : null;
const initial = (b: string) => (b.trim()[0] ?? "A").toUpperCase();
const handle = (b: string) => b.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbrand";

/** The picture or video, cropped to fill its frame the way the platforms do. */
function Media({ p, label }: { p: PreviewProps; label: string }) {
  const images = p.media?.images ?? [], video = p.media?.video;
  if (video) return <video src={video} muted playsInline loop autoPlay preload="metadata" />;
  if (p.format === "carousel" && !video) {
    return <div className="ap-car-strip">{images.length ? images.slice(0, 4).map((u) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={u} src={u} alt="" referrerPolicy="no-referrer" />) : [0, 1, 2].map((i) => <i key={i} />)}</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return images[0] ? <img src={images[0]} alt="" referrerPolicy="no-referrer" /> : <span className="ap-empty">{label}</span>;
}

const Rail = ({ items }: { items: string[] }) => <div className="ap-rail" aria-hidden>{items.map((x, i) => <span key={i}>{x}</span>)}</div>;

function Phone({ p, kind, ratioLabel }: { p: PreviewProps; kind: "stories" | "reels" | "foryou"; ratioLabel: string }) {
  const cta = p.cta ?? "Shop now", tags = (p.hashtags ?? []).join(" ");
  return (
    <div className="ap-phone2" aria-label={`${kind} preview`}>
      <div className="ap-phone2-media"><Media p={p} label={`${ratioLabel} · your video or image`} /></div>
      <span className="shade" />
      {p.safeZones && <><span className="safe top"><i>App buttons</i></span><span className="safe bottom"><i>Caption and buttons</i></span></>}
      {kind === "stories" && (
        <>
          <div className="ap-prog"><i /></div>
          <div className="ap-who"><span className="ap-avatar sm">{initial(p.brand)}</span><b>{p.brand || "Your brand"}</b><span className="dim">Sponsored</span></div>
          <div className="ap-bottom"><div className="ap-cap">{p.text || "Your text appears here"}</div><span className="ap-pill">{cta} ⌃</span></div>
        </>
      )}
      {kind === "reels" && (
        <>
          <Rail items={["♡", "◌", "➤", "⋯"]} />
          <div className="ap-bottom"><div className="ap-who flat"><span className="ap-avatar sm">{initial(p.brand)}</span><b>{p.brand || "Your brand"}</b><span className="dim">Sponsored</span></div>
            <div className="ap-cap">{p.text || "Your caption appears here"} {tags}</div><span className="ap-bar2">{cta} ›</span></div>
        </>
      )}
      {kind === "foryou" && (
        <>
          <Rail items={["◉", "♥", "◌", "↪"]} />
          <div className="ap-bottom"><b>@{handle(p.brand)}</b><span className="dim"> · Sponsored</span>
            <div className="ap-cap">{p.text || "Your caption appears here"} {tags}</div><div className="dim">♫ Original sound</div><span className="ap-bar2 tt">{cta}</span></div>
        </>
      )}
    </div>
  );
}

/** A picture of how the ad will look in one placement, at that placement's real shape. A guide to layout, crop and length, not a pixel-exact render. */
export function AdPreview(props: PreviewProps) {
  const { platform, format, brand, headline, text, description = "", cta = "Shop now", hashtags = [] } = props;
  const placement = props.placement ?? (platform === "meta" ? "fb_feed" : platform === "tiktok" ? "foryou" : format === "search" ? "search" : "display");
  const pl = PLACEMENTS.find((x) => x.id === placement && x.platform === platform) ?? PLACEMENTS.find((x) => x.platform === platform)!;
  const note = fitNote(props.mediaRatio ?? null, pl);
  const tags = hashtags.join(" ");

  let body: React.ReactNode;
  let foot: React.ReactNode;
  if (pl.id === "stories" || pl.id === "reels" || pl.id === "foryou") {
    body = <Phone p={props} kind={pl.id} ratioLabel={pl.ratioLabel} />;
    foot = <><span>{platform === "tiktok" ? "Caption" : "Text"}</span><Count n={text.length} max={platform === "tiktok" ? 100 : 125} /></>;
  } else if (pl.id === "search") {
    body = <div className="ap-g"><div className="ap-g-url"><b>Ad</b> · yourstore.com</div><div className="ap-g-title">{headline || "Headline"} | Second headline</div><div className="ap-g-desc">{text || "Your description appears here."}</div></div>;
    foot = <><span>Headline</span><Count n={headline.length} max={30} /><span>Description</span><Count n={text.length} max={90} /></>;
  } else if (pl.id === "display" || pl.id === "square") {
    body = (
      <div className="ap-card">
        <div className="ap-frame" style={{ aspectRatio: pl.id === "square" ? "1 / 1" : "1.91 / 1" }}><Media p={props} label={`${pl.ratioLabel} · your image`} /></div>
        <div className="ap-g" style={{ gap: 3 }}><div className="ap-g-url"><b>Ad</b> · yourstore.com</div><b>{headline || "Headline"}</b><div className="ap-g-desc">{text || "Your description appears here."}</div></div>
      </div>
    );
    foot = <><span>Headline</span><Count n={headline.length} max={30} /><span>Description</span><Count n={text.length} max={90} /></>;
  } else if (pl.id === "ig_feed") {
    body = (
      <div className="ap-ig">
        <div className="ap-head"><span className="ap-avatar ring">{initial(brand)}</span><div><b>{brand || "Your brand"}</b><div className="dim" style={{ fontSize: 11 }}>Sponsored</div></div><span style={{ marginLeft: "auto" }}>⋯</span></div>
        <div className="ap-frame" style={{ aspectRatio: "4 / 5" }}><Media p={props} label="4:5 · your image or video" /></div>
        <div className="ap-igcta"><span>{cta}</span><span>›</span></div>
        <div className="ap-icons">♡ ◌ ➤</div>
        <div className="ap-text"><b>{brand || "yourbrand"}</b> {text || "Your caption appears here."} <span style={{ color: "var(--accent-ink)" }}>{tags}</span></div>
      </div>
    );
    foot = <><span>Caption</span><Count n={text.length} max={125} /></>;
  } else {
    body = (
      <div className="ap-fb">
        <div className="ap-head"><span className="ap-avatar">{initial(brand)}</span><div><b>{brand || "Your brand"}</b><div className="dim" style={{ fontSize: 11 }}>Sponsored · 🌐</div></div><span style={{ marginLeft: "auto" }}>⋯</span></div>
        <div className="ap-text">{text || "Your primary text appears here."} <span style={{ color: "var(--accent-ink)" }}>{tags}</span></div>
        <div className="ap-frame" style={{ aspectRatio: "1 / 1" }}><Media p={props} label={format === "carousel" ? "Carousel · one image per product" : "1:1 · your image or video"} /></div>
        <div className="ap-bar"><div><div className="eyebrow">yourstore.com</div><b>{headline || "Headline"}</b>{description && <div className="sub" style={{ margin: 0, fontSize: 12 }}>{description}</div>}</div><span className="ap-cta">{cta}</span></div>
        <div className="ap-icons" style={{ justifyContent: "space-around" }}><span>👍 Like</span><span>💬 Comment</span><span>↪ Share</span></div>
      </div>
    );
    foot = <><span>Primary</span><Count n={text.length} max={125} /><span>Headline</span><Count n={headline.length} max={40} /></>;
  }

  return (
    <div className={`ap${pl.fullScreen ? " ap-bare" : ""}`} aria-label={`${pl.label} preview`}>
      {body}
      {note && <div className="ap-fit" style={{ color: note.fits ? "var(--pos)" : "var(--warn)" }}>{note.fits ? "✓" : "!"} {note.text}</div>}
      <div className="ap-foot">{foot}</div>
    </div>
  );
}
