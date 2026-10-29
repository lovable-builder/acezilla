"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 8 * 1048576;

/** One screenshot of the competitor's ad. It goes to this workspace's private folder; the form saves only its path. */
export function ScreenshotUpload({ workspaceId }: { workspaceId: string }) {
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (!EXT[file.type]) return setError("Use a JPG, PNG or WebP image.");
    if (file.size > MAX) return setError(`That file is ${Math.round(file.size / 1048576)} MB. Images can be up to 8 MB.`);
    setBusy(true);
    const sb = createClient();
    const next = `${workspaceId}/competitors/${crypto.randomUUID().replace(/-/g, "")}.${EXT[file.type]}`;
    const { error: e } = await sb.storage.from("creatives").upload(next, file, { contentType: file.type, upsert: false });
    if (e) setError(`Could not upload: ${e.message}`);
    else {
      if (path) await sb.storage.from("creatives").remove([path]).catch(() => undefined);
      if (preview) URL.revokeObjectURL(preview);
      setPath(next); setPreview(URL.createObjectURL(file));
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function clear() {
    if (path) await createClient().storage.from("creatives").remove([path]).catch(() => undefined);
    if (preview) URL.revokeObjectURL(preview);
    setPath(""); setPreview("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="hidden" name="image_path" value={path} />
      <span className="eyebrow">Screenshot (optional)</span>
      {preview ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
          <button type="button" className="btn" style={{ background: "transparent", color: "var(--ink2)", border: "1px solid var(--line2)" }} onClick={() => void clear()}>Remove</button>
        </div>
      ) : (
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="field" disabled={busy} onChange={(e) => void pick(e.target.files)} />
      )}
      {busy && <span className="sub" style={{ margin: 0, fontSize: 12 }}>Uploading…</span>}
      {error && <div role="alert" style={{ color: "var(--neg)", fontSize: 13 }}>{error}</div>}
    </div>
  );
}
