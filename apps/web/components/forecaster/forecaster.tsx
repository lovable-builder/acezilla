"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { breakEven, CHANNEL_LABEL, CHANNEL_NOTE, compareChannels, contributionPerOrder, marginPerOrder, DESTINATIONS, NOT_OPEN_YET, expectedOutcome, histogram, sensitivity, simulateCampaign, unitEconomics, type CampaignInput, type CampaignOutcome, type ChannelFees, type SalesChannel } from "@acezilla/models";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/app/term";
import { Step, StepFlow } from "@/components/app/step-flow";
import { GLOSSARY } from "@/lib/glossary";
import { int, money, x } from "@/lib/format";
import type { AdPlatform, ForecastDefaults, ForecastProduct, PlatformStats } from "./types";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const txt = (n: number | null, digits = 2) => (n === null || !Number.isFinite(n) ? "" : String(Math.round(n * 10 ** digits) / 10 ** digits));
const pct = (p: number) => (p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
const toneProb = (p: number) => (p >= 0.7 ? "var(--pos)" : p >= 0.4 ? "var(--warn)" : "var(--neg)");
const toneMoney = (v: number) => (v < 0 ? "var(--neg)" : "var(--pos)");
const ASSUMED_SPREAD = 0.25, ASSUMED_CLICKS = 100;
const GLOSSARY_TERMS = ["Budget", "Cost per click", "CPC wobble", "Clicks to order", "Clicks behind that", "Shelf price", "Cost of goods", "VAT", "Commission", "Payment fee", "Shipping you pay", "Returns", "Chance of profit", "Typical profit", "80% range", "Lose over half the budget", "ROAS", "Simulated runs"];

interface Fields { commission: string; fixed: string; payment: string; paymentFixed: string; shipping: string; returns: string }
const feeFields = (f: ChannelFees): Fields => ({ commission: txt(f.commissionRate * 100, 1), fixed: txt(f.fixedPerOrder), payment: txt(f.paymentRate * 100, 1), paymentFixed: txt(f.paymentFixed), shipping: txt(f.shippingPerOrder), returns: txt(f.returnRate * 100, 1) });
const feeValues = (f: Fields): ChannelFees | null => {
  const v = { commissionRate: num(f.commission) / 100, fixedPerOrder: num(f.fixed), paymentRate: num(f.payment) / 100, paymentFixed: num(f.paymentFixed), shippingPerOrder: num(f.shipping), returnRate: num(f.returns) / 100 };
  return Object.values(v).every((n) => Number.isFinite(n) && n >= 0) && v.commissionRate + v.paymentRate < 1 && v.returnRate < 1 ? v : null;
};

function Field({ label, value, onChange, suffix, hint, wide }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; hint?: string; wide?: boolean }) {
  return (
    <label className="bw-label" style={wide ? { gridColumn: "span 2" } : undefined}>
      <span className="eyebrow"><Term>{label}</Term>{suffix ? ` (${suffix})` : ""}</span>
      <input className="field tabnum" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>{hint}</span>}
    </label>
  );
}

/**
 * Imagine a campaign and play it out 10,000 times. Cost per click wanders, the conversion rate is only known to a degree,
 * orders and returns are luck. Everything shown is computed in the browser from the numbers typed here; nothing is sent anywhere.
 */
