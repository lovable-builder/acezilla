import { allocateBudget, buildAttribution, buildDashboard, fitResponse, forecastFlight, marginalRoas, shiftDate, weeklyPoints, MIN_WEEKS, type Flight, type ResponseFit } from "@acezilla/models";
import { getWorkspaceContext } from "@/lib/workspace";
import { loadAdRows, loadOrders, todayUtc } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/app/term";
import { money, PLATFORM, x } from "@/lib/format";
import { addFlight, deleteFlight } from "./actions";

export const metadata = { title: "Planner · acezilla" };

const PLAN_PLATFORMS = ["meta", "google", "tiktok"];
const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function Planner({ searchParams }: { searchParams: Promise<{ error?: string; budget?: string }> }) {
  const { error, budget: budgetParam } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>Create a workspace first.</Card>;
  const cur = current.currency;
  const today = todayUtc();

  const rows = (await loadAdRows(supabase, current.id)).filter((r) => r.platform !== "allegro");
  const end = rows.reduce((m, r) => (r.date > m ? r.date : m), "0000-00-00");
  const platforms = [...new Set(rows.map((r) => r.platform))].sort();

  const fits: Record<string, ResponseFit> = {};
  const current4w: Record<string, number> = {};
  for (const p of platforms) {
    const f = fitResponse(weeklyPoints(rows, p, end, 13));
    if (f) fits[p] = f;
    const from = shiftDate(end, -27);
    current4w[p] = rows.filter((r) => r.platform === p && r.date >= from).reduce((s, r) => s + r.spend, 0) / 4;
  }

  // Platform ROAS is what each platform claims; modeled ROAS is what the store's own orders confirm.
  const orders = rows.length ? await loadOrders(supabase, current.id, shiftDate(end, -89), end) : [];
  const d = rows.length ? buildDashboard(rows, { windowDays: 90, endDate: end }) : null;
  const attr = d ? buildAttribution({ platforms: d.platforms, campaigns: d.campaigns, orders }) : null;
  const chan = new Map((attr?.channels ?? []).map((c) => [c.platform, c]));

  const weeklyNow = Object.values(current4w).reduce((s, v) => s + v, 0);
  const asked = Number(budgetParam);
  const weeklyBudget = Number.isFinite(asked) && asked > 0 ? asked : Math.round(weeklyNow);
  const alloc = allocateBudget(fits, current4w, weeklyBudget);

  const { data: flightRows } = await supabase.from("flight").select("id,name,starts_on,ends_on,platforms,budget").eq("workspace_id", current.id).order("starts_on");
  const flights: Flight[] = (flightRows ?? []).map((f) => ({ id: f.id as string, name: (f.name as string) ?? "Flight", startsOn: f.starts_on as string, endsOn: f.ends_on as string, platforms: (f.platforms as string[]) ?? [], budget: Number(f.budget ?? 0) }));

  const lo = flights.length ? [today, ...flights.map((f) => f.startsOn)].sort()[0]! : today;
  const hi = flights.length ? [today, ...flights.map((f) => f.endsOn)].sort().at(-1)! : today;
  const t0 = day(shiftDate(lo, -3)), t1 = day(shiftDate(hi, 3)), span = t1 - t0;
  const pos = (dt: string) => ((day(dt) - t0) / span) * 100;

  return (
    <>
      <div>
        <div className="eyebrow">Plan · Planner &amp; forecast</div>
        <h1 className="page">Plan budgets that earn more</h1>
        <p className="sub">Lay out your flights, see where an extra {cur} earns most, and what a budget is expected to return. These are plans and suggestions only; nothing is changed in an ad platform.</p>
      </div>
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}><span className="n">1</span>Budget split</h2>
          <span className="eyebrow">Per week · learned from your last 13 weeks</span>
        </div>
        {platforms.length === 0 ? <p className="sub" style={{ margin: 0 }}>Connect an ad platform and let it sync. The planner learns from your own spend and results.</p> : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="t">
                <thead><tr><th style={{ textAlign: "left" }}>Platform</th><th>Weekly spend now</th><th><Term>Platform ROAS</Term></th><th><Term>Store ROAS</Term></th><th>Next {cur} returns</th><th>Suggested</th><th>Expected weekly revenue</th></tr></thead>
                <tbody>
                  {platforms.map((p) => {
                    const r = alloc?.rows.find((a) => a.platform === p), c = chan.get(p), f = fits[p];
                    const mr = f ? marginalRoas(f, current4w[p]!) : null;
                    return (
                      <tr key={p}>
                        <td style={{ textAlign: "left" }}><b style={{ fontWeight: 600 }}>{PLATFORM[p]?.label ?? p}</b></td>
                        <td className="tabnum">{money(current4w[p]!, cur)}</td>
                        <td className="tabnum">{x(c?.platformRoas ?? null)}</td>
                        <td className="tabnum">{x(c?.storeRoas ?? null)}</td>
                        <td className="tabnum">{mr === null ? "—" : x(mr)}</td>
                        <td className="tabnum">{r ? <b style={{ color: r.suggested > r.current * 1.02 ? "var(--pos)" : r.suggested < r.current * 0.98 ? "var(--warn)" : undefined }}>{money(r.suggested, cur)}</b> : f ? "—" : <span className="sub">Not enough weeks yet</span>}</td>
                        <td className="tabnum">{r ? `${money(r.expected, cur)} (${money(r.low, cur)} – ${money(r.high, cur)})` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <form method="get" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label className="eyebrow" htmlFor="budget">Weekly budget to split ({cur})</label>
              <input id="budget" name="budget" type="number" min="1" step="1" defaultValue={weeklyBudget} className="field tabnum" style={{ width: 140, padding: "8px 10px" }} />
              <Button variant="outline">Recalculate</Button>
            </form>
            {alloc ? (
              <p style={{ margin: 0, fontSize: 14 }}>
                {alloc.expected > alloc.currentExpected * 1.005
                  ? <>Moving money this way is expected to bring about <b className="tabnum" style={{ color: "var(--pos)" }}>{money(alloc.expected - alloc.currentExpected, cur)}</b> more platform-reported revenue per week than today&apos;s split. </>
                  : <>Today&apos;s split is already close to the best one the data supports. </>}
                Expected total <b className="tabnum">{money(alloc.expected, cur)}</b>, 80% range <span className="tabnum">{money(alloc.low, cur)} – {money(alloc.high, cur)}</span>.
              </p>
            ) : (
              <p className="sub" style={{ margin: 0, fontSize: 13 }}>A suggested split needs at least two platforms with {MIN_WEEKS}+ weeks of spend that changed from week to week. Until then acezilla shows what it knows and does not guess.</p>
            )}
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>Revenue here is what each platform reports, because that is the only revenue we can tie to spend week by week. Store ROAS is what your store&apos;s own orders confirm. No platform moves more than 50% from today&apos;s spend in one suggestion, since the curve is only known near the spend it was learned from.</p>
          </>
        )}
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">2</span>Flights</h2>
        {flights.length === 0 ? <p className="sub" style={{ margin: 0 }}>No flights yet. Add a sale, a launch or a seasonal push below to see it on the timeline with an expected return.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, padding: "6px 0" }}>
              <div title={`Today ${short(today)}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${pos(today)}%`, borderLeft: "2px dashed var(--accent)" }} />
              {flights.map((f) => (
                <div key={f.id} style={{ position: "relative", height: 26, background: "var(--line)", borderRadius: 6 }}>
                  <div style={{ position: "absolute", left: `${pos(f.startsOn)}%`, width: `${Math.max(pos(shiftDate(f.endsOn, 1)) - pos(f.startsOn), 1.5)}%`, top: 0, bottom: 0, background: "var(--accent)", borderRadius: 6, color: "var(--bg)", fontSize: 12, padding: "4px 8px", overflow: "hidden", whiteSpace: "nowrap" }}>{f.name}</div>
                </div>
              ))}
              <div className="eyebrow" style={{ display: "flex", justifyContent: "space-between" }}><span>{short(shiftDate(lo, -3))}</span><span>Dashed line: today</span><span>{short(shiftDate(hi, 3))}</span></div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="t">
                <thead><tr><th style={{ textAlign: "left" }}>Flight</th><th style={{ textAlign: "left" }}>Dates</th><th style={{ textAlign: "left" }}>Platforms</th><th>Budget</th><th>Expected revenue</th><th /></tr></thead>
                <tbody>
                  {flights.map((f) => {
                    const fc = forecastFlight(f, fits);
                    return (
                      <tr key={f.id}>
                        <td style={{ textAlign: "left" }}><b style={{ fontWeight: 600 }}>{f.name}</b></td>
                        <td style={{ textAlign: "left" }} className="tabnum">{short(f.startsOn)} – {short(f.endsOn)}</td>
                        <td style={{ textAlign: "left" }}>{f.platforms.map((p) => PLATFORM[p]?.label ?? p).join(", ")}</td>
                        <td className="tabnum">{money(f.budget, cur)}</td>
                        <td className="tabnum">{fc ? <>{money(fc.expected, cur)} <span className="sub">({money(fc.low, cur)} – {money(fc.high, cur)}){fc.covered < fc.requested ? ` · ${fc.covered} of ${fc.requested} platforms have a curve` : ""}</span></> : <span className="sub">Needs a curve for one of its platforms</span>}</td>
                        <td><form action={deleteFlight}><input type="hidden" name="id" value={f.id} /><Button variant="ghost">Remove</Button></form></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <form action={addFlight} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Name</span><input name="name" required maxLength={80} placeholder="Black Friday" className="field" style={{ padding: "8px 10px" }} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Starts</span><input name="starts_on" type="date" required defaultValue={today} className="field" style={{ padding: "8px 10px" }} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Ends</span><input name="ends_on" type="date" required defaultValue={shiftDate(today, 13)} className="field" style={{ padding: "8px 10px" }} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="eyebrow">Budget ({cur})</span><input name="budget" type="number" min="0" step="1" required className="field tabnum" style={{ width: 120, padding: "8px 10px" }} /></label>
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0" }}>
            {PLAN_PLATFORMS.map((p) => <label key={p} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="platform" value={p} defaultChecked={p !== "tiktok" && platforms.includes(p)} />{PLATFORM[p]?.label ?? p}</label>)}
          </div>
          <Button>Add flight</Button>
        </form>
        <p className="sub" style={{ margin: 0, fontSize: 12 }}>A flight&apos;s budget is spread evenly over its weeks and over the platforms that have a curve. The range shows how much your past weeks scattered around that curve. It is an estimate, not a promise.</p>
      </Card>
    </>
  );
}
