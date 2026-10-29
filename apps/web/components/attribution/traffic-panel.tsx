import Link from "next/link";
import { buildTraffic, HEALTHY_MAX, HEALTHY_MIN, MIN_CLICKS, type DailyRow, type GaRow, type Verdict } from "@acezilla/models";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PairBars } from "@/components/dash/bars";
import { Sparkline } from "@/components/dash/charts";
import { Term } from "@/components/app/term";
import { ago, int, money } from "@/lib/format";

const VERDICT: Record<Verdict, { chip: string; label: string; text: (clicks: number, visits: number) => string }> = {
  ok: { chip: "good", label: "Healthy", text: () => "Visits match the clicks you paid for, as expected." },
  lost: { chip: "missing", label: "Clicks lost", text: (c, v) => `${int(c)} paid clicks but only ${int(v)} visits. People may leave before the page loads, the page may be slow, or the Analytics tag may not run on your landing page.` },
  over: { chip: "attention", label: "Too many visits", text: (c, v) => `${int(v)} visits from only ${int(c)} clicks. Visits are probably being labelled with the wrong channel, or ad links are missing their tracking tags (utm).` },
  too_little: { chip: "not_measured", label: "Too early", text: () => `Fewer than ${MIN_CLICKS} clicks in this period, too few to judge.` },
  no_ad_data: { chip: "not_measured", label: "No ad data", text: (_c, v) => `Analytics saw ${int(v)} visits from this channel, but no ad clicks are synced for these days, so there is nothing to compare. Check that the ad account is connected and synced on Connections, and that it was running in this period.` },
  no_visits: { chip: "missing", label: "No visits", text: (c) => `${int(c)} paid clicks and no visits at all in Analytics. The tag is missing from your site, or these ads send people somewhere that is not tracked.` },
};

/**
 * Google Analytics next to the ad platforms: how many of the clicks you paid for turned up as visits, what a visit costs,
 * and where all visits come from. Server-rendered; no script.
 */
