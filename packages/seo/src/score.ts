import type { PageData } from "./analyze";
import type { CrawlResult } from "./crawl";

export type Dimension = "seo" | "geo" | "aeo";
export type Status = "good" | "attention" | "missing" | "not_measured";
/** What kind of fix the AI can draft for a finding (or "manual" when only the owner can act). */
export type FixKind = "meta_title" | "meta_description" | "h1" | "alt_text" | "faq" | "schema_org" | "definition" | "about_page" | "contact_page" | "open_graph" | "content" | "manual";
export interface Finding { dimension: Dimension; group: string; signal: string; finding: string; status: Status; weight: number; pageUrl?: string; fixKind?: FixKind }
export interface AuditScore {
  scores: Record<Dimension, number>; findings: Finding[]; summary: string;
  stats: { pages: number; words: number; titles: number; goodSignals: number; attentionSignals: number; missingSignals: number };
}

const PLATFORM_HOSTS = /\.(vercel\.app|netlify\.app|github\.io|pages\.dev|herokuapp\.com|onrender\.com|web\.app|firebaseapp\.com|wixsite\.com|blogspot\.com|webflow\.io|framer\.website|carrd\.co|squarespace\.com)$/i;
const PLACEHOLDER = /(coming soon|being set up|lorem ipsum|\btbd\b|\btodo\b|under construction|your (text|email|company) here)/i;
const TRUST = /(testimonial|case stud(y|ies)|customer stor(y|ies)|trusted by|our clients|customer reviews|\d(\.\d)?\s?\/\s?5 stars?|5-star)/i;
const ABOUT = /\/(about|about-us|team|our-team|company|our-story|who-we-are)(\/|$)/i;
const CONTACT = /\/(contact|contact-us|support|get-in-touch)(\/|$)/i;
const POLICY = /\/(privacy|terms|cookie|legal)/i;
const SOCIAL = /(facebook|twitter|x|instagram|linkedin|youtube|tiktok|pinterest)\.com$|^t\.co$/i;
const DEFINITION = /\b[A-Z][\w.-]{1,30}\s+(is|are)\s+(an?|the|one of)\s/;

const pts = (s: Status) => (s === "good" ? 1 : s === "attention" ? 0.5 : 0);
const toScore = (fs: Finding[]) => {
  const live = fs.filter((f) => f.status !== "not_measured");
  const w = live.reduce((a, f) => a + f.weight, 0);
  if (w === 0) return 1;
  let n = Math.max(1, Math.min(10, Math.round(1 + 9 * (live.reduce((a, f) => a + f.weight * pts(f.status), 0) / w))));
  // A 10 means nothing is left to improve; a heavy missing signal keeps a dimension out of the top band.
  if (live.some((f) => f.status !== "good")) n = Math.min(n, 9);
  if (live.some((f) => f.status === "missing" && f.weight >= 3)) n = Math.min(n, 8);
  return n;
};

