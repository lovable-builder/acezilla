import { buildAttribution, buildDashboard, shiftDate, stageFor, defaultShares, marginFromTotals, monthlyOrders, NODES, type DailyRow, type NodeId, type PlatformFacts, type PlatformId, type Stats, type Goal, type Stage } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { loadAdRows, loadOfferProfit, loadOrders, todayUtc } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { StrategyMap, type PlanState } from "@/components/strategy/strategy-map";

export const metadata = { title: "Strategy map · acezilla" };

const PLATFORMS: PlatformId[] = ["meta", "tiktok", "google", "allegro"];
const stats = (rows: DailyRow[]): Stats => rows.reduce<Stats>((s, r) => ({ spend: s.spend + r.spend, impressions: s.impressions + r.impressions, clicks: s.clicks + r.clicks, conversions: s.conversions + r.conversions, revenue: s.revenue + r.revenue }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
const NODE_IDS = new Set<string>(NODES.map((n) => n.id));

export default async function StrategyPage() {
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>Create a workspace first.</Card>;
  const today = todayUtc();

  // The loaders already take VAT off Allegro amounts. Doing it again here made every Allegro figure too low.
  const rows = await loadAdRows(supabase, current.id);
  const end = rows.reduce((m, r) => (r.date > m ? r.date : m), "0000-00-00");
  const last = end === "0000-00-00" ? today : end;
  const between = (p: string, from: string, to: string) => rows.filter((r) => r.platform === p && r.date >= from && r.date <= to);

  const orders90 = await loadOrders(supabase, current.id, shiftDate(last, -89), last);
  const orders14 = orders90.filter((o) => o.createdAt.slice(0, 10) >= shiftDate(last, -13));
  const adRows14 = rows.filter((r) => r.date >= shiftDate(last, -13));
  const d = adRows14.length ? buildDashboard(adRows14, { windowDays: 14, endDate: last }) : null;
  const attr = d ? buildAttribution({ platforms: d.platforms, campaigns: d.campaigns, orders: orders14 }) : null;
  const storeRoas = new Map((attr?.channels ?? []).map((c) => [c.platform, c.storeRoas]));

  const [{ data: conns }, { data: planRow }, { data: stepRows }, profit] = await Promise.all([
    supabase.from("connection").select("platform,status").eq("workspace_id", current.id),
    supabase.from("strategy_plan").select("goal,stage,margin,cushion,aov,budget,nodes,shares").eq("workspace_id", current.id).maybeSingle(),
    supabase.from("strategy_step").select("key").eq("workspace_id", current.id).limit(3000),
    loadOfferProfit(supabase, current.id, shiftDate(last, -89), last),
  ]);

  const status = new Map((conns ?? []).map((c) => [c.platform as string, c.status as string]));
  const facts: Partial<Record<PlatformId, PlatformFacts>> = {};
  for (const p of PLATFORMS) {
    const own = rows.filter((r) => r.platform === p);
    if (!own.length) continue;
    const newest = own.reduce((m, r) => (r.date > m ? r.date : m), "0000-00-00");
    const w1 = stats(between(p, shiftDate(last, -6), last)), w0 = stats(between(p, shiftDate(last, -13), shiftDate(last, -7)));
    facts[p] = {
      d14: stats(between(p, shiftDate(last, -13), last)), w1, w0, storeRoas: p === "allegro" ? null : storeRoas.get(p) ?? null,
      // Allegro never reports sales for ads. A TikTok file only does if it ever carried sales. Meta and Google report them through their APIs.
      reportsSales: p === "allegro" ? false : p === "tiktok" ? own.some((r) => r.conversions > 0 || r.revenue > 0) : true,
      needsReauth: status.get(p) === "needs_reauth", staleSince: newest < shiftDate(last, -2) ? newest : null,
    };
  }
  const on = new Set((conns ?? []).filter((c) => c.status !== "needs_reauth").map((c) => c.platform as string));
  const has = (...p: string[]) => p.some((x) => on.has(x));

  const firstOrder = orders90.reduce<string | null>((m, o) => { const d = o.createdAt.slice(0, 10); return m === null || d < m ? d : m; }, null);
  const ordersPerMonth = monthlyOrders(orders90.length, firstOrder, last);
  const ownMargin = profit ? marginFromTotals(profit.totals, profit.missingCosts) : null;
  const aov = orders90.length ? orders90.reduce((s, o) => s + o.revenue, 0) / orders90.length : 0;
  const spend28 = rows.filter((r) => r.date >= shiftDate(last, -27)).reduce((s, r) => s + r.spend, 0);

  const stage: Stage = (planRow?.stage as Stage) ?? stageFor(ordersPerMonth);
  const goal: Goal = (planRow?.goal as Goal) ?? "sales";
  const fresh: NodeId[] = ["seo_content", "store"];
  if (has("meta")) fresh.push("meta_prospecting");
  if (has("meta") && stage !== "starting") fresh.push("meta_retargeting");
  if (has("tiktok")) fresh.push("tiktok_prospecting");
  if (has("google")) fresh.push("google_search", "google_shopping");
  if (has("allegro")) fresh.push("allegro_ads");
  if (!has("meta", "tiktok", "google", "allegro")) fresh.push("meta_prospecting", "google_shopping");
  if (stage === "scaling") fresh.push("email");
  const nodes = (planRow?.nodes as string[] | undefined)?.filter((n) => NODE_IDS.has(n)) as NodeId[] | undefined;
  const chosen = nodes?.length ? nodes : [...new Set(fresh)];
  const savedShares = (planRow?.shares ?? {}) as Record<string, number>;

  const plan: PlanState = {
    goal, stage, margin: planRow?.margin === null || planRow?.margin === undefined ? 0.35 : Number(planRow.margin), marginSaved: planRow?.margin !== null && planRow?.margin !== undefined,
    cushion: Number(planRow?.cushion ?? 0.2), aov: planRow?.aov ? Number(planRow.aov) : Math.round(aov), budget: planRow?.budget ? Number(planRow.budget) : Math.round(spend28 * (30 / 28)),
    nodes: chosen, shares: Object.keys(savedShares).length ? savedShares : defaultShares(goal, stage, chosen), customShares: Object.keys(savedShares).length > 0, aovSaved: !!planRow?.aov, budgetSaved: !!planRow?.budget,
  };

  return (
    <>
      <div>
        <div className="eyebrow">Plan · Strategy map</div>
        <h1 className="page">Build your marketing map, then play it week by week</h1>
        <p className="sub">Set your numbers, pick the channels, and follow the map from people who have never heard of you to people who buy again. For every channel you get what to build, what to watch, and what to change, checked against your own results. These are suggestions only; nothing is changed in an ad platform.</p>
      </div>
      <StrategyMap
        currency={current.currency} today={today} initial={plan}
        suggested={{ aov: Math.round(aov), margin: ownMargin, ordersPerMonth, stage: stageFor(ordersPerMonth), monthlySpend: Math.round(spend28 * (30 / 28)) }}
        facts={facts} lastDataDate={end === "0000-00-00" ? null : end}
        setup={{ adConnected: has("meta", "google", "tiktok", "allegro"), storeConnected: has("woocommerce", "allegro"), analyticsConnected: has("ga4"), merchantConnected: has("merchant"), searchConsoleConnected: has("searchconsole"), ordersTagged: orders14.some((o) => !o.externalId?.startsWith("allegro:") && (o.utm !== null || o.clickIds !== null)), taggingNeeded: has("woocommerce") }}
        doneKeys={(stepRows ?? []).map((r) => r.key as string)}
      />
    </>
  );
}