export function TrafficPanel({ ga, ads, start, end, cur }: {
  ga: { status: string; lastSync: string | null; error: string | null; properties: { name: string; currency: string | null }[]; rows: GaRow[] } | null;
  ads: DailyRow[]; start: string; end: string; cur: string;
}) {
  if (!ga) {
    return (
      <Card style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <span style={{ color: "var(--ink2)" }}>Connect Google Analytics to see how many of the clicks you pay for arrive on your website, and where your visitors come from.</span>
        <Button asChild variant="outline"><Link href="/connections">Connect Google Analytics</Link></Button>
      </Card>
    );
  }
  const t = buildTraffic({ ga: ga.rows, ads, start, end });
  const broken = ga.status === "error" || ga.status === "needs_reauth";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sub" style={{ margin: 0, fontSize: 13 }}>
        {ga.properties.length > 0 ? ga.properties.map((p) => p.name).join(", ") : "No property chosen"} · last updated {ago(ga.lastSync)}
        {broken && <span style={{ color: "var(--neg)" }}> · {ga.status === "needs_reauth" ? "login expired, reconnect on Connections" : `sync failing: ${ga.error ?? "unknown error"}`}</span>}
      </div>

      {ga.properties.length === 0 && <Card>No Analytics property is selected. <Link href="/connections/ga4" className="link">Choose one</Link> to start importing visits.</Card>}
      {ga.properties.length > 0 && t.visits === 0 && <Card>Analytics has no visits recorded between {start} and {end}. If the property is new, data appears after the first sync; otherwise check that the Analytics tag is on your website.</Card>}

      {t.visits > 0 && (
        <>
          <div className="kpis">
            {([
              ["Visits", int(t.visits), "var(--ink)", `${int(t.series.length)} days with traffic`, <Sparkline key="s" data={t.series.map((s) => s.visits)} />],
              ["Key events", int(t.keyEvents), "var(--ink)", "actions you track in Analytics", null],
              ["Visit to key event", t.keyEventRate === null ? "—" : `${(t.keyEventRate * 100).toFixed(1)}%`, "var(--ink)", "of visits did something that counts", null],
              ["Purchase revenue", t.hasRevenue ? money(t.revenue, ga.properties[0]?.currency || cur) : "Not recorded", t.hasRevenue ? "var(--ink)" : "var(--warn)", t.hasRevenue ? "as Analytics saw it" : "no purchase events arrive", null],
            ] as [string, string, string, string, React.ReactNode][]).map(([label, value, color, sub, extra], i) => (
              <div className="kpi rise" style={{ "--i": i } as React.CSSProperties} key={label}>
                <span className="eyebrow"><Term>{label}</Term></span>
                <span className="tabnum" style={{ fontSize: 22, fontWeight: 600, color }}>{value}</span>
                <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{sub}</span>
                {extra}
              </div>
            ))}
          </div>
          {!t.hasRevenue && <Card style={{ fontSize: 13 }}>Analytics shows <b>no purchase revenue</b>. Your site is not sending purchase events to Analytics (or they carry no value), so Analytics cannot say what the visits earned. Turn on e-commerce tracking in the plugin that adds Analytics to your site. Until then, store orders above remain the source of truth for revenue.</Card>}

          {t.compare.length > 0 && (
            <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <b>Did the clicks you paid for arrive?</b>
                <p className="sub" style={{ margin: "2px 0 0", fontSize: 13 }}>Clicks are what the ad platform billed you for. Visits are what Analytics saw on your site from the same channel. They are never exactly equal: {Math.round(HEALTHY_MIN * 100)}% to {Math.round(HEALTHY_MAX * 100)}% is normal.</p>
              </div>
              <PairBars cur={cur} fmt={(n) => int(n)} rows={t.compare.map((c) => ({ label: c.label.replace(/ \(.*\)/, ""), a: { label: "Ad clicks", value: c.clicks }, b: { label: "Visits in Analytics", value: c.visits } }))} />
              <div style={{ overflowX: "auto" }}>
                <table className="t tabnum">
                  <thead><tr><th style={{ textAlign: "left" }}>Channel</th><th><Term>Ad clicks</Term></th><th><Term>Visits</Term></th><th><Term>Visits per click</Term></th><th><Term>Cost per visit</Term></th><th><Term>Key events</Term></th><th /></tr></thead>
                  <tbody>
                    {t.compare.map((c) => (
                      <tr key={c.id}>
                        <td style={{ textAlign: "left" }}>{c.label}</td><td>{int(c.clicks)}</td><td>{int(c.visits)}</td>
                        <td>{c.ratio === null ? "—" : `${Math.round(c.ratio * 100)}%`}</td><td>{c.costPerVisit === null ? "—" : money(c.costPerVisit, cur)}</td><td>{int(c.keyEvents)}</td>
                        <td><span className={`seo-chip seo-chip-${VERDICT[c.verdict].chip}`}>{VERDICT[c.verdict].label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {t.compare.filter((c) => c.verdict !== "ok").map((c) => <li key={c.id} style={{ fontSize: 13 }}><b style={{ fontWeight: 600 }}>{c.label}:</b> {VERDICT[c.verdict].text(c.clicks, c.visits)}</li>)}
              </ul>
              <p className="sub" style={{ margin: 0, fontSize: 12 }}>Meta and TikTok both arrive in Analytics as &ldquo;Paid Social&rdquo;, so they can only be compared together. Allegro Ads send people to Allegro, not your website, so they are not here.</p>
            </Card>
          )}

          <Card style={{ overflowX: "auto" }}>
            <b>Where visits come from</b>
            <table className="t tabnum" style={{ marginTop: 8 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Channel</th><th><Term>Visits</Term></th><th>Share</th><th><Term>Key events</Term></th><th><Term>Visit to key event</Term></th>{t.hasRevenue && <th><Term>Purchase revenue</Term></th>}</tr></thead>
              <tbody>
                {t.channels.map((c, i) => (
                  <tr key={c.channel}>
                    <td style={{ textAlign: "left" }}>{c.channel}</td><td>{int(c.visits)}</td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                        <div style={{ width: 60, height: 8, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}><div className="grow" style={{ "--i": i, width: `${c.share * 100}%`, height: "100%", background: "var(--accent)" } as React.CSSProperties} /></div>
                        {(c.share * 100).toFixed(0)}%
                      </div>
                    </td>
                    <td>{int(c.keyEvents)}</td><td>{c.keyEventRate === null ? "—" : `${(c.keyEventRate * 100).toFixed(1)}%`}</td>
                    {t.hasRevenue && <td>{c.revenue > 0 ? money(c.revenue, ga.properties[0]?.currency || cur) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>These are Analytics&apos; own channel groups. &ldquo;Direct&rdquo; includes visits Analytics could not trace to a source, so a large Direct share often hides ad traffic that is missing its tracking tags.</p>
          </Card>
        </>
      )}
    </div>
  );
}
