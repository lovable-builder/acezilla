"use client";
import { useState } from "react";
import { placementsFor, PLACEMENTS, type MediaPlatform } from "@acezilla/models";
import { AdPreview, type PreviewProps } from "./ad-preview";

/**
 * Previews an ad in each place it can show: Facebook and Instagram feed, Stories, Reels, TikTok's For You feed, Google's results
 * and display. Switch placements to see the real shape and what the app draws over the picture. One or several ads can be shown together.
 */
export function PreviewSwitcher({ platform, format, items, columns = 1, label }: { platform: MediaPlatform; format: string; items: (Omit<PreviewProps, "platform" | "format" | "placement" | "safeZones"> & { title?: React.ReactNode })[]; columns?: number; label?: string }) {
  const options = placementsFor(platform, format);
  const [chosen, setChosen] = useState(options[0]!.id);
  const [safe, setSafe] = useState(false);
  // Changing platform or format changes the options: fall back to the first one that still exists.
  const placement = options.some((o) => o.id === chosen) ? chosen : options[0]!.id;
  const current = PLACEMENTS.find((p) => p.id === placement)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {label && <span className="eyebrow">{label}</span>}
        {options.length > 1 && (
          <div className="cp-seg" role="tablist" aria-label="Placement">
            {options.map((o) => <button key={o.id} type="button" role="tab" aria-selected={placement === o.id} aria-pressed={placement === o.id} onClick={() => setChosen(o.id)}>{o.label}</button>)}
          </div>
        )}
        <span className="mono tabnum" style={{ fontSize: 11, color: "var(--ink3)" }}>{current.ratioLabel}</span>
        {current.fullScreen && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
            <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Show safe zones
          </label>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${columns > 1 ? 250 : 240}px,1fr))`, gap: 16 }}>
        {items.map(({ title, ...it }, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            {title}
            <AdPreview {...it} platform={platform} format={format} placement={placement} safeZones={safe} />
          </div>
        ))}
      </div>
    </div>
  );
}
