import * as cheerio from "cheerio";

export interface PageData {
  url: string; status: number; ms: number; bytes: number;
  title: string | null; titleLen: number; metaDescription: string | null; metaDescriptionLen: number;
  canonical: string | null; robotsMeta: string | null; lang: string | null; viewport: boolean;
  og: string[]; twitter: string[];
  h1: string[]; h2: string[]; h3Count: number; questionHeadings: number;
  wordCount: number; /** First ~1500 characters of visible text, for AI drafting (untrusted content). */ excerpt: string;
  images: { total: number; withAlt: number; emptyAlt: number; missingAlt: number };
  internalLinks: string[]; externalHosts: string[];
  jsonLdTypes: string[]; jsonLdInvalid: number; hasSameAs: boolean; faqSchema: boolean;
  lists: number; tables: number; details: number;
  hasMailto: boolean; hasTel: boolean; text: string;
  headers: { hsts: boolean; contentTypeOptions: boolean; referrerPolicy: boolean; frameProtection: boolean };
}

const SKIP_LINK = /^(#|mailto:|tel:|javascript:|data:)/i;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export function analyzePage(html: string, meta: { url: string; status: number; ms: number; headers: Record<string, string> }): PageData {
  const $ = cheerio.load(html);
  const base = new URL(meta.url);
  const title = norm($("head title").first().text()) || null;
  const desc = $('meta[name="description" i]').attr("content")?.trim() || null;
  const metaNames = (sel: string, attr: string) => $(sel).map((_, e) => $(e).attr(attr) ?? "").get().filter(Boolean);

  // JSON-LD
  const types = new Set<string>(); let invalid = 0, sameAs = false, faq = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          const t = o["@type"]; (Array.isArray(t) ? t : t ? [t] : []).forEach((x) => { types.add(String(x)); if (x === "FAQPage") faq = true; });
          if (o.sameAs) sameAs = true;
          if (o["@graph"]) walk(o["@graph"]);
          if (o.mainEntity) walk(o.mainEntity);
        }
      };
      walk(JSON.parse($(el).contents().text()));
    } catch { invalid++; }
  });

  // visible text
  const $body = cheerio.load($("body").html() ?? "");
  $body("script, style, noscript, template").remove();
  const text = norm($body.root().text());

  // links
  const internal = new Set<string>(), external = new Set<string>();
  let mailto = false, tel = false;
  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") ?? "").trim();
    if (/^mailto:/i.test(href)) mailto = true;
    if (/^tel:/i.test(href)) tel = true;
    if (!href || SKIP_LINK.test(href)) return;
    try {
      const u = new URL(href, base); u.hash = "";
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      if (u.hostname === base.hostname) internal.add(u.toString()); else external.add(u.hostname);
    } catch { /* ignore */ }
  });

  // images
  const imgs = $("img").toArray();
  const alt = (e: (typeof imgs)[number]) => $(e).attr("alt");
  const headings = (sel: string) => $(sel).map((_, e) => norm($(e).text())).get().filter(Boolean);
  const h2 = headings("h2"), h3 = headings("h3");
  const h = meta.headers;

  return {
    url: meta.url, status: meta.status, ms: meta.ms, bytes: Buffer.byteLength(html),
    title, titleLen: title?.length ?? 0, metaDescription: desc, metaDescriptionLen: desc?.length ?? 0,
    canonical: $('link[rel="canonical" i]').attr("href") ?? null, robotsMeta: $('meta[name="robots" i]').attr("content") ?? null,
    lang: $("html").attr("lang") ?? null, viewport: $('meta[name="viewport" i]').length > 0,
    og: metaNames('meta[property^="og:"]', "property"), twitter: metaNames('meta[name^="twitter:"]', "name"),
    h1: headings("h1"), h2, h3Count: h3.length, questionHeadings: [...h2, ...h3].filter((x) => /\?$/.test(x)).length,
    wordCount: text ? text.split(" ").length : 0, excerpt: text.slice(0, 1500), text,
    images: { total: imgs.length, withAlt: imgs.filter((e) => (alt(e) ?? "").trim() !== "").length, emptyAlt: imgs.filter((e) => alt(e) === "").length, missingAlt: imgs.filter((e) => alt(e) === undefined).length },
    internalLinks: [...internal], externalHosts: [...external],
    jsonLdTypes: [...types], jsonLdInvalid: invalid, hasSameAs: sameAs, faqSchema: faq,
    lists: $("ul, ol").length, tables: $("table").length, details: $("details").length, hasMailto: mailto, hasTel: tel,
    headers: {
      hsts: !!h["strict-transport-security"], contentTypeOptions: !!h["x-content-type-options"], referrerPolicy: !!h["referrer-policy"],
      frameProtection: !!h["x-frame-options"] || /frame-ancestors/i.test(h["content-security-policy"] ?? ""),
    },
  };
}
