# Handoff: acezilla — Marketing planner, media buyer & analytics

## Overview
acezilla is a desktop web app that connects to **TikTok Ads, Meta Ads and Google Ads** (plus Shopify and GA4). It brings planning, buying and analysis together in one loop. An AI copilot makes suggestions, but **it never changes a live campaign on its own**: every change becomes a draft, and a person approves it in an approval queue.

## About the design files
The files in `design/` are **design references built in HTML**. They are prototypes that show the intended look and behaviour. They are **not production code to copy**. Your task is to recreate them in the target codebase (see `BUILD_PLAN.md` for the recommended stack) using its own component library and patterns. Open them in a browser to click through. Each screen also has its own URL fragment, e.g. `Acezilla App.dc.html#planner`.

## Fidelity
**High-fidelity.** Colours, type, spacing, copy and interactions are final-intent. All data is mock data: replace it with real API and warehouse data, keeping the same layouts and formats.

## Global layout
- **App shell:** CSS grid `236px | minmax(0,1fr)`, min-height 100vh.
- **Sidebar** (sticky, full height, padding 20px 14px, 1px right border `--line`), top to bottom:
  - Logo: 26px accent square with radius 8 and the letter "a", plus the wordmark "acezilla" at 19px/700, letter-spacing -0.035em.
  - Client switcher: card with radius 10, used by agencies to switch between client workspaces.
  - Nav groups: Overview, Plan, Analyze, Automate, Workspace. Group labels are mono, 10px, uppercase, tracking .08em.
  - Nav items: padding 8px 10px, radius 8. The active item gets a `--surface` background, a 1px `--line` ring, weight 600 and an accent dot.
  - Footer: sync status and the light/dark theme toggle.
- **Top bar** (sticky, padding 12px 36px, wraps on narrow widths):
  - Search / copilot launcher (⌘K).
  - Date-range chip.
  - Attribution model chip, which links to Attribution.
  - "Suggest-only" badge (accent-soft background, accent-ink text).
  - Avatar.
- **Content area:** padding 30px 36px 60px, max-width 1360, vertical gap 24.
- **Page header pattern:**
  - Mono eyebrow, 11px uppercase, `--ink3`.
  - H1 at 34px/600, letter-spacing -0.03em, with `text-wrap: balance`.
  - Optional 15px `--ink2` subtitle.
- **Section heading pattern:** mono number in accent ink ("01") followed by an H2 at 18px/600.
- **Card:** `--surface` background, 1px `--line` border, radius 14, padding 18–22. No shadows.
- **KPI strip:** cells divided by 1px gaps (the grid background is `--line`) inside a single radius-14 container.

## Screens
### 1. Connections / Onboarding (`#onboarding`)
**Purpose:** connect data sources. This is step 2 of 4: Workspace → Connect accounts → Goals & KPIs → Historical import.
- **Progress:** 4 bars, 3px tall, filled in accent up to the current step.
- **Layout:** two columns, 1.6fr | 1fr.
- **Left column:** connector rows for TikTok Ads, Meta Ads, Google Ads, Shopify and GA4. Each row has a 40px coloured letter tile, the name, a short description, a detail line (e.g. "3 ad accounts") and a button.
  - Unconnected button: "Connect", with an ink background.
  - Connected button: "Connected ✓", with a transparent background and `--pos` text.
- **Right column:** "What we'll import" list, a suggest-only notice (accent-soft panel) and a "Continue to goals →" button.
- **Real behaviour:** "Connect" starts the OAuth flow for that platform. After authorisation, show an account picker. The backfill of history runs in the background.

### 2. Command center (`#dashboard`)
- **Greeting H1:** a one-sentence summary written by the copilot.
- **KPI strip:** 5 cells (Spend, Revenue, Blended ROAS, CPA, New customers). Each has a 26px/600 tabular value, a mono delta (`--pos` when good) and a 90×26 sparkline.
- **Grid:** 1.5fr | 1fr.
  - **01 Copilot briefing:** 3 cards ranked by weekly impact. Each card has:
    - the impact figure (22px, `--pos`), a title and a "why" line;
    - a confidence and method line;
    - buttons "Dismiss" and "Create draft".
    - States: open → draft ("Draft created · waiting in Approvals") or dismissed (55% opacity).
  - **02 Monthly pacing:** one bar per platform (8px tall, platform colour) with a "today" marker line and a status line in a semantic colour.
  - **03 Anomalies:** list items with a severity dot, title, detail and time.
