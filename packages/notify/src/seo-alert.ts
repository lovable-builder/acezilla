const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DIM = { seo: "SEO", geo: "GEO", aeo: "AEO" } as const;

export interface SeoAlertInput {
  host: string; url: string;
  scores: { seo: number; geo: number; aeo: number };
  drops: { dimension: "seo" | "geo" | "aeo"; from: number; to: number }[];
  reasons: string[]; fixed: string[];
}

/** Weekly SEO email: only sent when a score fell or something important broke. */
export function renderSeoEmail(o: SeoAlertInput) {
  const subject = o.drops.length ? `${o.host}: ${o.drops.map((d) => `${DIM[d.dimension]} ${d.from}→${d.to}`).join(", ")} in this week's SEO check` : `${o.host}: something important changed in this week's SEO check`;
  const lines = [
    ...o.drops.map((d) => `${DIM[d.dimension]} score fell from ${d.from} to ${d.to}`),
    ...o.reasons,
  ];
  const good = o.fixed.length ? `Improved since last week: ${o.fixed.slice(0, 5).join(", ")}.` : "";
  const li = lines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F6F5F2;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#17161B">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="font-weight:700;font-size:18px;letter-spacing:-0.03em;margin-bottom:20px">acezilla</div>
  <div style="background:#fff;border:1px solid rgba(23,22,27,.09);border-radius:14px;padding:28px">
    <h1 style="margin:0 0 10px;font-size:22px;letter-spacing:-0.02em">${esc(o.host)} slipped this week</h1>
    <p style="margin:0 0 12px;color:#55535D;line-height:1.6;font-size:15px">Scores now: SEO ${o.scores.seo}/10, GEO ${o.scores.geo}/10, AEO ${o.scores.aeo}/10.</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#17161B;line-height:1.5;font-size:15px">${li}</ul>
    ${good ? `<p style="margin:0 0 18px;color:#55535D;line-height:1.6;font-size:14px">${esc(good)}</p>` : ""}
    <a href="${esc(o.url)}" style="display:inline-block;background:#7C5CFF;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:14px">See what changed</a>
  </div>
  <p style="color:#86838F;font-size:12px;margin:18px 4px 0;line-height:1.6">You get this because weekly monitoring is on for ${esc(o.host)}. Turn it off on the site's SEO page. acezilla only reads your public pages and never changes your website.</p>
</div></body></html>`;
  const text = `${o.host} slipped this week\n\nScores now: SEO ${o.scores.seo}/10, GEO ${o.scores.geo}/10, AEO ${o.scores.aeo}/10.\n\n${lines.map((l) => `- ${l}`).join("\n")}\n${good ? `\n${good}\n` : ""}\nSee what changed: ${o.url}\n\nYou get this because weekly monitoring is on for ${o.host}.`;
  return { subject, html, text };
}
