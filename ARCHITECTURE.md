# acezilla architecture

A suggest-only AI marketing workspace for online sellers. It reads ad platforms, stores and marketplaces, compares what platforms claim with what customers really bought, and drafts next steps that a person approves.

## Layout (npm workspaces + Turborepo, TypeScript strict)

```
apps/web             Next.js 15 App Router, deployed on Vercel (region dub1)
apps/worker          placeholder, unused
packages/connectors  Meta, Google, Allegro, WooCommerce, CSV and mock, all producing one normalised Dataset
packages/models      Pure business maths: dashboard, store sales, insights, attribution, marketplace profit,
                     AI prompts/schemas/parsers. No I/O
packages/seo         SEO engine: SSRF guard, crawler, analyzer, scorer, report, fix parsing
packages/llm         Provider-independent LLM core: error kinds, URL builders, response parsing, credential decoding
packages/notify      Resend email sender, alert and SEO email templates
packages/db          SQL migrations 0001-0012 (applied through the Supabase MCP)
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
- **App pages:** dashboard (Command center), attribution, connections (+ a page per platform), seo, workspace, copilot, builder. Planner, creative and rules are still explainer pages (`lib/feature-content.ts`).
- **API routes:** `api/connect/{meta,google,allegro,woocommerce}` (OAuth, plugin pairing and signed events) and `api/cron/{sync,seo}`.
- **Cron** (`vercel.json`): sync daily 05:00 UTC, SEO re-audits Mondays 06:00 UTC. Both require `Authorization: Bearer $CRON_SECRET`.
- **`lib/` modules:** `sync.ts` and `ingest.ts` (pull and store), `allegro.ts` (tokens and sync), `data.ts` (shared loaders), `ai-brief.ts` (snapshot for the AI), `seo-runner.ts` and `seo-monitor.ts`, `seo-fixes.ts`, `llm/` (providers), `ai-guard.ts` (daily limits, friendly errors), `alerts.ts`, `crypto.ts`, `currency.ts`, `workspace.ts`, `period.ts` (URL period plus the saved default in cookie `az_view`), `glossary.ts` (hover explanations used by `components/app/term.tsx`). Setup progress is `components/app/checklist.tsx`.

## Connection patterns

| Platform | Pattern |
|---|---|
| Meta, Google Ads | OAuth, daily pull into the shared ad tables |
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