- **04 Revenue vs spend, 30 days:** SVG chart. Revenue is an accent line over an accent-soft area; spend is a dashed `--ink3` line. Height 200.
- **05 Campaigns table:** columns Campaign, Spend, Platform ROAS (muted), Modeled ROAS (bold), CPA, Status (semantic colour).

### 3. Planner (`#planner`)
- **Gantt:** 220px label column plus 12 week columns (Oct 5 – Dec 21).
  - Flight bars are positioned by start and end day.
  - Single-platform flights use a tint of the platform colour; multi-platform flights use accent-soft.
  - A 2px accent line marks today.
- **Budget allocation card:** one range slider per platform ($20k–$260k, step 5k), showing spend, share, forecast revenue and ROAS. A suggestion panel has a "Use suggested split" button.
- **Forecast panel:**
  - Revenue at 40px.
  - 80% interval.
  - Blended ROAS.
  - Gap vs the optimum: "At optimum" in `--pos`, otherwise a negative amount in `--neg`.
- **Model:** `rev_p = k_p * spend^0.72`. The optimum allocates spend in proportion to `k_p^(1/(1-0.72))`, i.e. where marginal ROAS is equal across platforms. In production, replace this with fitted response curves.

### 4. Campaign builder (`#builder`)
- **Layout:** auto-fit grid with a 300px minimum per column: stepper | step card | Platform translation.
- **Steps:**
  1. Objective: 2×2 selectable cards (Sales, Leads, App installs, Awareness), plus platform pill toggles.
  2. Audience: seed, locations and exclusions, plus a copilot recommendation.
  3. Budget: daily budget, flight dates, and split mode (Copilot-weighted / Even / Manual).
  4. Creatives: 4 placeholders, each with a spec check (✓ in `--pos`, ⚠ in `--warn`).
  5. Review: summary and a "Submit for approval" button.
- **Platform translation panel:** one card per selected platform, showing the daily budget split, the objective mapped to that platform's native objective, the audience mapping and a validation line.
- **Real behaviour:** submitting creates **paused** drafts in each ad account and adds an approval item.

### 5. Creative analysis (`#creative`)
- **Filter chips:** All, TikTok, Meta, Google. The active chip is ink-filled.
- **Grid:** auto-fill, 190px minimum.
  - Each card has a 4:5 thumbnail, a platform dot, a fatigue badge (Fresh = pos, Watch = warn, Fatigued = neg) and Hook / Hold / ROAS figures.
  - The selected card gets a 1.5px accent border.
- **Sticky detail panel:**
  - Retention-by-second SVG curve.
  - Hook / Hold / CTR / ROAS.
  - "Copilot read" explanation in an accent-soft panel.
  - "Draft 3 variants from this hook" button.

### 6. Attribution (`#attribution`)
- **Headline:** the gap between platform-claimed and store-recorded conversions.
- **Model selector:** segmented control with Platform, Last click, Data-driven and MMM.
- **Channel table:** for each platform, two bars (a thin grey bar for platform-reported, a thick coloured bar for the selected model), credited conversions, the delta vs platform, and ROAS.
- **Three cards below:**
  - Funnel: Impressions → Purchases, with step rates.
  - Cohort repeat-purchase heatmap: 6×6 triangle, accent intensity scaled to the value.
  - Incrementality test result: lift, iROAS and notes.

### 7. Rules & approvals (`#rules`)
- **Rule cards:** coloured scope dot, name, scope and an on/off toggle (38×22). The rule logic reads as an IF / THEN sentence; THEN is in accent ink. A stats line sits underneath. Disabled rules show at 60% opacity.
- **Approval queue** (sticky): each item shows title, Source, Approver and Est. impact, with "Reject" and "Approve & push" buttons.
  - Approved: "Approved · pushed to platforms".
  - Rejected: "Rejected · reason logged for copilot".

