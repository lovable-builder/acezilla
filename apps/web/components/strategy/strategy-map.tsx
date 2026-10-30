"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  GOALS, LANES, NODES, NODE_BY_ID, STAGES, badges, defaultShares, evaluatePlatform, foundations, levelFor, missionFor, missionKey, ratios, splitBudget,
  strategyScore, streak, targets, weekKey, worst, type Goal, type NodeId, type PlatformFacts, type PlatformId, type RuleResult, type RuleStatus, type Setup, type Stage,
} from "@acezilla/models";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/app/term";
import { Step, StepFlow } from "@/components/app/step-flow";
import { NODE_TEXT, type MetricKey } from "@/lib/strategy-content";
import { money, PLATFORM, x } from "@/lib/format";
import { savePlan, setStep } from "@/app/(app)/strategy/actions";

export interface PlanState {
  goal: Goal; stage: Stage; margin: number; marginSaved: boolean; cushion: number; aov: number; budget: number;
  nodes: NodeId[]; shares: Partial<Record<NodeId, number>>; customShares: boolean;
  /** True when the person typed these. Suggestions from the data are never saved as if they had. */ aovSaved: boolean; budgetSaved: boolean;
}
interface Props {
  currency: string; today: string; initial: PlanState;
  suggested: { aov: number; margin: number | null; ordersPerMonth: number; stage: Stage; monthlySpend: number };
  facts: Partial<Record<PlatformId, PlatformFacts>>; lastDataDate: string | null; setup: Omit<Setup, "marginSaved">; doneKeys: string[];
}

