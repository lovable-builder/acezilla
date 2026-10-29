# acezilla architecture

A suggest-only AI marketing workspace for online sellers. It reads ad platforms, stores and marketplaces, compares what platforms claim with what customers really bought, and drafts next steps that a person approves.

## Layout (npm workspaces + Turborepo, TypeScript strict)

```
apps/web             Next.js 15 App Router, deployed on Vercel (region dub1)
apps/worker          placeholder, unused
packages/connectors  Meta, Google, Google Analytics 4, Google Merchant Center, Google Search Console, Allegro, WooCommerce, CSV and mock, all producing one normalised Dataset
packages/models      Pure business maths: dashboard, store sales, insights, attribution, marketplace profit,
                     AI prompts/schemas/parsers, planner maths (`planner.ts`: spend-to-revenue curves, budget split, flight forecast), profit forecast (`forecast.ts`: seeded Monte Carlo of clicks, conversions and returns after channel fees, break-even maths, sensitivity). No I/O
packages/seo         SEO engine: SSRF guard, crawler, analyzer, scorer, report, fix parsing
packages/llm         Provider-independent LLM core: error kinds, URL builders, response parsing, credential decoding
packages/notify      Resend email sender, alert and SEO email templates
packages/db          SQL migrations 0001-0023 (applied through the Supabase MCP)
plugins/acezilla-for-woocommerce   PHP plugin; scripts/build-plugin.sh zips it into apps/web/public/downloads
```

## The rules the architecture follows

1. **Logic lives in packages and is tested** with `node --test` (connectors are tested with mocked HTTP). Web code only wires data, auth and UI.
2. **Suggest-only.** Connections are read-only. Nothing writes to an ad platform. Campaign drafts are copied out by a person.
3. **Every tenant table has `workspace_id` and row-level security** (`private.is_member`). The browser reads with the user's session. Writes and secrets use the service-role client, server-side only.
4. **One `connection` row per platform per workspace.** Tokens are AES-256-GCM encrypted in `token_enc`; platform detail goes in the `stats` jsonb. The browser can never select token columns.
5. **Everything normalises into shared tables:** `ad_account -> campaign -> ad_group -> ad -> insight_daily`, plus `order`, `order_line`, `marketplace_fee`, `offer_cost`, `offer_stats_snapshots`.
6. **Numbers are honest.** Show store ROAS next to platform ROAS. Platforms that report no revenue (Allegro ads) are never given invented results.
7. **Design tokens only** (CSS variables in `globals.css`); figures use `tabular-nums`.

## Web app (`apps/web`)

- **Routes.** `(marketing)` is the public landing page. `(app)` is the signed-in app (noindex). Public routes are an allowlist in `middleware.ts`.
- **App pages:** dashboard (Command center), attribution, competitors (`competitors/`: competitors tagged with your category and the ads saved by hand from the public ad libraries, table `competitor` and `competitor_ad`, screenshots in the private `creatives` bucket under `<workspace>/competitors/`; `packages/models/src/competitor.ts` ranks ads by days running and gives a hint signal, never a performance claim, because competitor spend and sales are not visible; Google's Transparency Center link is filled with the competitor's website domain; the Meta Ad Library can be imported per competitor (`importMetaAds` in `competitors/actions.ts`, `fetchMetaLibraryAds` in `packages/connectors/src/meta.ts`, `groupLibraryAds`/`pageMatches`/`guessAngle` in `competitor.ts`): read-only, uses the stored Meta login, keeps only ads whose page name matches, groups versions with the same words into one ad with variants, builds its own library link because Meta's snapshot link carries the access token, and re-importing updates dates and variants through `competitor_ad.external_id` without overwriting a person's edits; it only answers for Facebook accounts Meta has approved for the Ad Library API (error 10 / subcode 2332002 becomes a plain instruction); TikTok is only opened by link), connections (+ a page per platform), seo, workspace, copilot, builder. Planner is built (`planner/`: budget split per platform from weekly response curves, flights saved in `plan`/`flight`, forecast with an 80% range; suggestions only). Profit forecaster (`forecaster/`, client component `components/forecaster/`, starting numbers from `lib/forecast-defaults.ts`: CPC, conversion rate and wobble from the last 90 days of ads, Allegro Ads cost per click and orders per click from the uploaded Ads report via `reportStats`, Allegro commission and costs from your own data, every destination (website, Allegro, TikTok Shop, Google products, Instagram/Meta/WhatsApp Shop) is open for every ad platform and each has its own editable fees (`DESTINATIONS` in `forecast.ts` only orders the natural ones first), and fees other than Allegro's are labelled typical values (shops that are not open yet start at zero); nothing is stored, nothing is sent; every field and result has a plain-English hover explanation from `lib/glossary.ts`, plus a "How does this work?" section and an "In plain words" summary of the user's own numbers). Creative and rules are still explainer pages (`lib/feature-content.ts`).
- **API routes:** `api/connect/{meta,google,ga4,allegro,woocommerce}` (OAuth, plugin pairing and signed events) and `api/cron/{sync,seo}`.
- **Cron** (`vercel.json`): sync daily 05:00 UTC, SEO re-audits Mondays 06:00 UTC. Both require `Authorization: Bearer $CRON_SECRET`.
- **`lib/` modules:** `sync.ts` and `ingest.ts` (pull and store), `allegro.ts` (tokens and sync), `data.ts` (shared loaders), `ai-brief.ts` (snapshot for the AI), `seo-runner.ts` and `seo-monitor.ts`, WooCommerce products, stock and order lines (plugin 1.4.0, product photo galleries, tables `store_product` and `campaign_product` (campaign to product link; `lib/campaign-products.ts`), page `products`), Allegro Ads report import (`allegro-ads-report.ts` parser, table `offer_ad_report`, actions in `attribution/actions.ts`), `seo-fixes.ts`, `llm/` (providers), `ai-guard.ts` (daily limits: copilot 40, summary 6, builder 20, pricing 15; friendly errors), `alerts.ts`, `crypto.ts`, `currency.ts`, `workspace.ts`, `period.ts` (URL period plus the saved default in cookie `az_view`), `glossary.ts`, `packages/models/src/pricing.ts` (break-even price, max sourcing cost, what-if maths, AI pricing advice) with `components/attribution/pricing-advisor.tsx`; the Attribution page has a store switcher (`?store=allegro|woocommerce`, TikTok Shop later) and `buildStoreProductProfit` for stores without marketplace fees, `packages/models/src/media.ts` (platform specs, budget guide, campaign advice), `components/builder/` (guided builder, carousel built card by card in `carousel-cards.tsx`, per-placement ad previews at real shapes (`preview-switcher.tsx`), `creative-upload.tsx` to the private `creatives` bucket), `components/dash/bars.tsx` and `gadgets.tsx` (animated gauge, donut, claimed-vs-real bars, count-up; motion is CSS in `globals.css` and honours reduced-motion) (hover explanations used by `components/app/term.tsx`). Setup progress is `components/app/checklist.tsx`.