### 8. Copilot (`#copilot`)
- **Chat thread:**
  - User messages: right-aligned, ink background.
  - Bot messages: a card with the answer text, ranked driver rows with negative bars, a mono sources line and action buttons.
- **Composer:** suggested prompt chips above an input with a Send button. Enter sends.
- **Right panel:** "Grounded in": accounts, store, time window and attribution model.
- **Real behaviour:** answers come from tool calls against the warehouse, and every number is cited. Actions only ever create drafts.

## Interactions & state (from the prototype)
- **Navigation:** `screen`, kept in sync with `location.hash`.
- **Theme:** `theme` (light | dark); swaps CSS variables.
- **Client switcher:** `client` (index into the workspace list).
- **Onboarding:** `conn` (connection state per connector).
- **Copilot briefing:** `brief` (open | draft | dismissed per item).
- **Planner:** `alloc` (spend in $k per platform).
- **Builder:** `bStep`, `obj`, `plats`, `split`, `submitted`.
- **Creative:** `cf` (filter), `sel` (selected creative).
- **Attribution:** `attrModel`.
- **Rules & approvals:** `rules` (enabled per rule), `appr` (ok | no per approval item).
- **Copilot chat:** `messages`, `draft`.
- **Transitions:** none required. Keep any motion subtle: 150–200ms ease-out on hover and selection.

## Design tokens
| Token | Light | Dark |
|---|---|---|
| --bg | #F6F5F2 | #111015 |
| --surface | #FFFFFF | #18171D |
| --surface2 | #EFEDE8 | #222128 |
| --ink | #17161B | #F2F1F4 |
| --ink2 | #55535D | #B6B3BE |
| --ink3 | #86838F | #827F8B |
| --line | rgba(23,22,27,.09) | rgba(255,255,255,.08) |
| --line2 | rgba(23,22,27,.16) | rgba(255,255,255,.16) |
| --accent | #7C5CFF | #8C70FF |
| --accent-soft | #EEEAFF | rgba(124,92,255,.17) |
| --accent-ink | #5A3BEB | #B7A6FF |
| --pos | oklch(0.55 0.13 155) | oklch(0.74 0.13 155) |
| --neg | oklch(0.56 0.17 25) | oklch(0.72 0.15 25) |
| --warn | oklch(0.62 0.14 70) | oklch(0.80 0.13 75) |
| --tt (TikTok) | oklch(0.64 0.12 190) | same |
| --me (Meta) | oklch(0.58 0.15 262) | same |
| --go (Google) | oklch(0.70 0.14 70) | same |

**Type**
- Fonts: **Plus Jakarta Sans** (400/500/600/700) for UI, **JetBrains Mono** (400/500) for eyebrows, labels and deltas. Use `font-variant-numeric: tabular-nums` for all figures.
- Scale: 52 (doc H1) / 40 (forecast) / 34 (page H1) / 26 (KPI) / 18 (H2) / 15 / 14 (base) / 13 / 12 / 11 (mono) / 10 (nav labels).
- Headings use letter-spacing between -0.02 and -0.04em.

**Radii:** 999 (pills), 14 (cards), 12 (sub-cards), 10 (inputs and panels), 8 (buttons and nav), 2–3 (dots).

**Spacing:** 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 / 28 / 36.

**Shadows:** none, apart from the segmented-control thumb (`0 1px 2px rgba(0,0,0,.08)`).

## Assets
- **Platform marks** are placeholder letter tiles (T / M / G). Replace them with official logos according to each platform's brand guidelines.
- **Creative thumbnails** are striped placeholders. In production they come from the ad APIs.
- **Icons:** none. If you need them, use a single line-icon set such as Lucide.

## Files
- `design/Acezilla App.dc.html`: the clickable prototype of all 8 screens.
- `design/Acezilla Product Plan.dc.html`: strategy, competitive landscape, IA, integrations and roadmap.
- `design/support.js`: runtime the prototype files need in order to open in a browser.
- `BUILD_PLAN.md`: stack, architecture, data model and the checklist of things to prepare.
- `CLAUDE.md`: starter project instructions to drop into the repo root for Claude Code.