const CHIP: Record<RuleStatus, [string, string]> = { act: ["missing", "Act now"], watch: ["attention", "Watch"], info: ["not_measured", "Note"], ok: ["good", "Healthy"], nodata: ["not_measured", "No data yet"] };
const chip = (on: boolean) => ({ padding: "6px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer", border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`, background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent-ink)" : "var(--ink2)", font: "inherit" }) as const;
const lab = (t: string) => <span className="eyebrow">{t}</span>;
const pctText = (n: number) => `${Math.round(n * 100)}%`;

function Ring({ value, size = 92 }: { value: number; size?: number }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Strategy score ${value} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line2)" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray 200ms ease-out" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="tabnum" style={{ fontSize: size / 3.2, fontWeight: 600, fill: "var(--ink)" }}>{value}</text>
    </svg>
  );
}

export function StrategyMap({ currency, today, initial, suggested, facts, lastDataDate, setup, doneKeys }: Props) {
  const [goal, setGoal] = useState(initial.goal);
  const [stage, setStage] = useState(initial.stage);
  const [margin, setMargin] = useState(initial.margin);
  const [marginSaved, setMarginSaved] = useState(initial.marginSaved);
  const [cushion, setCushion] = useState(initial.cushion);
  const [aov, setAov] = useState(String(initial.aov || ""));
  const [budget, setBudget] = useState(String(initial.budget || ""));
  const [aovEdited, setAovEdited] = useState(initial.aovSaved);
  const [budgetEdited, setBudgetEdited] = useState(initial.budgetSaved);
  const [nodes, setNodes] = useState<Set<NodeId>>(new Set(initial.nodes));
  const [shares, setShares] = useState(initial.shares);
  const [custom, setCustom] = useState(initial.customShares);
  const [selected, setSelected] = useState<NodeId>(initial.nodes[0] ?? "meta_prospecting");
  const [tab, setTab] = useState<"build" | "watch" | "change">("build");
  const [flowStep, setFlowStep] = useState(0);
  const [done, setDone] = useState(new Set(doneKeys));
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [, start] = useTransition();
  const first = useRef(true);

  const chosen = NODES.filter((n) => nodes.has(n.id)).map((n) => n.id);
  const effShares = custom ? shares : defaultShares(goal, stage, chosen);
  const aovN = Number(aov) || 0, budgetN = Number(budget) || 0;
  const T = useMemo(() => targets(margin, cushion, aovN), [margin, cushion, aovN]);
  // Until the person has set their own margin, nothing is judged against a guess.
  const Tr = useMemo(() => (marginSaved ? T : targets(0, cushion, aovN)), [marginSaved, T, cushion, aovN]);
  const fmt = (n: number) => money(n, currency);
  const week = weekKey(today);

  // Save the plan a moment after the last change.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      setNote(null);
      const r = await savePlan({ goal, stage, margin: marginSaved ? margin : null, cushion, aov: aovEdited ? aovN || null : null, budget: budgetEdited ? budgetN : 0, nodes: chosen, shares: custom ? (effShares as Record<string, number>) : {} });
      setNote(r.ok ? { kind: "ok", text: "Plan saved" } : { kind: "err", text: r.error });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, stage, margin, marginSaved, cushion, aov, budget, aovEdited, budgetEdited, [...nodes].sort().join(","), custom, JSON.stringify(shares)]);

  const toggleStep = (key: string) => {
    const on = !done.has(key), next = new Set(done);
    if (on) next.add(key); else next.delete(key);
    setDone(next);
    start(async () => {
      const r = await setStep(key, on);
      if (!r.ok) { setDone(done); setNote({ kind: "err", text: r.error }); }
    });
  };

  // What the platforms say, checked against the person's numbers.
  const results = useMemo(() => {
    const byPlatform: Partial<Record<PlatformId, RuleResult[]>> = {};
    for (const n of NODES) if (n.platform && nodes.has(n.id) && !byPlatform[n.platform]) byPlatform[n.platform] = evaluatePlatform(n.platform, facts[n.platform], Tr, fmt);
    return byPlatform;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, facts, Tr]);
  const resultsFor = (id: NodeId) => { const p = NODE_BY_ID[id].platform; return p ? results[p] ?? evaluatePlatform(p, facts[p], Tr, fmt) : []; };
  const attention = NODES.filter((n) => nodes.has(n.id) && n.platform).flatMap((n) => resultsFor(n.id).filter((r) => r.status === "act" || r.status === "watch").map((r) => ({ node: n.id, r })))
    .filter((a, i, all) => all.findIndex((b) => NODE_BY_ID[b.node].platform === NODE_BY_ID[a.node].platform && b.r.id === a.r.id) === i)
    .sort((a, b) => (a.r.status === "act" ? 0 : 1) - (b.r.status === "act" ? 0 : 1));

  // Progress, score and badges.
  const ground = foundations({ ...setup, marginSaved }, chosen);
  const buildKeys = chosen.flatMap((id) => NODE_TEXT[id].build.map((_, i) => `b:${id}:${i}`));
  const buildDone = buildKeys.filter((k) => done.has(k)).length;
  const mission = missionFor(chosen), missionIds = mission.map((m) => m.id);
  const missionDone = mission.filter((m) => done.has(missionKey(week, m.id))).length;
  const run = streak(done, missionIds, today);
  // "All green" needs something that could really be judged: a platform that reports sales, against a margin the person set.
  const hasData = marginSaved && Object.values(facts).some((f) => f?.reportsSales);
  const actRules = attention.filter((a) => a.r.status === "act").length;
  const score = strategyScore({ foundationDone: ground.filter((g) => g.done).length, foundationTotal: ground.length, buildDone, buildTotal: buildKeys.length, missionDone, missionTotal: mission.length, actRules, hasData });
  const level = levelFor(score);
  const medals = badges({ foundationDone: ground.filter((g) => g.done).length, foundationTotal: ground.length, marginSaved, buildDone, buildTotal: buildKeys.length, streak: run, actRules, hasData, missionComplete: mission.length > 0 && missionDone === mission.length });

  const money4 = splitBudget(budgetN, effShares, chosen);
  const paid = chosen.filter((id) => NODE_BY_ID[id].paid);
  const shareTotal = paid.reduce((s, id) => s + (effShares[id] ?? 0), 0);

  const setStageAndReset = (s: Stage) => { setStage(s); };
  const toggleNode = (id: NodeId) => {
    const next = new Set(nodes);
    if (next.has(id)) next.delete(id); else next.add(id);
    setNodes(next);
  };
  const dragShare = (id: NodeId, v: number) => { setShares({ ...effShares, [id]: v }); setCustom(true); };

  const sel = NODE_BY_ID[selected], text = NODE_TEXT[selected], selFacts = sel.platform ? facts[sel.platform] : undefined;
  const selResults = resultsFor(selected), selStatus = sel.platform ? worst(selResults) : null;
  const metricNow = (k?: MetricKey) => {
    if (!k || !selFacts) return null;
    if (k === "storeRoas") return selFacts.storeRoas === null ? null : x(selFacts.storeRoas);
    const r = ratios(selFacts.d14);
    if (k === "spend") return fmt(selFacts.d14.spend);
    if (k === "roas") return r.roas === null ? null : x(r.roas);
    if (k === "ctr") return r.ctr === null ? null : `${(r.ctr * 100).toFixed(2)}%`;
    return r[k] === null ? null : fmt(r[k]!);
  };

  const tile = (label: string, value: string, sub: string, color = "var(--ink)") => (
    <div className="kpi" key={label}>
      <span className="eyebrow"><Term>{label}</Term></span>
      <span className="tabnum" style={{ fontSize: 26, fontWeight: 600, color }}>{value}</span>
      <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{sub}</span>
    </div>
  );

  return (
    <>
      {/* Level, streak, badges */}
      <Card style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
        <Ring value={score} />
        <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="eyebrow"><Term>Strategy score</Term></span>
          <b style={{ fontSize: 22, fontWeight: 600 }}>{level.name}</b>
          <span className="sub" style={{ fontSize: 14 }}>{level.next ? <><span className="tabnum">{level.next.pointsToGo}</span> {level.next.pointsToGo === 1 ? "point" : "points"} to {level.next.name}. Points come from your ground floor, build steps, this week&apos;s mission and a healthy account.</> : "Top level. Keep the weekly mission going."}</span>
          <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{run > 0 ? `${run}-week streak` : "No streak yet. Clear this week's mission to start one."} · {lastDataDate ? `ad data to ${lastDataDate}` : "no ad data yet"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 460 }}>
          {medals.map((b) => (
            <span key={b.id} title={b.earned ? b.label : b.hint} style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, border: `1px solid ${b.earned ? "var(--accent)" : "var(--line2)"}`, background: b.earned ? "var(--accent-soft)" : "transparent", color: b.earned ? "var(--accent-ink)" : "var(--ink3)", opacity: b.earned ? 1 : 0.75 }}>{b.earned ? "✓ " : ""}{b.label}</span>
          ))}
        </div>
      </Card>

      {attention.length > 0 && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="h2" style={{ margin: 0 }}>Needs your attention</h2>
          {attention.map((a) => (
            <button key={`${a.node}-${a.r.id}`} onClick={() => { setSelected(a.node); setTab("change"); setFlowStep(2); }}
              style={{ display: "flex", gap: 12, alignItems: "baseline", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--line)", padding: "10px 0 0", cursor: "pointer", font: "inherit", color: "inherit", flexWrap: "wrap" }}>
              <span className={`seo-chip seo-chip-${CHIP[a.r.status][0]}`}>{CHIP[a.r.status][1]}</span>
              <span style={{ flex: 1, minWidth: 220 }}><b style={{ fontWeight: 600 }}>{PLATFORM[NODE_BY_ID[a.node].platform!]?.label}: {a.r.title}.</b> <span className="sub">{a.r.detail}</span></span>
              <span style={{ color: "var(--accent-ink)", fontSize: 13 }}>What to do →</span>
            </button>
          ))}
        </Card>
      )}

      <StepFlow id="strategy" value={flowStep} onChange={setFlowStep}>
        <Step label="Your numbers" hint="Set your margin first: every verdict depends on it">
      <Card id="numbers" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">1</span>Your numbers</h2>
          {note && <span className="eyebrow" style={{ color: note.kind === "err" ? "var(--neg)" : "var(--pos)" }}>{note.text}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lab("What do you want most?")}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{GOALS.map((g) => <button key={g.id} title={g.hint} onClick={() => setGoal(g.id)} style={chip(goal === g.id)}>{g.label}</button>)}</div>
            {lab("Where is your shop today?")}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{STAGES.map((s) => <button key={s.id} title={s.hint} onClick={() => setStageAndReset(s.id)} style={chip(stage === s.id)}>{s.label}</button>)}</div>
            <span className="sub" style={{ fontSize: 12 }}>{suggested.ordersPerMonth > 0 ? <>About <span className="tabnum">{suggested.ordersPerMonth}</span> orders a month lately, which fits &quot;{STAGES.find((s) => s.id === suggested.stage)!.label}&quot;.</> : "No orders found yet, so start with the first option and move up as you grow."}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="eyebrow"><Term>Margin</Term>: <span className="tabnum">{pctText(margin)}</span>{marginSaved ? "" : " (a guess; drag to set yours)"}</span>
              <input type="range" min={5} max={80} step={1} value={Math.round(margin * 100)} onChange={(e) => { setMargin(Number(e.target.value) / 100); setMarginSaved(true); }} aria-label="Margin in percent" style={{ accentColor: "var(--accent)", width: "100%" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="eyebrow"><Term>Cushion</Term>: <span className="tabnum">{pctText(cushion)}</span> above break-even</span>
              <input type="range" min={0} max={60} step={5} value={Math.round(cushion * 100)} onChange={(e) => setCushion(Number(e.target.value) / 100)} aria-label="Cushion above break-even in percent" style={{ accentColor: "var(--accent)", width: "100%" }} />
            </label>
            {suggested.margin !== null && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                <span className="sub">Your own figures (Allegro fees and the cost of goods you entered) leave <b className="tabnum" style={{ fontWeight: 600, color: suggested.margin <= 0 ? "var(--neg)" : "var(--ink)" }}>{pctText(suggested.margin)}</b> of each sale before ads.{suggested.margin < 0.05 ? " The slider starts at 5%, so the number it uses is higher than yours. Fix prices or costs before spending more on ads." : ""}</span>
                <Button variant="outline" size="sm" onClick={() => { setMargin(Math.min(0.8, Math.max(0.05, suggested.margin!))); setMarginSaved(true); }}>Use my figures</Button>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{lab(`Average order (${currency})`)}<input className="field tabnum" type="number" min="0" step="1" value={aov} onChange={(e) => { setAov(e.target.value); setAovEdited(true); }} style={{ width: 130, padding: "8px 10px" }} /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{lab(`Ad budget per month (${currency})`)}<input className="field tabnum" type="number" min="0" step="100" value={budget} onChange={(e) => { setBudget(e.target.value); setBudgetEdited(true); }} style={{ width: 160, padding: "8px 10px" }} /></label>
            </div>
          </div>
        </div>
        <div className="kpis">
          {tile("Break-even ROAS", T.breakEvenRoas === null ? "—" : x(T.breakEvenRoas), "ads must bring back this much just to pay for themselves")}
          {tile("Target ROAS", T.targetRoas === null ? "—" : x(T.targetRoas), `break-even plus your ${pctText(cushion)} cushion`, "var(--pos)")}
          {tile("Most you can pay for a sale", T.maxCpa === null ? "—" : fmt(T.maxCpa), "average order × margin; above this each sale loses money")}
          {tile("Target cost per sale", T.targetCpa === null ? "—" : fmt(T.targetCpa), "what to aim for so a bad week still pays")}
        </div>
        <p className="sub" style={{ margin: 0, fontSize: 12 }}>Margin is the share of a sale left after goods, fees and shipping, before ads, with VAT taken out. If you are unsure, use the price advisor on the Attribution page to find it. Every judgement below is measured against these numbers, so set yours first.</p>
      </Card>
        </Step>
        <Step label="The map" hint="Tick the channels you use, click one to open its playbook">
      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">2</span>The map</h2>
          <span className="eyebrow">Tick the channels you use or want. Click one to open its playbook</span>
        </div>
        <div style={{ border: "1px dashed var(--line2)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eyebrow"><Term>Ground floor</Term> · {ground.filter((g) => g.done).length} of {ground.length} in place</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ground.map((g) => (
              <Link key={g.key} href={g.href} title={g.why} onClick={g.href.startsWith("#") ? (e) => { e.preventDefault(); setFlowStep(0); } : undefined} style={{ ...chip(g.done), textDecoration: "none" }}>{g.done ? "✓" : "○"} {g.label}</Link>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
          {LANES.map((lane, li) => (
            <div key={lane.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ borderBottom: "2px solid var(--accent)", paddingBottom: 6 }}>
                <span className="eyebrow">{li + 1}{li < LANES.length - 1 ? " →" : ""}</span>
                <div><b style={{ fontWeight: 600 }}>{lane.label}</b> <span className="sub" style={{ fontSize: 12 }}>{lane.hint}</span></div>
              </div>
              {NODES.filter((n) => n.lane === lane.id).map((n) => {
                const inPlan = nodes.has(n.id), res = n.platform ? worst(resultsFor(n.id)) : null;
                const steps = NODE_TEXT[n.id].build, got = steps.filter((_, i) => done.has(`b:${n.id}:${i}`)).length;
                const isSel = selected === n.id;
                return (
                  <div key={n.id} style={{ border: `1.5px solid ${isSel ? "var(--accent)" : "var(--line2)"}`, borderRadius: 12, padding: 12, background: inPlan ? "var(--surface)" : "transparent", opacity: inPlan ? 1 : 0.6, display: "flex", flexDirection: "column", gap: 6, transition: "border-color 150ms ease-out, opacity 150ms ease-out" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={inPlan} onChange={() => toggleNode(n.id)} aria-label={`Include ${n.name} in my plan`} style={{ marginTop: 3, accentColor: "var(--accent)" }} />
                      <button onClick={() => { setSelected(n.id); setTab("build"); setFlowStep(2); }} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }} aria-pressed={isSel}>
                        <b style={{ fontWeight: 600 }}>{n.name}</b>
                      </button>
                    </div>
                    {inPlan && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                        {res && <span className={`seo-chip seo-chip-${CHIP[res][0]}`}>{CHIP[res][1]}</span>}
                        <span className="mono tabnum" style={{ color: "var(--ink3)" }}>{got}/{steps.length} built</span>
                        {n.paid && money4[n.id] ? <span className="mono tabnum" style={{ color: "var(--ink2)" }}>{fmt(money4[n.id]!)}/mo</span> : null}
                      </div>
                    )}
                    {inPlan && <div style={{ height: 4, borderRadius: 2, background: "var(--line)" }}><div style={{ height: 4, borderRadius: 2, width: `${(got / steps.length) * 100}%`, background: "var(--accent)", transition: "width 200ms ease-out" }} /></div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
        </Step>
        <Step label="Playbook" hint="What to build, watch and change for one channel" badge={attention.length ? `${attention.length} to check` : undefined}>
      <Card id="node-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">3</span>{sel.name}</h2>
          {selStatus && nodes.has(selected) && <span className={`seo-chip seo-chip-${CHIP[selStatus][0]}`}>{CHIP[selStatus][1]}</span>}
          {!nodes.has(selected) && <Button variant="outline" size="sm" onClick={() => toggleNode(selected)}>Add to my plan</Button>}
        </div>
        <p style={{ margin: 0 }}>{text.job}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([["build", "Build it"], ["watch", "Watch it"], ["change", "Change it"]] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} style={chip(tab === id)}>{label}</button>)}
        </div>

        {tab === "build" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {text.build.map((s, i) => {
              const key = `b:${selected}:${i}`, on = done.has(key);
              return (
                <label key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", cursor: "pointer", background: on ? "var(--accent-soft)" : "transparent", transition: "background 150ms ease-out" }}>
                  <input type="checkbox" checked={on} onChange={() => toggleStep(key)} style={{ marginTop: 3, accentColor: "var(--accent)" }} />
                  <span style={{ textDecoration: on ? "line-through" : "none", color: on ? "var(--ink3)" : "var(--ink)" }}><span className="mono tabnum" style={{ color: "var(--accent-ink)", marginRight: 8 }}>{i + 1}</span>{s}</span>
                </label>
              );
            })}
          </div>
        )}

        {tab === "watch" && (
          <div style={{ overflowX: "auto" }}>
            <table className="t">
              <thead><tr><th style={{ textAlign: "left" }}>What to watch</th><th>Your last 14 days</th><th style={{ textAlign: "left" }}>How often</th><th style={{ textAlign: "left" }}>What healthy looks like</th></tr></thead>
              <tbody>
                {text.monitor.map((m) => {
                  const now = metricNow(m.metric);
                  return (
                    <tr key={m.label}>
                      <td style={{ textAlign: "left", whiteSpace: "normal" }}>{m.label.includes("Return") ? <Term k={m.metric === "storeRoas" ? "Modeled ROAS" : "Platform ROAS"}>{m.metric === "storeRoas" ? "Modeled ROAS" : "Platform ROAS"}</Term> : m.label}{m.label.includes("Return") ? <span className="sub"> ({m.metric === "storeRoas" ? "real store orders" : "platform's own count"})</span> : null}</td>
                      <td className="tabnum">{m.metric ? (now ?? <span className="sub">{sel.platform ? "no data" : "—"}</span>) : <span className="sub">check there</span>}</td>
                      <td style={{ textAlign: "left" }}>{m.how}</td>
                      <td style={{ textAlign: "left", whiteSpace: "normal" }}>{m.healthy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sel.platform && <p className="sub" style={{ fontSize: 12, margin: "8px 0 0" }}>Figures are for all {PLATFORM[sel.platform]?.label} campaigns together, last 14 days{selFacts?.storeRoas === null && sel.platform !== "allegro" ? ". Store return is empty because no order carries this platform's tags" : ""}.</p>}
          </div>
        )}

        {tab === "change" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sel.platform && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lab("Checked against your numbers now")}
                {selResults.map((r) => (
                  <div key={r.id} style={{ border: `1px solid ${r.status === "act" ? "var(--neg)" : r.status === "watch" ? "var(--warn)" : "var(--line2)"}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className={`seo-chip seo-chip-${CHIP[r.status][0]}`}>{CHIP[r.status][1]}</span><b style={{ fontWeight: 600 }}>{r.title}</b></div>
                    <span className="sub tabnum">{r.detail}</span>
                    <span><b style={{ fontWeight: 600 }}>Suggested:</b> {r.action}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lab("Rules of thumb for this channel")}
              {text.change.map((c) => (
                <div key={c.when} style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <span style={{ flex: "1 1 240px" }}><span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>IF </span>{c.when}</span>
                  <span style={{ flex: "1 1 240px" }}><span className="mono" style={{ fontSize: 11, color: "var(--accent-ink)" }}>THEN </span>{c.then}</span>
                </div>
              ))}
            </div>
            <p className="sub" style={{ fontSize: 12, margin: 0 }}>Change one thing at a time and wait three to four days before judging. These are suggestions. acezilla never changes a campaign for you.</p>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {text.open.map((o) => <Button key={o.href} asChild variant="outline" size="sm"><Link href={o.href}>{o.label}</Link></Button>)}
        </div>
      </Card>
        </Step>
        <Step label="Budget" hint="Where the money goes">
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">4</span>Where the money goes</h2>
          <span className="eyebrow">{budgetN > 0 ? <>{fmt(budgetN)} a month · <span className="tabnum">{fmt(budgetN / 30)}</span> a day</> : "Enter a monthly budget above"}</span>
          {custom && <Button variant="ghost" size="sm" onClick={() => setCustom(false)}>Reset to suggested</Button>}
        </div>
        {paid.length === 0 ? <p className="sub" style={{ margin: 0 }}>Tick at least one paid channel on the map.</p> : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {paid.map((id) => {
                const n = NODE_BY_ID[id], pc = shareTotal > 0 ? (effShares[id] ?? 0) / shareTotal : 0;
                return (
                  <label key={id} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1.2fr) 2fr 120px", gap: 12, alignItems: "center" }}>
                    <span>{n.name}</span>
                    <input type="range" min={0} max={100} step={1} value={effShares[id] ?? 0} onChange={(e) => dragShare(id, Number(e.target.value))} aria-label={`${n.name} share of budget`} style={{ accentColor: "var(--accent)", width: "100%" }} />
                    <span className="tabnum" style={{ textAlign: "right" }}>{pctText(pc)} · {budgetN > 0 ? fmt(money4[id] ?? 0) : "—"}</span>
                  </label>
                );
              })}
            </div>
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>{custom ? "You changed the split." : "Starting split for your goal and stage."} A common way to begin, not a rule: most money on finding and winning buyers, a smaller part on reminders, and reminders only once your shop has enough visitors. Move the sliders to fit what you know. To see what a budget is expected to earn, open the <Link href="/planner" style={{ color: "var(--accent-ink)" }}>Planner</Link>, and to test a single campaign before you spend, open the <Link href="/forecaster" style={{ color: "var(--accent-ink)" }}>Profit forecaster</Link>.</p>
          </>
        )}
      </Card>
        </Step>
        <Step label="This week" hint="Ten minutes, the same few checks every week" badge={`${missionDone}/${mission.length}`}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">5</span>This week&apos;s mission</h2>
          <span className="eyebrow">{week} · <span className="tabnum">{missionDone}</span> of <span className="tabnum">{mission.length}</span> done · resets on Monday</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "var(--line)" }}><div style={{ height: 6, borderRadius: 3, width: `${mission.length ? (missionDone / mission.length) * 100 : 0}%`, background: "var(--accent)", transition: "width 200ms ease-out" }} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mission.map((m) => {
            const key = missionKey(week, m.id), on = done.has(key);
            return (
              <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: on ? "var(--accent-soft)" : "transparent", flexWrap: "wrap", transition: "background 150ms ease-out" }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", flex: 1, minWidth: 240 }}>
                  <input type="checkbox" checked={on} onChange={() => toggleStep(key)} style={{ marginTop: 3, accentColor: "var(--accent)" }} />
                  <span style={{ textDecoration: on ? "line-through" : "none", color: on ? "var(--ink3)" : "var(--ink)" }}>{m.label}</span>
                </label>
                <Link href={m.href} style={{ fontSize: 13, color: "var(--accent-ink)" }}>{m.where} →</Link>
              </div>
            );
          })}
        </div>
        <p className="sub" style={{ margin: 0, fontSize: 12 }}>Clear every task and the week counts towards your streak. Miss a week and the streak starts again. Ten minutes a week is enough; the point is to look at the same few things in the same order every time.</p>
      </Card>
        </Step>
      </StepFlow>
    </>
  );
}
