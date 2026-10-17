# acezilla — Build plan & prep checklist

## A. Start these now (they have long lead times and block real data)
- [ ] **Company basics:** legal entity, domain (e.g. acezilla.com), support email, and a hosted **Privacy Policy, Terms and DPA**. Every platform review asks for these URLs.
- [ ] **Meta:** create a Meta Developer app of type Business.
  - Complete **Business Verification**.
  - Request `ads_read`, `ads_management` and `business_management` through **App Review**, with a screencast of the flow.
  - Set up the Conversions API.
  - Expect this to take 2–6 weeks.
- [ ] **Google Ads:**
  - Create a Google Ads **Manager (MCC) account**.
  - Apply for a **developer token**. It starts at test or Basic access; apply for **Standard** before launch.
  - Create a Google Cloud project with an OAuth consent screen. The `adwords` scope is sensitive and needs verification.
  - Enable the GA4 Data API and the Merchant Center API.
- [ ] **TikTok:** create a TikTok for Business developer account. Register an app for the **Marketing API** (scopes: ad account management, campaigns, reporting, creative, audiences). The app needs approval, and you should also plan to use the Events API.
- [ ] **Shopify:** create a Partner account and register an app with the `read_orders`, `read_customers` and `read_products` scopes.
- [ ] **Test data:** a sandbox ad account on each platform with a small real budget, so you have realistic data during development.
- [ ] **Claude API key** for the copilot.

## B. Recommended stack
Your repo name (lovable-builder/acezilla) suggests Lovable, which uses Vite, React, Tailwind, shadcn/ui and Supabase. That works for the UI. The heavier back end (sync workers, modelling) should live alongside it:

- **Monorepo** (pnpm + Turborepo):
  - `apps/web`: React + TypeScript, Tailwind, shadcn/ui, TanStack Query and Recharts (or visx). Next.js if you want SSR.
  - `apps/worker`: Node + TypeScript job runner for sync, rules and alerts (Inngest, Trigger.dev or BullMQ on Redis).
  - `packages/connectors`: one module per platform, each exposing a shared interface (`listAccounts`, `syncEntities`, `syncInsights`, `createDraft`, `applyChange`).
  - `packages/db`: Postgres via Supabase, with the Drizzle ORM and migrations.
  - `packages/models`: attribution, response curves and forecasting. Python is fine here, run as a separate service.
- **Auth:** Supabase Auth or Clerk, with organisations, so that each agency has multiple client workspaces.
- **Warehouse:** start with Postgres and partitioned fact tables. Move to ClickHouse or BigQuery once data passes about 100M rows.
- **Secrets:** OAuth tokens encrypted at rest (Supabase Vault or KMS), and refreshed by the worker.

## C. Core data model (first migration)
- `org → workspace (client) → connection (platform, oauth) → ad_account`
- `campaign → ad_group → ad → creative`: one normalised hierarchy, with `platform`, `external_id` and `raw jsonb` columns.
- `insight_daily (ad_id, date, spend, impressions, clicks, conversions, revenue, video_p25..p100, …)`
- `order (store_id, external_id, created_at, revenue, customer_id, utm / click ids)`
- `plan`, `flight`, `budget_allocation`
- `rule`, `rule_run`
- `suggestion (source, payload, impact, confidence)`
- `approval (suggestion_id, approver, status, pushed_at)`
- `audit_log`

## D. Build order (matches the roadmap)
1. **Foundation:** auth and orgs, the workspace switcher, the app shell with tokens (from README), and light/dark themes.
2. **Connectors:** OAuth for Meta, Google, TikTok and Shopify, then a 24-month backfill and incremental sync every 15–60 minutes. Build in rate-limit handling from the start.
3. **Command center and campaigns table:** platform-reported metrics first.
4. **Attribution v1:** deduplicate against store orders. Start with last click and a position-based data-driven model, and show modeled ROAS everywhere.
5. **Anomalies and rules:** the rule engine creates suggestions, and the approval queue's "Approve & push" calls `applyChange`.
6. **Copilot:** Claude with tools (`query_metrics`, `get_campaign`, `create_suggestion`). Every answer cites its sources, and the copilot can never write to platforms directly.
7. **Planner and forecasting:** response-curve fitting and the budget optimiser.
8. **Campaign builder:** a translation layer from one brief to native payloads, plus spec validation.
9. **Creative analysis:** video retention metrics, fatigue scoring and the copilot's creative read.
10. **MMM and incrementality tests.**

## E. Non-negotiables
- **Suggest-only:** nothing writes to an ad platform unless there is an `approval.status = approved` row. Enforce this server-side in `applyChange`.
- **Idempotent, logged pushes:** every push is idempotent and logged to `audit_log`. On failure, retry, and show the failure in the queue.
- **Read-only scopes:** request only read-only scopes until a workspace turns buying on.
- **Rate limits and sync status:** respect each API's rate limits, and show the last sync time in the sidebar, as the prototype does.
