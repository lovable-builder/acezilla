"use client";
import { useRef, useState } from "react";
import { CREATIVE_LIMITS, ratioName, type CreativeAsset } from "@acezilla/models";
import { createClient } from "@/lib/supabase/client";

export interface UploadedAsset extends CreativeAsset { preview: string }

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" };
const mb = (n: number) => `${Math.round(n / 1048576)} MB`;

const readImage = (url: string) => new Promise<{ w: number; h: number }>((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => rej(new Error("not an image")); i.src = url; });
const readVideo = (url: string) => new Promise<{ w: number; h: number; seconds: number }>((res, rej) => {
  const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
  v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight, seconds: v.duration });
  v.onerror = () => rej(new Error("The browser could not read this video")); v.src = url;
});

/**
 * Adds images (up to ten) or one video to a campaign draft. Files go straight to this workspace's private folder, and are only
 * ever used for the draft: they are not sent to any ad platform. The checks here are advice about the platform's shapes and lengths.
 */
export function CreativeUpload({ workspaceId, assets, onChange, imagesOnly = false }: { workspaceId: string; assets: UploadedAsset[]; onChange: (a: UploadedAsset[]) => void; /** A carousel uses images only: each uploaded image becomes a card. */ imagesOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null); setBusy(true);
    const sb = createClient();
    let next = [...assets];
    try {
      for (const file of Array.from(files)) {
        const isVideo = CREATIVE_LIMITS.videoTypes.includes(file.type), isImage = CREATIVE_LIMITS.imageTypes.includes(file.type);
        if (!isVideo && !isImage) throw new Error(`${file.name}: use JPG, PNG or WebP images${imagesOnly ? "" : ", or an MP4 or MOV video"}.`);
        if (isVideo && imagesOnly) throw new Error("A carousel uses images. Choose a single creative for a video."); 
        if (isImage && file.size > CREATIVE_LIMITS.imageBytes) throw new Error(`${file.name} is ${mb(file.size)}. Images can be up to ${mb(CREATIVE_LIMITS.imageBytes)}.`);
        if (isVideo && file.size > CREATIVE_LIMITS.videoBytes) throw new Error(`${file.name} is ${mb(file.size)}. A video can be up to ${mb(CREATIVE_LIMITS.videoBytes)}.`);
        if (isVideo && next.length > 0) throw new Error("Use one video or up to ten images, not both. Remove the others first.");
        if (isImage && next.some((a) => a.kind === "video")) throw new Error("Remove the video first: a draft uses one video or images.");
        if (isImage && next.length >= CREATIVE_LIMITS.maxImages) throw new Error(`At most ${CREATIVE_LIMITS.maxImages} images.`);
        const preview = URL.createObjectURL(file);
        const meta = isVideo ? await readVideo(preview) : { ...(await readImage(preview)), seconds: null as number | null };
        const path = `${workspaceId}/${crypto.randomUUID().replace(/-/g, "")}.${EXT[file.type]}`;
        const { error: e } = await sb.storage.from("creatives").upload(path, file, { contentType: file.type, upsert: false });
        if (e) throw new Error(`Could not upload ${file.name}: ${e.message}`);
        next = [...next, { path, kind: isVideo ? "video" : "image", name: file.name.slice(0, 80), w: meta.w, h: meta.h, seconds: meta.seconds, preview }];
        onChange(next);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function remove(a: UploadedAsset) {
    onChange(assets.filter((x) => x.path !== a.path));
    URL.revokeObjectURL(a.preview);
    await createClient().storage.from("creatives").remove([a.path]).catch(() => undefined);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input type="hidden" name="assets" value={JSON.stringify(assets.map(({ preview: _p, ...a }) => a))} />
      <label className="bw-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files); }}>
        <input ref={input} type="file" accept={imagesOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,video/mp4,video/quicktime"} multiple onChange={(e) => void add(e.target.files)} />
        <span className="ic" aria-hidden>{busy ? "…" : "＋"}</span>
        <b style={{ fontWeight: 600 }}>{busy ? "Uploading…" : imagesOnly ? "Upload images as cards" : "Add images or a video"}</b>
        <span className="sub" style={{ margin: 0, fontSize: 12 }}>{imagesOnly ? "Drop images here or click. Each one becomes a card. Up to 10 (JPG, PNG, WebP, 8 MB each)." : "Drop files here or click. Up to 10 images (JPG, PNG, WebP, 8 MB each) or one video (MP4 or MOV, 50 MB)."}</span>
      </label>
      {error && <div role="alert" style={{ color: "var(--neg)", fontSize: 13 }}>{error}</div>}
      {assets.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
          {assets.map((a) => (
            <div key={a.path} className="bw-asset">
              {a.kind === "video"
                ? <video src={a.preview} muted playsInline preload="metadata" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={a.preview} alt="" />}
              <span className="tag mono">{a.kind === "video" ? `${Math.round(a.seconds ?? 0)}s · ` : ""}{ratioName(a.w, a.h)}</span>
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => void remove(a)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