export function Forecaster({ d }: { d: ForecastDefaults }) {
  const cur = d.currency;
  const start = d.platforms.find((p) => p.cpc !== null) ?? d.platforms[0]!;
  const fromPlatform = (p: PlatformStats) => ({ cpc: txt(p.cpc), spread: txt(p.cpcSpread === null ? null : p.cpcSpread * 100, 0), cvr: txt(p.cvr === null ? null : p.cvr * 100, 2), clicks: p.clicks >= 30 ? String(p.clicks) : "", budget: d.dailyBudget[p.id] ? String(d.dailyBudget[p.id]! * 14) : p.spend > 0 && p.days > 0 ? String(Math.max(1, Math.round((p.spend / p.days) * 14))) : "" });

  const [platform, setPlatform] = useState<AdPlatform>(start.id);
  const [ad, setAd] = useState(() => fromPlatform(start));
  /** Products you can pick for a destination: Allegro offers for Allegro, the website catalogue for the website and the shops that list it. TikTok Shop products are not synced. */
  const productsFor = (c: SalesChannel) => d.products.filter((q) => (c === "allegro" ? q.channel === "allegro" : c === "tiktokshop" ? false : q.channel === "woocommerce"));
  const withProduct = (q: ForecastProduct, c: SalesChannel) => (q.channel === c ? { ...d.fees[c], commissionRate: q.commissionRate ?? d.fees[c].commissionRate, shippingPerOrder: q.shipping ?? d.fees[c].shippingPerOrder } : d.fees[c]);
  const startChannel = DESTINATIONS[start.id][0]!;
  const p0 = productsFor(startChannel)[0];
  const [productId, setProductId] = useState(p0?.id ?? "");
  const [channel, setChannel] = useState<SalesChannel>(startChannel);
  const [price, setPrice] = useState(p0 ? txt(p0.price) : "");
  const [unitCost, setUnitCost] = useState(p0 ? txt(p0.unitCost) : "");
  const [vat, setVat] = useState(txt(d.vatRate * 100, 1));
  const [fees, setFees] = useState<Fields>(() => feeFields(p0 ? withProduct(p0, startChannel) : d.fees[startChannel]));
  const stats = d.platforms.find((p) => p.id === platform)!;

  const chooseDestination = (c: SalesChannel) => {
    setChannel(c);
    const q = productsFor(c)[0];
    if (q) { setProductId(q.id); setPrice(txt(q.price)); setUnitCost(txt(q.unitCost)); setFees(feeFields(withProduct(q, c))); }
    else { setProductId(""); setPrice(""); setUnitCost(""); setFees(feeFields(d.fees[c])); }
  };
  const pickPlatform = (id: AdPlatform) => {
    setPlatform(id); setAd(fromPlatform(d.platforms.find((q) => q.id === id)!));
    // Each ad platform can only send shoppers to some places: keep the destination if it is still possible, else take the first.
    chooseDestination(DESTINATIONS[id].includes(channel) ? channel : DESTINATIONS[id][0]!);
  };
  const pickProduct = (id: string) => {
    setProductId(id);
    const q = d.products.find((x) => x.id === id);
    if (!q) return;
    setPrice(txt(q.price)); setUnitCost(txt(q.unitCost)); setFees(feeFields(withProduct(q, channel)));
  };
  const set = (k: keyof Fields) => (v: string) => setFees((f) => ({ ...f, [k]: v }));

  const feeVals = feeValues(fees);
  const budget = num(ad.budget), cpc = num(ad.cpc), cvr = num(ad.cvr) / 100, p = num(price), cost = num(unitCost), vr = num(vat) / 100;
  const spreadGiven = Number.isFinite(num(ad.spread)), clicksGiven = Number.isFinite(num(ad.clicks));
  const input: CampaignInput | null = feeVals && budget > 0 && cpc > 0 && cvr > 0 && cvr < 1 && p > 0 && cost >= 0 && vr >= 0 && Number.isFinite(cost) && Number.isFinite(vr)
    ? { budget, cpc: { mean: cpc, spread: spreadGiven ? Math.max(0, num(ad.spread) / 100) : ASSUMED_SPREAD }, cvr: { mean: cvr, clicks: clicksGiven ? num(ad.clicks) : ASSUMED_CLICKS }, price: p, unitCost: cost, vatRate: vr, fees: feeVals }
    : null;

  const sim = useMemo(() => (input ? simulateCampaign(input, { trials: 10000, seed: 1 }) : null), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const sens = useMemo(() => (input ? sensitivity(input, { trials: 3000, seed: 1 }) : []), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmp = useMemo(() => (input ? compareChannels(input, DESTINATIONS[platform], { ...d.fees, [channel]: input.fees }, { trials: 3000, seed: 1 }) : []), [JSON.stringify(input), channel, platform]); // eslint-disable-line react-hooks/exhaustive-deps
  const be = input ? breakEven(input) : null;
  const avg = input ? expectedOutcome(input) : null;
  const bins = useMemo(() => (sim ? histogram(sim.profits, 40) : []), [sim]);

  const fromHistory = stats.cpc !== null;
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">1</span>Imagine the campaign</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">Ads</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
            <label className="bw-label"><span className="eyebrow"><Term>Ad platform</Term></span>
              <select className="field" value={platform} onChange={(e) => pickPlatform(e.target.value as AdPlatform)}>{d.platforms.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}</select></label>
            <Field label="Budget" suffix={cur} value={ad.budget} onChange={(v) => setAd((a) => ({ ...a, budget: v }))} hint="whole campaign" />
            <Field label="Cost per click" suffix={cur} value={ad.cpc} onChange={(v) => setAd((a) => ({ ...a, cpc: v }))} />
            <Field label="CPC wobble" suffix="%" value={ad.spread} onChange={(v) => setAd((a) => ({ ...a, spread: v }))} hint={spreadGiven ? "week to week" : `blank = ${ASSUMED_SPREAD * 100}% assumed`} />
            <Field label="Clicks to order" suffix="%" value={ad.cvr} onChange={(v) => setAd((a) => ({ ...a, cvr: v }))} />
            <Field label="Clicks behind that" value={ad.clicks} onChange={(v) => setAd((a) => ({ ...a, clicks: v }))} hint={clicksGiven ? "more = less doubt" : `blank = ${ASSUMED_CLICKS} assumed`} />
          </div>
          <div className="sub" style={{ margin: 0, fontSize: 12 }}>
            {fromHistory
              ? stats.source === "report"
                ? <>Filled from the Allegro Ads report you uploaded: {int(stats.clicks)} clicks over {stats.days} days, cost without VAT like everywhere in acezilla. &ldquo;Clicks to order&rdquo; is the units Allegro credits to your ads, which can include sales that would have happened anyway. Allegro bills ads per click, so your budget here is a daily cap times days.</>
                : <>Filled from your {stats.label} history: {int(stats.clicks)} clicks over {stats.days} days. The conversion rate is what the platform reports, and a platform usually counts more orders than your store confirms, so lower it if unsure.</>
              : stats.source === "report"
                ? <>No Allegro Ads report to learn from yet. Upload one on <a href="/attribution" className="link">Attribution</a> to fill cost per click and orders per click, or type your own; they are assumptions, and the result is only as good as they are.</>
                : <>No {stats.label} history to learn from yet, so there are no starting numbers. Type your own; they are assumptions, and the result is only as good as they are.</>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">What you sell and where</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
            <label className="bw-label"><span className="eyebrow"><Term>Where the ad sends shoppers</Term></span>
              <select className="field" value={channel} onChange={(e) => chooseDestination(e.target.value as SalesChannel)}>{DESTINATIONS[platform].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}{NOT_OPEN_YET.includes(c) ? " (not open yet)" : ""}</option>)}</select></label>
            <label className="bw-label" style={{ gridColumn: "span 2" }}><span className="eyebrow">Product (fills price and cost)</span>
              <select className="field" value={productId} onChange={(e) => pickProduct(e.target.value)}>
                <option value="">Type it in myself</option>
                {productsFor(channel).map((q) => <option key={q.id} value={q.id}>{q.name.slice(0, 70)}</option>)}
              </select></label>
            <Field label="Shelf price" suffix={`${cur}, with VAT`} value={price} onChange={setPrice} />
            <Field label="Cost of goods" suffix={`${cur}, per unit`} value={unitCost} onChange={setUnitCost} hint={productId && unitCost === "" ? "no cost entered for this product" : undefined} />
            <Field label="VAT" suffix="%" value={vat} onChange={setVat} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">{CHANNEL_LABEL[channel]} fees{NOT_OPEN_YET.includes(channel) ? " · placeholders" : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
            <Field label="Commission" suffix="%" value={fees.commission} onChange={set("commission")} hint={d.observed[channel].includes("commission") ? "from your fee history" : "typical, edit"} />
            <Field label="Fixed fee per order" suffix={cur} value={fees.fixed} onChange={set("fixed")} />
            <Field label="Payment fee" suffix="%" value={fees.payment} onChange={set("payment")} />
            <Field label="Payment fixed" suffix={cur} value={fees.paymentFixed} onChange={set("paymentFixed")} />
            <Field label="Shipping you pay" suffix={cur} value={fees.shipping} onChange={set("shipping")} hint={d.observed[channel].includes("shipping and other fees") ? "from your fee history" : undefined} />
            <Field label="Returns" suffix="% of orders" value={fees.returns} onChange={set("returns")} />
          </div>
          <div className="sub" style={{ margin: 0, fontSize: 12 }}>{CHANNEL_NOTE[channel]} The ad platform itself only charges you for clicks above, never a commission on the sale. Rates marked &ldquo;typical&rdquo; are starting guesses: check your own contract and category. A returned order refunds the price, gives back the goods and commission, and costs shipping both ways.</div>
        </div>
      </Card>

      <Card>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>How does this work? (plain English)</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>Nobody can know exactly how an ad campaign will go. So instead of one hopeful number, acezilla imagines your campaign 10,000 times, each time with slightly different luck, and counts how often it makes money.</p>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><b>Clicks.</b> Your budget buys clicks. A click costs about what you entered, but the price moves from week to week (the <i>wobble</i>), so some runs get more clicks and some fewer.</li>
              <li><b>Orders.</b> Some clicks become orders. You entered the usual rate, but it is only an estimate, especially if it came from few clicks. So each run uses a slightly different rate, and then luck decides which clicks actually buy.</li>
              <li><b>Returns.</b> Some orders come back and are refunded.</li>
              <li><b>Money per order.</b> For each order that stays: the price without VAT, minus the sales channel&apos;s commission, the payment fee, fixed fees, shipping and the cost of the goods. That is what one order leaves before ads.</li>
              <li><b>Profit.</b> Add up what the orders leave, then subtract the ad budget. If it is above zero, that run made money.</li>
              <li><b>The odds.</b> After 10,000 runs, the share that made money is your <b>chance of profit</b>. The middle result is the <b>typical profit</b>. Ignoring the best 1 in 10 and the worst 1 in 10 gives the <b>80% range</b>.</li>
            </ol>
            <p style={{ margin: 0 }}>The forecast is only as good as the numbers you put in. Numbers filled in from your own ad history are the best starting point. Fees marked &ldquo;typical&rdquo; are guesses: replace them with your real rates. Hover or tap any underlined word on this page for a short explanation.</p>
            <div className="eyebrow">Words used on this page</div>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "10px 24px" }}>
              {GLOSSARY_TERMS.map((t) => <div key={t}><dt style={{ fontWeight: 600, fontSize: 13 }}>{t}</dt><dd className="sub" style={{ margin: "2px 0 0", fontSize: 13 }}>{GLOSSARY[t]}</dd></div>)}
            </dl>
          </div>
        </details>
      </Card>

      {!sim || !input || !be || !avg ? (
        <Card>
          {(() => {
            const missing = [!(budget > 0) && "the budget", !(cpc > 0) && "the cost per click", !(cvr > 0) && "the clicks-to-order rate", !(p > 0) && "the price", !Number.isFinite(cost) && "the cost of goods"].filter(Boolean) as string[];
            return <>
              {missing.length ? <>To see the forecast, fill in <b>{missing.join(", ")}</b>.</> : "To see the forecast, check the numbers above."}
              {!Number.isFinite(cost) && <> No cost of goods is saved for this product yet: enter it under Profit per offer on the <Link href="/attribution" style={{ color: "var(--accent-ink)" }}>Attribution</Link> page, or type it here.</>}
              {feeVals ? "" : " One of the fee fields is not a valid number."}
            </>;
          })()}
        </Card>
      ) : (
        <>
          <StepFlow id="forecast">
          <Step label="The odds" hint="Chance of profit and the spread of results">
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="h2" style={{ margin: 0 }}><span className="n">2</span>The odds <span className="eyebrow" style={{ marginLeft: 8 }}>{int(sim.trials)} <Term>Simulated runs</Term> of this campaign</span></h2>
            <div className="kpis">
              {([
                ["Chance of profit", pct(sim.probProfit), toneProb(sim.probProfit), `${pct(sim.probLoss)} chance of a loss`],
                ["Typical profit", money(sim.q.p50, cur), toneMoney(sim.q.p50), `average ${money(sim.mean, cur)}`],
                ["80% range", `${money(sim.q.p10, cur)} to ${money(sim.q.p90, cur)}`, "var(--ink)", "8 in 10 runs land here"],
                ["Lose over half the budget", pct(sim.probLoseHalf), sim.probLoseHalf > 0.2 ? "var(--neg)" : "var(--ink)", `worst 1% lose ${money(Math.abs(Math.min(sim.q.p01, 0)), cur)}+`],
                ["ROAS", `${x(sim.platformRoas)} · ${x(sim.storeRoas)}`, "var(--ink)", "platform says · store keeps"],
              ] as [string, string, string, string][]).map(([label, value, color, sub], i) => (
                <div className="kpi rise" style={{ "--i": i } as React.CSSProperties} key={i}>
                  <span className="eyebrow"><Term>{label}</Term></span>
                  <span className="tabnum" style={{ fontSize: 22, fontWeight: 600, color, overflowWrap: "anywhere" }}>{value}</span>
                  <span className="mono tabnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{sub}</span>
                </div>
              ))}
            </div>
            <Card style={{ borderColor: "var(--accent)" }}>
              <b style={{ fontWeight: 600 }}>In plain words</b>
              <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6 }}>
                Your {money(budget, cur)} budget buys about <b className="tabnum">{int(avg.clicks)}</b> clicks at {money(cpc, cur)} each. At {(cvr * 100).toFixed(2)}% of clicks ordering, that is about <b className="tabnum">{avg.orders.toFixed(1)}</b> orders.
                After VAT, the fees for {CHANNEL_LABEL[channel]}, shipping, returns and the goods, each order leaves about <b className="tabnum">{money(avg.orders > 0 ? (avg.storeRevenue - avg.channelFees - avg.goods - avg.shipping) / avg.orders : 0, cur)}</b> before ads.
                {" "}{avg.profit >= 0
                  ? <>Averaged out, that is a profit of <b className="tabnum" style={{ color: "var(--pos)" }}>{money(avg.profit, cur)}</b>.</>
                  : <>Averaged out, that is a loss of <b className="tabnum" style={{ color: "var(--neg)" }}>{money(-avg.profit, cur)}</b>.</>}
                {" "}But no campaign lands exactly on the average, which is why the odds above matter: {pct(sim.probProfit)} of the {int(sim.trials)} imagined runs made money.
              </p>
              <div className="eyebrow" style={{ marginTop: 12 }}>One order, step by step</div>
              <table className="t tabnum" style={{ marginTop: 4 }}>
                <tbody>
                  {([
                    ["Shelf price (what the customer pays)", p],
                    [`VAT ${(vr * 100).toFixed(0)}% (goes to the tax office, not you)`, -(p - p / (1 + vr))],
                    [`${CHANNEL_LABEL[channel]} commission and fixed fee`, -(p / (1 + vr) * input.fees.commissionRate + input.fees.fixedPerOrder)],
                    ["Payment fee", -(p / (1 + vr) * input.fees.paymentRate + input.fees.paymentFixed)],
                    ["Shipping you pay", -input.fees.shippingPerOrder],
                    ["Cost of goods", -cost],
                  ] as [string, number][]).map(([label, v]) => (
                    <tr key={label}><td style={{ textAlign: "left" }}>{label}</td><td style={{ color: v < 0 ? "var(--ink2)" : undefined }}>{v < 0 ? "−" : ""}{money(Math.abs(v), cur)}</td></tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}><td style={{ textAlign: "left" }}>Left from one order that stays</td><td>{money(marginPerOrder(input), cur)}</td></tr>
                  <tr><td style={{ textAlign: "left" }}>…after counting {(input.fees.returnRate * 100).toFixed(0)}% returned orders</td><td>{money(contributionPerOrder(input), cur)}</td></tr>
                  <tr><td style={{ textAlign: "left" }}>Ads needed to win one order ({money(cpc, cur)} per click ÷ {(cvr * 100).toFixed(2)}%)</td><td style={{ color: "var(--ink2)" }}>−{money(be.adCostPerOrder ?? 0, cur)}</td></tr>
                  <tr style={{ fontWeight: 600 }}><td style={{ textAlign: "left" }}>Profit per order, on average</td><td style={{ color: toneMoney(contributionPerOrder(input) - (be.adCostPerOrder ?? 0)) }}>{money(contributionPerOrder(input) - (be.adCostPerOrder ?? 0), cur)}</td></tr>
                </tbody>
              </table>
              <p className="sub" style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.6 }}>
                So the price minus the cost of goods ({money(p - cost, cur)}) is not your profit: VAT, the sales channel, shipping, returns and the ads all come out of it first.
                You may see three profit figures. <b>Average case</b> ({money(avg.profit, cur)}) assumes every number lands exactly as typed. The simulation&apos;s <b>average</b> ({money(sim.mean, cur)}) adds up all {int(sim.trials)} runs, so a few lucky runs pull it up. <b>Typical</b> ({money(sim.q.p50, cur)}) is the middle run.
                {!clicksGiven ? " Typical sits lower here because \u201cClicks behind that\u201d is blank, so we assumed the conversion rate came from only 100 clicks. That is a lot of doubt: fill in how many clicks it was measured from to narrow the results." : " They are furthest apart when you are unsure of the conversion rate, because a few big wins and many near-misses make the results lopsided."}
              </p>
            </Card>
            <Card>
              <Histogram bins={bins} q={sim.q} cur={cur} />
              <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Each bar counts how many of the {int(sim.trials)} runs ended at that profit. Red is a loss, green a profit. Dashed lines mark the 1-in-10 bad run, the typical run and the 1-in-10 good run.</p>
            </Card>
          </section>
          </Step>

          <Step label="Bad, typical, good" hint="Three runs from the 10,000">
          <Card style={{ overflowX: "auto" }}>
            <h2 className="h2"><span className="n">3</span><Term>Bad, typical and good run</Term></h2>
            <table className="t tabnum">
              <thead><tr><th style={{ textAlign: "left" }} /><th>Bad (1 in 10 worse)</th><th>Typical</th><th>Good (1 in 10 better)</th></tr></thead>
              <tbody>
                {([
                  ["Clicks", (o) => int(o.clicks)], ["Orders", (o) => int(o.orders)], ["Returned", (o) => int(o.returned)],
                  ["Store revenue (no VAT)", (o) => money(o.storeRevenue, cur)], ["Channel and payment fees", (o) => `−${money(o.channelFees, cur)}`],
                  ["Cost of goods", (o) => `−${money(o.goods, cur)}`], ["Shipping and returns", (o) => `−${money(o.shipping, cur)}`], ["Ads", (o) => `−${money(o.ads, cur)}`],
                  ["Profit", (o) => money(o.profit, cur)],
                ] as [string, (o: CampaignOutcome) => string][]).map(([label, f]) => (
                  <tr key={label} style={label === "Profit" ? { fontWeight: 600 } : undefined}>
                    <td style={{ textAlign: "left" }}>{label}</td>
                    {[sim.scenarios.pessimistic, sim.scenarios.base, sim.scenarios.optimistic].map((o, i) => <td key={i} style={label === "Profit" ? { color: toneMoney(o.profit) } : undefined}>{f(o)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          </Step>

          <Step label="Break-even" hint="What each input must reach to cover the ads">
          <Card style={{ overflowX: "auto" }}>
            <h2 className="h2"><span className="n">4</span><Term>What you need to break even</Term></h2>
            <table className="t tabnum">
              <thead><tr><th style={{ textAlign: "left" }}>If everything else stays the same</th><th>You need</th><th>You assumed</th><th /></tr></thead>
              <tbody>
                {([
                  ["Clicks that become orders", be.cvr === null ? null : `${(be.cvr * 100).toFixed(2)}% or more`, `${(cvr * 100).toFixed(2)}%`, be.cvr !== null && cvr >= be.cvr],
                  ["Cost per click", be.cpc === null ? null : `${money(be.cpc, cur)} or less`, money(cpc, cur), be.cpc !== null && cpc <= be.cpc],
                  ["Shelf price (with VAT)", be.price === null ? null : `${money(be.price, cur)} or more`, money(p, cur), be.price !== null && p >= be.price],
                  ["Cost of goods", be.unitCost === null ? null : `${money(be.unitCost, cur)} or less`, money(cost, cur), be.unitCost !== null && cost <= be.unitCost],
                  ["Orders to cover the budget", be.orders === null ? null : `${int(Math.ceil(be.orders))} or more`, `${int(avg.orders)} expected`, be.orders !== null && avg.orders >= be.orders],
                ] as [string, string | null, string, boolean][]).map(([label, need, have, ok]) => (
                  <tr key={label}>
                    <td style={{ textAlign: "left" }}>{label}</td><td>{need ?? "Not possible: an order earns nothing"}</td><td>{have}</td>
                    <td><span className={`seo-chip seo-chip-${need === null ? "missing" : ok ? "good" : "attention"}`}>{need === null ? "No" : ok ? "Covered" : "Short"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Each order costs {be.adCostPerOrder === null ? "—" : money(be.adCostPerOrder, cur)} in ads ({money(cpc, cur)} per click ÷ {(cvr * 100).toFixed(2)}% of clicks ordering) and leaves {money(avg.orders > 0 ? (avg.storeRevenue - avg.channelFees - avg.goods - avg.shipping) / avg.orders : 0, cur)} on average before ads.</p>
          </Card>
          </Step>

          <Step label="Price and drivers" hint="Where each sale goes, and what moves the result">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 24, alignItems: "start" }}>
            <Card>
              <h2 className="h2"><span className="n">5</span><Term k="Where one sale's price goes">Where one sale&apos;s price goes</Term></h2>
              <Waterfall parts={unitEconomics(input)} cur={cur} price={input.price} />
            </Card>
            <Card>
              <h2 className="h2"><span className="n">6</span><Term>What moves the result most</Term></h2>
              <Tornado rows={sens} base={sim.q.p50} cur={cur} />
              <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Typical profit when each input is 20% lower (grey) or 20% higher (purple), the rest unchanged.</p>
            </Card>
          </div>
          </Step>

          <Step label="Other destinations" hint="The same campaign sending shoppers elsewhere">
          <Card style={{ overflowX: "auto" }}>
            <h2 className="h2"><span className="n">7</span>Same {d.platforms.find((q) => q.id === platform)!.label} campaign, different destination</h2>
            <table className="t tabnum">
              <thead><tr><th style={{ textAlign: "left" }}>Where shoppers land</th><th>Chance of profit</th><th>Typical profit</th><th>80% range</th></tr></thead>
              <tbody>
                {cmp.map((c) => (
                  <tr key={c.channel} style={c.channel === channel ? { fontWeight: 600 } : undefined}>
                    <td style={{ textAlign: "left" }}>{CHANNEL_LABEL[c.channel]}{c.channel === channel ? " (your fees above)" : " (starting fees)"}</td>
                    <td style={{ color: toneProb(c.probProfit) }}>{pct(c.probProfit)}</td><td style={{ color: toneMoney(c.median) }}>{money(c.median, cur)}</td><td>{money(c.p10, cur)} to {money(c.p90, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Other destinations use their starting fees, not yours. Sending shoppers somewhere else also changes the conversion rate, which this does not model: a shop inside the app usually converts differently from your website.</p>
          </Card>
          </Step>
          </StepFlow>

          <p className="sub" style={{ margin: 0, fontSize: 12 }}>This is a forecast from the numbers you entered, not a promise. It assumes the budget is fully spent, cost per click wanders around its average, and the conversion rate is uncertain in proportion to how few clicks it was learned from. It does not know about seasons, competitors, stock, or whether the creative is any good.</p>
          <div><Button variant="ghost" type="button" onClick={() => { setAd(fromPlatform(d.platforms.find((q) => q.id === platform)!)); chooseDestination(channel); }}>Reset</Button></div>
        </>
      )}
    </div>
  );
}

function Histogram({ bins, q, cur }: { bins: { from: number; to: number; count: number }[]; q: { p10: number; p50: number; p90: number }; cur: string }) {
  const W = 920, H = 240, pad = { l: 12, r: 12, t: 22, b: 34 };
  if (bins.length === 0) return null;
  const lo = bins[0]!.from, hi = bins[bins.length - 1]!.to, maxC = Math.max(...bins.map((b) => b.count), 1);
  const X = (v: number) => pad.l + ((v - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const bw = (W - pad.l - pad.r) / bins.length;
  const mark = (v: number, label: string) => v >= lo && v <= hi ? <g key={label}><line x1={X(v)} x2={X(v)} y1={pad.t - 6} y2={H - pad.b} stroke="var(--ink2)" strokeDasharray="3 4" /><text x={X(v)} y={pad.t - 9} fontSize={10} textAnchor="middle" fill="var(--ink2)" className="mono">{label}</text></g> : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="How many simulated runs ended at each profit" style={{ display: "block" }}>
      {bins.map((b, i) => {
        const h = (b.count / maxC) * (H - pad.t - pad.b), mid = (b.from + b.to) / 2;
        return <rect key={i} x={pad.l + i * bw + 1} width={Math.max(bw - 2, 1)} y={H - pad.b - h} height={h} rx={2} fill={mid < 0 ? "var(--neg)" : "var(--pos)"} opacity={0.85} />;
      })}
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line2)" />
      {0 > lo && 0 < hi && <g><line x1={X(0)} x2={X(0)} y1={pad.t} y2={H - pad.b + 4} stroke="var(--ink)" strokeWidth={1.5} /><text x={X(0)} y={H - 14} fontSize={10} textAnchor="middle" fill="var(--ink)" className="mono">break even</text></g>}
      <text x={pad.l} y={H - 2} fontSize={10} fill="var(--ink3)" className="mono">{money(lo, cur)}</text>
      <text x={W - pad.r} y={H - 2} fontSize={10} textAnchor="end" fill="var(--ink3)" className="mono">{money(hi, cur)}</text>
      {mark(q.p10, "1 in 10 worse")}{mark(q.p50, "typical")}{mark(q.p90, "1 in 10 better")}
    </svg>
  );
}

const SEG: Record<string, string> = { VAT: "var(--line2)", "Marketplace commission": "var(--accent)", "Payment fee": "var(--accent-ink)", Shipping: "var(--warn)", "Cost of goods": "var(--ink3)", Ads: "var(--ink2)" };
function Waterfall({ parts, cur, price }: { parts: { label: string; amount: number }[]; cur: string; price: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", height: 22, borderRadius: 8, overflow: "hidden", background: "var(--line)" }} role="img" aria-label="Split of one sale's price">
        {parts.map((p) => p.amount > 0 && <div key={p.label} title={`${p.label} ${money(p.amount, cur)}`} style={{ width: `${(p.amount / price) * 100}%`, background: p.label === "Left over" ? "var(--pos)" : SEG[p.label] }} />)}
      </div>
      <table className="t tabnum">
        <tbody>
          {parts.map((p) => (
            <tr key={p.label} style={p.label === "Left over" ? { fontWeight: 600 } : undefined}>
              <td style={{ textAlign: "left" }}><span aria-hidden style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, marginRight: 8, background: p.label === "Left over" ? (p.amount < 0 ? "var(--neg)" : "var(--pos)") : SEG[p.label] }} />{p.label}</td>
              <td>{p.label === "Left over" ? money(p.amount, cur) : money(p.amount, cur)}</td>
              <td style={{ color: "var(--ink3)" }}>{((p.amount / price) * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tornado({ rows, base, cur }: { rows: { label: string; lowMedian: number; highMedian: number }[]; base: number; cur: string }) {
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.lowMedian - base), Math.abs(r.highMedian - base)]), 1);
  // Change in typical profit against today's assumption: left of the line is worse, right is better.
  const bar = (delta: number, color: string) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: 8 }} aria-hidden>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>{delta < 0 && <div style={{ width: `${(Math.abs(delta) / max) * 100}%`, background: color, borderRadius: "4px 0 0 4px", minWidth: 2 }} />}</div>
      <div style={{ borderLeft: "1px solid var(--line2)" }}>{delta > 0 && <div style={{ width: `${(delta / max) * 100}%`, background: color, borderRadius: "0 4px 4px 0", minWidth: 2 }} />}</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(90px,1fr) 2fr", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{r.label}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {bar(r.lowMedian - base, "var(--ink3)")}
            {bar(r.highMedian - base, "var(--accent)")}
            <div className="mono tabnum" style={{ fontSize: 11, color: "var(--ink3)" }}>−20%: {money(r.lowMedian, cur)} · +20%: {money(r.highMedian, cur)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