export function scoreAudit(crawl: Extract<CrawlResult, { ok: true }>): AuditScore {
  const { pages, files } = crawl;
  const home = pages[0]!;
  const host = new URL(crawl.startUrl).hostname;
  const F: Finding[] = [];
  const add = (dimension: Dimension, group: string, signal: string, status: Status, finding: string, weight: number, extra: Partial<Finding> = {}) => F.push({ dimension, group, signal, status, finding, weight, ...extra });
  const allLinks = pages.flatMap((p) => p.internalLinks);
  const totalWords = pages.reduce((a, p) => a + p.wordCount, 0);
  const dupes = (vals: (string | null)[]) => { const m = new Map<string, number>(); vals.filter((v): v is string => !!v).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)); return [...m.values()].filter((n) => n > 1).length; };
  const indexable = pages.filter((p) => !/noindex/i.test(p.robotsMeta ?? ""));
  // One entry per path (query-string variants are the same page) and only pages meant to be indexed.
  const uniq = [...new Map(indexable.map((p) => [new URL(p.url).pathname, p])).values()];

  // ================= SEO =================
  const T = home.titleLen;
  add("seo", "Technical On-Page", "Title tag", !home.title ? "missing" : T >= 30 && T <= 60 ? "good" : "attention",
    !home.title ? "The homepage has no title tag." : `Homepage title is ${T} characters: “${home.title}”.${T > 60 ? " Over ~60, so it may be cut off in results." : T < 30 ? " Short, so it may not describe the page well." : ""}`, 3, { pageUrl: home.url, fixKind: "meta_title" });
  const D = home.metaDescriptionLen;
  add("seo", "Technical On-Page", "Meta description", !home.metaDescription ? "missing" : D >= 70 && D <= 160 ? "good" : "attention",
    !home.metaDescription ? "The homepage has no meta description." : `Homepage description is ${D} characters.${D > 160 ? " Over ~160, so it may be cut off." : D < 70 ? " Short; use the space to say what the page offers." : ""}`, 3, { pageUrl: home.url, fixKind: "meta_description" });
  const dd = dupes(uniq.map((p) => p.metaDescription)), dt = dupes(uniq.map((p) => p.title));
  const noDesc = uniq.filter((p) => !p.metaDescription).length;
  add("seo", "Technical On-Page", "Unique titles and descriptions", uniq.length < 2 ? "not_measured" : dd + dt === 0 && noDesc === 0 ? "good" : noDesc > uniq.length / 2 || dd + dt > 1 ? "missing" : "attention",
    uniq.length < 2 ? "Only one indexable page was crawled, so duplicates could not be checked." : `${dt} duplicated title(s), ${dd} duplicated description(s), ${noDesc} indexable page(s) without a description.`, 2, { fixKind: "meta_description" });
  const badH1 = pages.filter((p) => p.h1.length !== 1);
  add("seo", "Technical On-Page", "Headings (H1)", home.h1.length === 0 ? "missing" : badH1.length === 0 ? "good" : "attention",
    home.h1.length === 0 ? "The homepage has no H1." : badH1.length === 0 ? `Every crawled page has exactly one H1 (homepage: “${home.h1[0]}”).` : `${badH1.length} of ${pages.length} pages have no H1 or more than one.`, 3, { pageUrl: badH1[0]?.url ?? home.url, fixKind: "h1" });
  const brokenN = crawl.broken?.length ?? 0, b0 = crawl.broken?.[0];
  add("seo", "Technical On-Page", "Broken internal links", crawl.linksChecked === undefined ? "not_measured" : brokenN === 0 ? "good" : brokenN <= 2 ? "attention" : "missing",
    crawl.linksChecked === undefined ? "Links were not checked." : brokenN === 0 ? `All ${crawl.linksChecked} internal URLs checked answered normally.` : `${brokenN} of ${crawl.linksChecked} internal URLs checked are broken, e.g. ${new URL(b0!.url).pathname} (${b0!.status ?? "no response"})${b0!.from[0] ? `, linked from ${b0!.from[0]}` : ""}.`, 3, { pageUrl: b0?.url, fixKind: "manual" });
  add("seo", "Technical On-Page", "Canonical tag", home.canonical ? "good" : "missing", home.canonical ? `Homepage canonical: ${home.canonical}.` : "No canonical tag on the homepage, so duplicate URLs may compete with each other.", 2, { pageUrl: home.url, fixKind: "manual" });
  const noindexHome = /noindex/i.test(home.robotsMeta ?? "");
  add("seo", "Technical On-Page", "Indexability", noindexHome || files.robots.blocksAll ? "missing" : "good", noindexHome ? "The homepage has a noindex tag, so search engines are told to ignore it." : files.robots.blocksAll ? "robots.txt blocks our crawler (and likely search engines) from the whole site." : `No accidental noindex found on ${indexable.length} indexable page(s).`, 3, { fixKind: "manual" });
  add("seo", "Technical On-Page", "Mobile and language tags", home.viewport && home.lang ? "good" : "attention", `Viewport ${home.viewport ? "present" : "missing"}; page language ${home.lang ? `“${home.lang}”` : "missing"}.`, 1, { fixKind: "manual" });
  const miss = pages.reduce((a, p) => a + p.images.missingAlt, 0), imgs = pages.reduce((a, p) => a + p.images.total, 0);
  add("seo", "Technical On-Page", "Image alt text", imgs === 0 ? "not_measured" : miss === 0 ? "good" : miss / imgs <= 0.25 ? "attention" : "missing", imgs === 0 ? "No images found." : `${miss} of ${imgs} images have no alt attribute (decorative images may use an empty alt).`, 2, { fixKind: "alt_text" });
  add("seo", "Technical On-Page", "Internal links", home.internalLinks.length >= 5 ? "good" : home.internalLinks.length > 0 ? "attention" : "missing", `${home.internalLinks.length} internal link(s) on the homepage; ${new Set(allLinks).size} distinct internal URLs across ${pages.length} page(s).`, 1, { fixKind: "manual" });
  const ogHave = ["og:title", "og:description", "og:image"].filter((x) => home.og.includes(x)).length + (home.twitter.includes("twitter:card") ? 1 : 0);
  add("seo", "Technical On-Page", "Social sharing tags", ogHave === 4 ? "good" : ogHave > 0 ? "attention" : "missing", `${ogHave} of 4 key Open Graph / Twitter tags found on the homepage (title, description, image, card).`, 2, { pageUrl: home.url, fixKind: "open_graph" });
  add("seo", "Technical On-Page", "robots.txt", files.robots.blocksAll ? "missing" : files.robots.present ? "good" : "attention", files.robots.present ? "robots.txt found." : "No robots.txt found. Not required, but it is the standard place to point crawlers to your sitemap.", 2, { fixKind: "manual" });
  add("seo", "Technical On-Page", "XML sitemap", files.sitemap.present ? "good" : "attention", files.sitemap.present ? `Sitemap found with ${files.sitemap.urlCount} URL(s).` : "No XML sitemap found. A sitemap helps search engines discover every page.", 2, { fixKind: "manual" });
  add("seo", "Technical On-Page", "HTTPS", crawl.startUrl.startsWith("https://") ? "good" : "missing", crawl.startUrl.startsWith("https://") ? "The site is served over HTTPS." : "The site is not served over HTTPS, which hurts rankings and trust.", 3, { fixKind: "manual" });
  const hdr = home.headers, secCount = [hdr.hsts, hdr.contentTypeOptions, hdr.referrerPolicy, hdr.frameProtection].filter(Boolean).length;
  add("seo", "Technical On-Page", "Security headers", secCount === 4 ? "good" : secCount >= 2 ? "attention" : "missing", `${secCount} of 4 recommended headers present (HSTS, X-Content-Type-Options, Referrer-Policy, frame protection).`, 1, { fixKind: "manual" });
  add("seo", "Technical On-Page", "Custom domain", PLATFORM_HOSTS.test(host) ? "attention" : "good", PLATFORM_HOSTS.test(host) ? `${host} is a hosting-platform subdomain. A domain you own builds authority and lets you verify the site in search tools.` : `${host} is a domain of its own.`, 2, { fixKind: "manual" });
  add("seo", "Technical On-Page", "Server response speed", home.ms < 800 ? "good" : home.ms < 1800 ? "attention" : "missing", `Homepage responded in ${home.ms} ms from one location (server response only; Core Web Vitals need PageSpeed Insights).`, 1, { fixKind: "manual" });
  add("seo", "Content", "Homepage content depth", home.wordCount >= 300 ? "good" : home.wordCount >= 100 ? "attention" : "missing", `${home.wordCount} words of visible text on the homepage.`, 2, { pageUrl: home.url, fixKind: "content" });
  add("seo", "Content", "Site size", uniq.length >= 10 ? "good" : uniq.length >= 3 ? "attention" : "missing", `${uniq.length} indexable page(s) found${crawl.capped ? " (crawl limit reached)" : ""}. More useful pages give search engines more to rank.`, 2, { fixKind: "content" });
  add("seo", "Structured Data", "Structured data present", home.jsonLdInvalid > 0 ? "attention" : home.jsonLdTypes.length > 0 ? "good" : "missing", home.jsonLdInvalid > 0 ? `${home.jsonLdInvalid} JSON-LD block(s) on the homepage could not be parsed.` : home.jsonLdTypes.length ? `Schema types on the homepage: ${home.jsonLdTypes.join(", ")}.` : "No structured data (JSON-LD) on the homepage.", 2, { pageUrl: home.url, fixKind: "schema_org" });

  // ================= GEO =================
  const allUrls = new Set([...pages.map((p) => p.url), ...allLinks]);
  const hasAbout = [...allUrls].some((u) => ABOUT.test(new URL(u).pathname));
  add("geo", "E-E-A-T", "About page / who is behind the site", hasAbout ? "good" : "missing", hasAbout ? "An About or team page is linked." : "No About or team page found. AI engines weigh who is behind a source.", 4, { fixKind: "about_page" });
  const hasContact = pages.some((p) => p.hasMailto || p.hasTel) || [...allUrls].some((u) => CONTACT.test(new URL(u).pathname));
  const placeholder = pages.find((p) => PLACEHOLDER.test(p.text));
  add("geo", "E-E-A-T", "Contact information", placeholder ? "attention" : hasContact ? "good" : "missing",
    placeholder ? `Placeholder text such as “${(placeholder.text.match(PLACEHOLDER) ?? [""])[0]}” is live on ${placeholder.url}.` : hasContact ? "A contact page, email or phone number is available." : "No contact page, email or phone number found.", 4, { pageUrl: placeholder?.url, fixKind: "contact_page" });
  const orgTypes = ["Organization", "LocalBusiness", "Person", "Corporation", "ProfessionalService"];
  add("geo", "E-E-A-T", "Organization schema", pages.some((p) => p.jsonLdTypes.some((t) => orgTypes.includes(t))) ? "good" : "missing", pages.some((p) => p.jsonLdTypes.some((t) => orgTypes.includes(t))) ? "Organization (or similar) markup identifies the brand." : "No Organization markup to declare who you are to search and AI engines.", 2, { fixKind: "schema_org" });
  add("geo", "E-E-A-T", "Brand profiles (sameAs)", pages.some((p) => p.hasSameAs) ? "good" : "missing", pages.some((p) => p.hasSameAs) ? "sameAs links tie the brand to its profiles." : "No sameAs links to your social or business profiles in structured data.", 3, { fixKind: "schema_org" });
  const trustHit = TRUST.test(home.text) || allLinks.some((l) => TRUST.test(l));
  add("geo", "E-E-A-T", "Trust signals (proof)", trustHit ? "good" : "missing", trustHit ? "Testimonials, reviews or case studies are referenced." : "No testimonials, reviews, case studies or customer proof found.", 3, { fixKind: "content" });
  add("geo", "E-E-A-T", "Policies", allLinks.some((l) => POLICY.test(new URL(l).pathname)) ? "good" : "attention", allLinks.some((l) => POLICY.test(new URL(l).pathname)) ? "Privacy or terms pages are linked." : "No privacy or terms page found.", 1, { fixKind: "manual" });
  const ext = [...new Set(pages.flatMap((p) => p.externalHosts))].filter((h) => !SOCIAL.test(h));
  add("geo", "Content for AI", "Cites outside sources", ext.length >= 1 ? "good" : "attention", ext.length ? `Links out to ${ext.length} outside site(s), e.g. ${ext.slice(0, 2).join(", ")}.` : "No links to outside sources; AI engines favour content that cites authoritative references.", 1, { fixKind: "content" });
  const stats = (home.text.match(/\d[\d,.]*\s?(%|percent|years?|customers|clients|projects)/gi) ?? []).length;
  add("geo", "Content for AI", "Facts and figures", stats >= 3 ? "good" : stats >= 1 ? "attention" : "missing", `${stats} concrete figure(s) found in the homepage text. Specific, verifiable facts are easier for AI engines to cite.`, 1, { fixKind: "content" });
  add("geo", "Content for AI", "Depth of content", pages.length >= 10 && totalWords >= 2000 ? "good" : "attention", `${totalWords} words across ${pages.length} crawled page(s).`, 1, { fixKind: "content" });
  add("geo", "Technical GEO", "AI crawlers allowed", files.robots.blockedBots.filter((b) => b !== "Googlebot" && b !== "Bingbot").length === 0 ? "good" : "attention", files.robots.blockedBots.length ? `robots.txt blocks: ${files.robots.blockedBots.join(", ")}. This may be intentional, but it removes the site from those engines.` : "robots.txt does not block major search or AI crawlers.", 2, { fixKind: "manual" });
  add("geo", "Technical GEO", "Content visible without JavaScript", home.wordCount >= 100 ? "good" : "attention", home.wordCount >= 100 ? "The homepage text is in the HTML itself." : "Very little text in the HTML. If the page is built with JavaScript, some crawlers and AI engines may see an empty page.", 2, { fixKind: "manual" });
  const types = new Set(pages.flatMap((p) => p.jsonLdTypes));
  add("geo", "Technical GEO", "Structured data depth", types.size >= 2 ? "good" : types.size === 1 ? "attention" : "missing", `${types.size} distinct schema type(s) across the site.`, 1, { fixKind: "schema_org" });

  // ================= AEO =================
  const faqPage = pages.find((p) => p.faqSchema), faqLike = pages.some((p) => p.details >= 2);
  add("aeo", "Structured Answers", "FAQ markup", faqPage ? "good" : faqLike ? "attention" : "missing", faqPage ? `FAQPage markup found on ${faqPage.url}.` : faqLike ? "FAQ-style content exists but has no FAQPage markup." : "No FAQ content or FAQPage markup.", 3, { fixKind: "faq" });
  const q = pages.reduce((a, p) => a + p.questionHeadings, 0);
  add("aeo", "Structured Answers", "Question-style headings", q >= 3 ? "good" : q >= 1 ? "attention" : "missing", `${q} heading(s) phrased as questions across the site. They map directly to how people search.`, 2, { fixKind: "faq" });
  const defHit = DEFINITION.test(home.text.slice(0, 1500)) || home.h2.some((h) => /^what (is|are)\b/i.test(h));
  add("aeo", "Featured Snippets", "Plain definition", defHit ? "good" : "attention", defHit ? "The homepage contains a clear “X is …” definition." : "No plain “X is …” sentence near the top; snippets and voice answers favour one.", 2, { pageUrl: home.url, fixKind: "definition" });
  add("aeo", "Featured Snippets", "Lists", pages.some((p) => p.lists > 0) ? "good" : "attention", pages.some((p) => p.lists > 0) ? "Lists are used, which can appear as list snippets." : "No bulleted or numbered lists found.", 1, { fixKind: "content" });
  add("aeo", "Featured Snippets", "Comparison tables", pages.some((p) => p.tables > 0) ? "good" : "attention", pages.some((p) => p.tables > 0) ? "A table is present." : "No tables. A comparison table is a natural snippet candidate.", 1, { fixKind: "content" });

  const scores = { seo: toScore(F.filter((f) => f.dimension === "seo")), geo: toScore(F.filter((f) => f.dimension === "geo")), aeo: toScore(F.filter((f) => f.dimension === "aeo")) };
  const live = F.filter((f) => f.status !== "not_measured");
  const worst = [...live].filter((f) => f.status !== "good").sort((a, b) => b.weight * (1 - pts(b.status)) - a.weight * (1 - pts(a.status))).slice(0, 3).map((f) => f.signal.toLowerCase());
  return {
    scores, findings: F,
    summary: `SEO ${scores.seo}/10, GEO ${scores.geo}/10, AEO ${scores.aeo}/10 across ${pages.length} page(s).${worst.length ? ` Biggest opportunities: ${worst.join(", ")}.` : " No major issues found."}`,
    stats: { pages: pages.length, words: totalWords, titles: pages.filter((p) => p.title).length, goodSignals: live.filter((f) => f.status === "good").length, attentionSignals: live.filter((f) => f.status === "attention").length, missingSignals: live.filter((f) => f.status === "missing").length },
  };
}
