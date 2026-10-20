import type { FeatureContent } from "@/components/app/feature-page";

const DASH = { text: "In the meantime, your connected accounts are already in the command center.", href: "/dashboard", cta: "Open the command center" };
const CONNECT = { text: "This works best with your accounts connected.", href: "/connections", cta: "Manage connections" };

export const FEATURES: Record<string, FeatureContent> = {
  copilot: {
    eyebrow: "Overview · Copilot", title: "Your marketing copilot",
    subtitle: "Ask questions about your ads in plain language and get answers you can verify, with next steps ready to approve.",
    meanwhile: DASH,
    slides: [
      { tag: "01 · Ask", title: "Ask in plain language", body: "Ask why a number moved, which campaign to scale, or where your next $1,000 should go. Answers come from the accounts you have connected.",
        example: { kind: "chat", lines: [{ who: "you", text: "Why did Meta ROAS drop yesterday?" }, { who: "acezilla", text: "Mostly one campaign: Lookalike 1% fell from 2.9x to 1.2x while its spend rose 30%. Want me to draft a pause?" }] } },
      { tag: "02 · Verify", title: "Every number has a receipt", body: "Each answer shows the accounts, time window and attribution model it used, and ranks the drivers behind a change, so you can check the work.",
        example: { kind: "bars", rows: [{ label: "Lookalike 1%", value: 78, text: "−$1.9k", tone: "neg" }, { label: "UGC Hooks", value: 34, text: "−$0.8k", tone: "warn" }, { label: "Brand Search", value: 12, text: "+$0.3k", tone: "pos" }] } },
      { tag: "03 · Approve", title: "It suggests. You decide.", body: "The copilot never changes a live campaign on its own. Every recommendation becomes a draft that waits for a person in Rules & approvals.",
        example: { kind: "steps", items: [{ text: "Draft created: pause Lookalike 1%", state: "done" }, { text: "Waiting in Approvals", state: "next" }, { text: "Approved and pushed by you", state: "next" }] } },
    ],
  },
  planner: {
    eyebrow: "Plan · Planner & forecast", title: "Plan budgets that earn more",
    subtitle: "Lay out your flights, split budget across platforms, and see the revenue each choice is expected to return.",
    meanwhile: CONNECT,
    slides: [
      { tag: "01 · Timeline", title: "Plan flights on one timeline", body: "See every campaign and promotion across Meta, Google and TikTok on a single calendar, with today marked, so overlaps and gaps are obvious.",
        example: { kind: "bars", rows: [{ label: "Autumn sale", value: 82, text: "Oct 5–Nov 2" }, { label: "Black Friday", value: 55, text: "Nov 17–30" }, { label: "Holiday push", value: 68, text: "Dec 1–21" }] } },
      { tag: "02 · Allocate", title: "Put the next dollar where it earns most", body: "Instead of comparing average ROAS, the planner uses response curves to find where an extra dollar returns the most, and suggests a split.",
        example: { kind: "rows", rows: [{ label: "Meta", note: "$120k · 3.2x", value: "+$14k suggested", tone: "pos" }, { label: "Google", note: "$90k · 3.9x", value: "keep", tone: "muted" }, { label: "TikTok", note: "$60k · 2.4x", value: "−$14k suggested", tone: "warn" }] } },
      { tag: "03 · Forecast", title: "Forecasts with a range, not a promise", body: "Each plan shows expected revenue with a confidence interval, blended ROAS, and how far you are from the best possible split.",
        example: { kind: "rows", rows: [{ label: "Expected revenue", note: "80% range $371k – $455k", value: "$412k", tone: "pos" }, { label: "Blended ROAS", value: "3.4x" }, { label: "Gap to best split", value: "−$18k", tone: "neg" }] } },
    ],
  },
  builder: {
    eyebrow: "Plan · Campaign builder", title: "One brief, every platform",
    subtitle: "Describe a campaign once. acezilla turns it into a correct setup for each platform and checks it before anything is created.",
    meanwhile: CONNECT,
    slides: [
      { tag: "01 · Brief", title: "Write the brief once", body: "Pick the goal, audience, budget and creatives in five simple steps, with recommendations from your own past results along the way.",
        example: { kind: "steps", items: [{ text: "Objective: Sales", state: "done" }, { text: "Audience: lookalike of buyers", state: "done" }, { text: "Budget: $150/day", state: "done" }, { text: "Creatives", state: "next" }, { text: "Review", state: "next" }] } },
      { tag: "02 · Translate", title: "Native setups, automatically", body: "Each platform names things differently. acezilla maps your brief to the right objective and settings on Meta, Google and TikTok.",
        example: { kind: "rows", rows: [{ label: "Meta", value: "Sales → Purchases" }, { label: "Google", value: "Sales → Performance Max" }, { label: "TikTok", value: "Sales → Website conversions" }] } },
      { tag: "03 · Check", title: "Checked, then created as drafts", body: "Creative specs and budgets are validated first. Campaigns are then created paused, in each ad account, and wait for your approval to go live.",
        example: { kind: "steps", items: [{ text: "9:16 video, 1080×1920", state: "done" }, { text: "Caption is over 100 characters", state: "warn" }, { text: "Paused draft created in 3 accounts", state: "next" }] } },
    ],
  },
  creative: {
    eyebrow: "Analyze · Creative", title: "Know which creatives work",
    subtitle: "See how each ad holds attention second by second, and spot the ones wearing out before results fall.",
    meanwhile: DASH,
    slides: [
      { tag: "01 · Compare", title: "Every creative at a glance", body: "Browse your ads across platforms with the numbers that matter: how well the hook grabs attention, how long people stay, and what it returns.",
        example: { kind: "rows", rows: [{ label: "UGC unboxing", note: "Hook 41% · Hold 22%", value: "4.1x", tone: "pos" }, { label: "Founder story", note: "Hook 33% · Hold 18%", value: "2.9x" }, { label: "Static offer", note: "Hook 19% · Hold 9%", value: "1.6x", tone: "warn" }] } },
      { tag: "02 · Retention", title: "See where viewers drop off", body: "A second-by-second retention curve shows exactly where people leave, explained in plain language so you know what to change.",
        example: { kind: "bars", rows: [{ label: "0s", value: 100, text: "100%" }, { label: "3s", value: 62, text: "62%" }, { label: "6s", value: 38, text: "38%", tone: "warn" }, { label: "15s", value: 17, text: "17%", tone: "neg" }] } },
      { tag: "03 · Refresh", title: "Fatigue flagged before ROAS falls", body: "Each creative is marked Fresh, Watch or Fatigued, and you can draft new variants from the strongest hook in one click.",
        example: { kind: "rows", rows: [{ label: "UGC unboxing", value: "Fresh", tone: "pos" }, { label: "Founder story", value: "Watch", tone: "warn" }, { label: "Static offer", value: "Fatigued", tone: "neg" }] } },
    ],
  },
  attribution: {
    eyebrow: "Analyze · Attribution", title: "Credit sales where they belong",
    subtitle: "Every platform claims the same sale. Attribution shows what your store actually recorded and who really earned it.",
    meanwhile: CONNECT,
    slides: [
      { tag: "01 · Reality check", title: "Platform claims vs what happened", body: "Compare the conversions each platform reports with the orders your store recorded, with the overlap between platforms removed.",
        example: { kind: "bars", rows: [{ label: "Meta claims", value: 88, text: "1,240" }, { label: "Google claims", value: 74, text: "1,040" }, { label: "Store recorded", value: 62, text: "880", tone: "pos" }] } },
      { tag: "02 · Models", title: "Choose how credit is shared", body: "Switch between platform-reported, last-click, data-driven and marketing-mix models, and see how each changes the picture and your ROAS.",
        example: { kind: "rows", rows: [{ label: "Platform", value: "3.9x" }, { label: "Last click", value: "2.8x" }, { label: "Data-driven", value: "3.2x", tone: "pos" }, { label: "Marketing mix", value: "3.0x" }] } },
      { tag: "03 · Proof", title: "Back it up with tests", body: "Incrementality tests measure what ads add on top of what would have sold anyway, and recalibrate the model so you can trust it.",
        example: { kind: "rows", rows: [{ label: "Geo holdout test", note: "Meta prospecting, 28 days", value: "+12% lift", tone: "pos" }, { label: "Incremental ROAS", value: "2.1x" }] } },
    ],
  },
  rules: {
    eyebrow: "Automate · Rules & approvals", title: "Rules that watch while you sleep",
    subtitle: "Set simple rules to catch problems overnight. Every suggested change lands in one queue for a person to approve.",
    meanwhile: DASH,
    slides: [
      { tag: "01 · Rules", title: "If this happens, suggest that", body: "Write rules in plain IF / THEN terms, scoped to a campaign, platform or the whole account. They draft actions; they never act alone.",
        example: { kind: "rows", rows: [{ label: "IF ROAS < 1.5 for 3 days", note: "THEN draft: pause the campaign", value: "On", tone: "pos" }, { label: "IF spend > 120% of budget", note: "THEN draft: lower daily budget", value: "On", tone: "pos" }, { label: "IF creative is Fatigued", note: "THEN draft: 3 new variants", value: "Off" }] } },
      { tag: "02 · Queue", title: "One approval queue", body: "Suggestions from rules, the copilot and the campaign builder wait together, each with its estimated impact, confidence and source.",
        example: { kind: "rows", rows: [{ label: "Pause Lookalike 1%", note: "Source: rule · confidence high", value: "+$1.9k/wk", tone: "pos" }, { label: "Move $14k to Meta", note: "Source: planner", value: "+$3.1k/wk", tone: "pos" }] } },
      { tag: "03 · Control", title: "Limits, roles and a full log", body: "Set spend limits and decide who can approve. Approved changes are pushed once, safely, and every action is recorded in an audit log.",
        example: { kind: "steps", items: [{ text: "Approved by you, 09:12", state: "done" }, { text: "Pushed to Meta once", state: "done" }, { text: "Logged in the audit trail", state: "done" }] } },
    ],
  },
};