## Connection patterns

| Platform | Pattern |
|---|---|
| Meta, Google Ads | OAuth, daily pull into the shared ad tables |
| Google Analytics 4 | Separate OAuth (`analytics.readonly`, own `connection` row, platform `ga4`). Daily pull of sessions, key events and purchase revenue per channel group into `analytics_property` and `analytics_daily` (`packages/connectors/src/ga4.ts`, `lib/ga4.ts`). Shown on Attribution (`components/attribution/traffic-panel.tsx`, maths in `packages/models/src/traffic.ts`): visits per channel, and Meta/TikTok clicks versus Paid Social visits and Google clicks versus Google channels, with a plain verdict (visits per click 60-130% is healthy). Reuses the Google Ads redirect URI (`/api/connect/google/callback`, told apart by cookie `az_google_kind`). Needs the Analytics Admin and Data APIs enabled |
| Google Search Console | Separate OAuth (`auth/webmasters.readonly`, own `connection` row, platform `searchconsole`), read-only by scope. `GET /sites` for the site picker and `searchAnalytics/query` (dimension `query`, best 1,000 words, last 28 complete days ending 3 days ago because Google is about 3 days behind) into `search_site` and `search_query`, replaced on every sync (`packages/connectors/src/searchconsole.ts`, `lib/searchconsole.ts`). Shown as the "What people search on Google" panel on the SEO page (`components/seo/search-words-panel.tsx`, maths in `packages/models/src/search.ts`: totals, words that almost reach page one, words that bring visitors). Reuses the Google Ads redirect URI with cookie `az_google_kind=searchconsole`. Needs the Search Console API enabled in the Cloud project and the `webmasters.readonly` scope on the consent screen; not yet run against a live account |
| Google Merchant Center | Separate OAuth (`auth/content`, own `connection` row, platform `merchant`). Google offers no read-only scope for Merchant Center, so the code only calls account lists and the read-only `reports:search` of the Merchant API v1 (the Content API was switched off in August 2026), and the tests pin that down. The one exception is the one-time developer registration Google requires (`registerGcp`, a button on `/connections/merchant` shown when Google says the project is not registered; it only adds a developer contact). Daily pull of every product's Shopping status and issues (`product_view`) and clicks/impressions for free listings and ads (`product_performance_view`) into `merchant_account`, `merchant_product` and `merchant_daily` (`packages/connectors/src/merchant.ts`, `lib/merchant.ts`). Shown as the Google Shopping panel on Products (`components/products/merchant-panel.tsx`, maths in `packages/models/src/feed.ts`), including each product's price next to Google's market price (`price_competitiveness_product_view` into `merchant_price`, `priceReport`; Google fills it only for accounts that qualify, so any 4xx on it is ignored and the sync goes on) and Google Ads spend (only Google campaigns use the feed) on products Google blocks or limits, matched to store products by SKU then product ID (`feedSpendReport`). Reuses the Google Ads redirect URI with cookie `az_google_kind=merchant`. Needs the Merchant API enabled and the Cloud project registered with the Merchant Center account. Query field names follow Google's reference and are not yet confirmed against a live account |
| Allegro | OAuth with HMAC-signed state, rotating refresh token (compare-and-set), daily pull of orders, billing fees and offers; per-offer profit |
| WooCommerce | **Push.** The plugin pairs with a one-time code, then sends HMAC-signed orders to `/api/connect/woocommerce/events`. We hold no key to the store |

## AI layer

- `getLlm()` picks Vertex AI (default, service-account auth) or AI Studio via `LLM_PROVIDER`. See `apps/web/README.md`.
- Features: SEO fix cards, Copilot, weekly summary, campaign builder drafts.
- Safeguards: untrusted text is delimited and the model gets no tools; responses must match a declared JSON schema and pass a strict parser (malformed answers fail closed); Copilot and summary figures are checked against the data the model was given; daily per-workspace limits via the `ai_usage_bump` database function.

## Operating notes

- Deploy from the **repo root only**: `npx vercel deploy --prod --yes --scope ahmed-mostafas-projects-207c473a`. Running it from `apps/` or `apps/web` creates stray Vercel projects.
- A `"use server"` file may only export async functions. Local typecheck does not catch a violation; the Vercel build does.
- Do not run `next build` while `next dev` is running; it corrupts `.next`.
- Secrets are never pasted in chat or committed. Add them with `read -s "K?label: "` piped to `vercel env add`. The shell is zsh.
- Meta and Google are still in testing, pending platform app review.
