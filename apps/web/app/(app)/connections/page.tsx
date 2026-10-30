import Link from "next/link";
import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Step as FlowStep, StepFlow } from "@/components/app/step-flow";
import { BrandLogo } from "@/components/brand/logo";
import { ago } from "@/lib/format";
import { syncNow } from "./connection-actions";
import { allegroEnv } from "@/lib/allegro";

const CONNECTED_BG = "color-mix(in oklab, var(--pos) 7%, var(--surface))";

export default async function Connections({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const { supabase, current } = await getWorkspaceContext();
  const [{ data: conns }, { data: accts }, { data: props }, { data: mAccts }, { data: sSites }, { data: camps }] = current
    ? await Promise.all([
        supabase.from("connection").select("platform,last_sync_at,status,last_error,token_expires_at,external_user_id").eq("workspace_id", current.id),
        supabase.from("ad_account").select("platform,name").eq("workspace_id", current.id).order("name"),
        supabase.from("analytics_property").select("name").eq("workspace_id", current.id).order("name"),
        supabase.from("merchant_account").select("name").eq("workspace_id", current.id).order("name"),
        supabase.from("search_site").select("name").eq("workspace_id", current.id).order("name"),
        supabase.from("campaign").select("platform").eq("workspace_id", current.id).limit(5000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const conn = (p: string) => conns?.find((c) => c.platform === p);
  const names = (p: string) => (accts ?? []).filter((a) => a.platform === p).map((a) => a.name as string);
  const metaReady = !!(process.env.META_APP_ID && process.env.META_CONFIG_ID && process.env.META_APP_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const woo = conn("woocommerce");
  const allegro = conn("allegro");
  const ga4 = conn("ga4");
  const merchant = conn("merchant");
  const searchc = conn("searchconsole");
  // How many accounts were picked on each connection that needs a pick. Zero means connected but empty.
  const chosen: Record<string, number> = {
    meta: names("meta").length, google: names("google").length, ga4: (props ?? []).length, merchant: (mAccts ?? []).length, searchconsole: (sSites ?? []).length,
  };
  // An ad account can be connected and synced yet hold no campaigns. That is not a problem with the connection, but it is not "real ROAS" either.
  const campaignCount = (p: string) => (camps ?? []).filter((c) => c.platform === p).length;
  const googleReady = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);

  const adsOn = ["meta", "google", "tiktok"].filter((p) => conn(p) && (campaignCount(p) > 0));
  const adsEmpty = ["meta", "google", "tiktok"].filter((p) => conn(p) && campaignCount(p) === 0 && (chosen[p] ?? 1) > 0);
  const storesOn = ["woocommerce", "allegro", "shopify"].filter((p) => conn(p));
  const LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok", woocommerce: "WooCommerce", allegro: "Allegro", ga4: "Google Analytics", merchant: "Google Merchant Center", searchconsole: "Google Search Console", shopify: "Shopify" };
  const list = (ids: string[]) => ids.map((i) => LABEL[i]).join(", ");
  const verdict = adsOn.length && storesOn.length ? { ok: true, text: `Real ROAS is on. ${list(adsOn)} spend is compared with orders from ${list(storesOn)}.` }
    : adsOn.length ? { ok: false, text: `${list(adsOn)} connected. Add a store to see what your ads really earn.` }
    : storesOn.length ? { ok: false, text: `${list(storesOn)} connected. Add an ad platform to see spend and real ROAS.` }
    : { ok: false, text: "Connect one ad platform and one store. That is all it takes to see real ROAS." };

  const emptyNote = adsEmpty.length ? `${list(adsEmpty)} ${adsEmpty.length === 1 ? "is" : "are"} connected but ${adsEmpty.length === 1 ? "has" : "have"} no campaigns yet, so there is no ad spend to compare.` : null;

  return (
    <>
      <div>
        <div className="eyebrow">Workspace · {current?.name ?? ""}</div>
        <h1 className="page">Connections</h1>
        <p className="sub">Ads tell you what you spent. Your store tells you what you earned. Connect both and acezilla shows the real return. Everything is read-only.</p>
      </div>
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <Step n="1" title="Ad platforms" sub="Where the money goes" done={adsOn.length > 0} detail={adsOn.length ? list(adsOn) : adsEmpty.length ? `${list(adsEmpty)} connected, no campaigns yet` : "Not connected"} />
          <Step n="2" title="Store or marketplace" sub="What actually sold" done={storesOn.length > 0} detail={storesOn.length ? list(storesOn) : "Not connected"} />
        </div>
        <div style={{ fontSize: 14, color: verdict.ok ? "var(--pos)" : "var(--ink2)", fontWeight: verdict.ok ? 600 : 400 }}>{verdict.text}{emptyNote ? ` ${emptyNote}` : ""}</div>
      </Card>

      {(conns ?? []).length > 0 && (
        <Card style={{ overflowX: "auto" }}>
          <h2 className="h2"><span className="n">··</span>Data health</h2>
          <table className="t">
            <thead><tr><th style={{ textAlign: "left" }}>Source</th><th style={{ textAlign: "left" }}>Status</th><th style={{ textAlign: "left" }}>Last data</th><th style={{ textAlign: "left" }}>What to do</th></tr></thead>
            <tbody>
              {(conns ?? []).map((c) => {
                // Connected but nothing chosen: no data will ever arrive, so it must not read "Healthy".
                const h = chosen[c.platform as string] === 0
                  ? { label: "Nothing chosen", color: "var(--warn)", todo: "Choose which account to read, then press Save and sync." }
                  : health(c.platform as string, c.status as string, c.last_sync_at as string | null, c.last_error as string | null);
                return (
                  <tr key={c.platform as string}>
                    <td style={{ textAlign: "left" }}><b style={{ fontWeight: 600 }}>{LABEL[c.platform as string] ?? c.platform}</b></td>
                    <td style={{ textAlign: "left", color: h.color }}><span className={h.label === "Healthy" ? "pulse" : undefined} style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: h.color, marginRight: 6 }} />{h.label}</td>
                    <td style={{ textAlign: "left" }}>{c.last_sync_at ? ago(c.last_sync_at as string) : "Never"}</td>
                    <td style={{ textAlign: "left", whiteSpace: "normal" }}>{h.todo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {!(ga4 && merchant && searchc && conn("google")) && googleReady && (
            <Card>
              <b>Connect several Google services at once</b>
              <p className="sub" style={{ fontSize: 13, margin: "4px 0 10px" }}>One Google login and one consent screen for everything you tick, instead of one for each. You still choose which account to read for each service afterwards.</p>
              <form action="/api/connect/google/suite/start" method="get" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {([["ads", "Google Ads", !conn("google")], ["ga4", "Analytics", !ga4], ["searchconsole", "Search Console", !searchc], ["merchant", "Merchant Center", !merchant]] as const).map(([id, name, missing]) => (
                  <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, opacity: missing ? 1 : 0.55 }}>
                    <input type="checkbox" name="s" value={id} defaultChecked={missing} style={{ accentColor: "var(--accent)" }} />{name}{missing ? "" : " (connected)"}
                  </label>
                ))}
                <Button>Connect with Google</Button>
              </form>
            </Card>
          )}
          <StepFlow id="connect">
          <FlowStep label="Ad platforms" hint="Meta and Google, where the money goes" badge={adsEmpty.length ? "no campaigns" : undefined}>
          <Section n="1" title="Ad platforms" feeds="Feeds: spend, clicks, conversions and the ROAS each platform reports.">
            {(["meta", "google"] as const).map((id) => {
              const c = conn(id);
              const ready = id === "meta" ? metaReady : googleReady;
              const label = id === "meta" ? "Meta" : "Google";
              const daysLeft = c?.token_expires_at ? Math.floor((new Date(c.token_expires_at as string).getTime() - Date.now()) / 86400000) : null;
              const broken = c && (c.status === "error" || c.status === "needs_reauth");
              return (
                <Connector
                  key={id}
                  logo={<BrandLogo brand={id} />}
                  name={id === "meta" ? "Meta Ads" : "Google Ads"}
                  desc={id === "meta" ? "Facebook and Instagram campaigns" : "Search, Shopping and Performance Max"}
                  connected={!!c} lastSync={c?.last_sync_at as string | undefined} accounts={names(id)} accountWord="ad account"
                  problem={broken ? (c.status === "needs_reauth" ? "Login expired. Reconnect to keep syncing." : `Sync failed: ${c.last_error ?? "unknown error"}`) : undefined}
                  warning={!broken && daysLeft !== null && daysLeft <= 10 ? `Login expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? "" : "s"}. Reconnect to renew.` : c && !broken && (chosen[id] ?? 0) > 0 && campaignCount(id) === 0 ? "Connected and read, but this account has no campaigns yet, so there is no ad spend to compare." : undefined}
                  action={
                    c ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {c.status === "needs_reauth" || (daysLeft !== null && daysLeft <= 10)
                          ? <Button asChild><a href={`/api/connect/${id}/start`}>Reconnect</a></Button> : null}
                        <form action={syncNow}><input type="hidden" name="platform" value={id} /><Button variant="ghost">Sync now</Button></form>
                        <Button asChild variant="outline"><Link href={`/connections/${id}`}>Choose accounts</Link></Button>
                      </div>
                    ) : ready ? <Button asChild><a href={`/api/connect/${id}/start`}>Connect {label}</a></Button>
                    : <Button variant="outline" disabled title={`Add the ${label} secrets`}>Not configured</Button>
                  }
                />
              );
            })}
          </Section>
          </FlowStep>
          <FlowStep label="Stores" hint="Your shop and Allegro, where the sales happen">
          <Section n="2" title="Stores and marketplaces" feeds="Feeds: real orders and revenue. This is what makes ROAS honest, because it counts sales, not clicks.">
            <Connector
              logo={<BrandLogo brand="woocommerce" />} name="WooCommerce" desc="Your WordPress store. Install our plugin, paste a code, done."
              connected={!!woo} lastSync={woo?.last_sync_at as string | undefined} accounts={woo?.external_user_id ? [woo.external_user_id as string] : []} accountWord="store"
              warning={woo?.last_error ? (woo.last_error as string) : undefined}
              action={<Button asChild variant={woo ? "outline" : "solid"}><Link href="/connections/woocommerce">{woo ? ((woo.last_error as string | null)?.startsWith("Your store sells in") ? "Fix currency" : "Manage") : "Set up"}</Link></Button>}
            />
            <Connector
              logo={<BrandLogo brand="allegro" />} name="Allegro" desc="Orders, ad costs and fees from your seller account"
              connected={!!allegro} lastSync={allegro?.last_sync_at as string | undefined} accounts={allegro?.external_user_id ? [allegro.external_user_id as string] : []} accountWord="seller account"
              problem={allegro?.status === "needs_reauth" ? "Login expired. Reconnect to keep syncing." : allegro?.status === "error" ? `Sync failed: ${allegro.last_error ?? "unknown error"}` : undefined}
              warning={allegro && allegro.status === "active" && allegro.last_error ? (allegro.last_error as string) : undefined}
              action={
                allegro ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {allegro.status === "needs_reauth" ? <Button asChild><a href="/api/connect/allegro/start">Reconnect</a></Button> : null}
                    <form action={syncNow}><input type="hidden" name="platform" value="allegro" /><Button variant="ghost">Sync now</Button></form>
                    <Button asChild variant="outline"><Link href="/connections/allegro">Details</Link></Button>
                  </div>
                ) : allegroEnv().ready ? <Button asChild><a href="/api/connect/allegro/start">Connect Allegro</a></Button>
                : <Button variant="outline" disabled title="Add the Allegro client ID and secret">Not configured</Button>
              }
            />
          </Section>
          </FlowStep>
          <FlowStep label="Analytics" hint="Website visits and search words">
          <Section n="3" title="Analytics" feeds="Feeds: on-site sessions and conversions, and the words people searched on Google. Optional.">
            <Connector
              logo={<BrandLogo brand="ga4" />} name="Google Analytics 4" desc="Sessions and on-site conversions"
              connected={!!ga4} lastSync={ga4?.last_sync_at as string | undefined} accounts={(props ?? []).map((p) => p.name as string)} accountWord="property"
              problem={ga4?.status === "needs_reauth" ? "Login expired. Reconnect to keep syncing." : ga4?.status === "error" ? `Sync failed: ${ga4.last_error ?? "unknown error"}` : undefined}
              action={
                ga4 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {ga4.status === "needs_reauth" ? <Button asChild><a href="/api/connect/ga4/start">Reconnect</a></Button> : null}
                    <form action={syncNow}><input type="hidden" name="platform" value="ga4" /><Button variant="ghost">Sync now</Button></form>
                    <Button asChild variant="outline"><Link href="/connections/ga4">Choose properties</Link></Button>
                  </div>
                ) : googleReady ? <Button asChild><a href="/api/connect/ga4/start">Connect Google Analytics</a></Button>
                : <Button variant="outline" disabled title="Add the Google secrets">Not configured</Button>
              }
            />
            <Connector
              logo={<BrandLogo brand="searchconsole" />} name="Google Search Console" desc="The words people searched on Google before reaching your website"
              connected={!!searchc} lastSync={searchc?.last_sync_at as string | undefined} accounts={(sSites ?? []).map((a) => a.name as string)} accountWord="website"
              problem={searchc?.status === "needs_reauth" ? "Login expired. Reconnect to keep syncing." : searchc?.status === "error" ? `Sync failed: ${searchc.last_error ?? "unknown error"}` : undefined}
              action={
                searchc ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {searchc.status === "needs_reauth" ? <Button asChild><a href="/api/connect/searchconsole/start">Reconnect</a></Button> : null}
                    <form action={syncNow}><input type="hidden" name="platform" value="searchconsole" /><Button variant="ghost">Sync now</Button></form>
                    <Button asChild variant="outline"><Link href="/connections/searchconsole">Choose websites</Link></Button>
                  </div>
                ) : googleReady ? <Button asChild><a href="/api/connect/searchconsole/start">Connect Search Console</a></Button>
                : <Button variant="outline" disabled title="Add the Google secrets">Not configured</Button>
              }
            />
          </Section>
          </FlowStep>
          <FlowStep label="Product feed" hint="What Google Shopping shows or blocks">
          <Section n="4" title="Product feed" feeds="Feeds: which products Google Shopping shows or blocks, and clicks from free listings and ads. Optional.">
            <Connector
              logo={<BrandLogo brand="merchant" />} name="Google Merchant Center" desc="Product approval status and Shopping traffic"
              connected={!!merchant} lastSync={merchant?.last_sync_at as string | undefined} accounts={(mAccts ?? []).map((a) => a.name as string)} accountWord="account"
              problem={merchant?.status === "needs_reauth" ? "Login expired. Reconnect to keep syncing." : merchant?.status === "error" ? `Sync failed: ${merchant.last_error ?? "unknown error"}` : undefined}
              action={
                merchant ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {merchant.status === "needs_reauth" ? <Button asChild><a href="/api/connect/merchant/start">Reconnect</a></Button> : null}
                    <form action={syncNow}><input type="hidden" name="platform" value="merchant" /><Button variant="ghost">Sync now</Button></form>
                    <Button asChild variant="outline"><Link href="/connections/merchant">Choose accounts</Link></Button>
                  </div>
                ) : googleReady ? <Button asChild><a href="/api/connect/merchant/start">Connect Merchant Center</a></Button>
                : <Button variant="outline" disabled title="Add the Google secrets">Not configured</Button>
              }
            />
          </Section>
          </FlowStep>
          </StepFlow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <b>How it fits together</b>
            <ol className="sub" style={{ fontSize: 14, paddingLeft: 18, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
              <li><b>Ad platforms</b> say how much you spent and how much they think they earned. Each one counts its own sales, so the totals are usually too high.</li>
              <li><b>Your store</b> knows which orders really happened and where each customer came from.</li>
              <li><b>acezilla</b> puts them side by side. That gives you Store ROAS, the return on your ad spend measured against real orders.</li>
            </ol>
          </Card>
          <div style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", borderRadius: 10, padding: 16, fontSize: 14 }}>
            <b>Suggest-only.</b> acezilla only reads your data. Nothing changes in a live campaign until a person approves it.
          </div>
          <Button asChild variant="outline"><Link href="/dashboard">Open the command center →</Link></Button>
        </div>
      </div>
    </>
  );
}

/** How fresh and healthy a connection is. Ad platforms sync daily; WooCommerce pushes when the store changes, so quiet is normal for longer. */
function health(platform: string, status: string, lastSync: string | null, lastError: string | null) {
  const OK = "var(--pos)", WARN = "var(--warn)", BAD = "var(--neg)";
  if (status === "needs_reauth") return { label: "Login expired", color: BAD, todo: "Reconnect so syncing can continue." };
  if (status === "error") return { label: "Sync failing", color: BAD, todo: lastError ? `${lastError}` : "Try Sync now. If it keeps failing, reconnect." };
  if (lastError) return { label: "Needs a look", color: WARN, todo: lastError };
  if (!lastSync) return { label: "Waiting for data", color: WARN, todo: platform === "woocommerce" ? "Open the acezilla plugin in WordPress and check that it is paired." : "Press Sync now." };
  const hours = (Date.now() - new Date(lastSync).getTime()) / 3600000;
  const limit = platform === "woocommerce" ? 24 * 7 : 36;
  if (hours > limit) return { label: "Stale", color: WARN, todo: platform === "woocommerce" ? "No orders received for a week. Normal for a quiet store; otherwise check the plugin." : "Data is more than a day and a half old. Press Sync now." };
  return { label: "Healthy", color: OK, todo: "Nothing to do." };
}

function Section({ n, title, feeds, children }: { n: string; title: string; feeds: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}><span className="n">{n}</span>{title}</h2>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13 }}>{feeds}</p>
      </div>
      {children}
    </section>
  );
}

function Step({ n, title, sub, done, detail }: { n: string; title: string; sub: string; done: boolean; detail: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600, background: done ? "var(--pos)" : "var(--line2)", color: done ? "var(--surface)" : "var(--ink2)" }}>{done ? "✓" : n}</span>
      <div style={{ minWidth: 0 }}>
        <div><b style={{ fontWeight: 600 }}>{title}</b> <span className="sub" style={{ fontSize: 12 }}>· {sub}</span></div>
        <div style={{ fontSize: 13, color: done ? "var(--pos)" : "var(--ink3)" }}>{detail}</div>
      </div>
    </div>
  );
}

function Connector({ logo, name, desc, connected, lastSync, accounts = [], accountWord = "account", action, problem, warning }: {
  logo: React.ReactNode; name: string; desc: string; connected: boolean; lastSync?: string; accounts?: string[]; accountWord?: string; action: React.ReactNode; problem?: string; warning?: string;
}) {
  return (
    <Card
      className="conn"
      style={{ flexWrap: "wrap", ...(connected ? { borderColor: problem ? "var(--neg)" : "var(--pos)", background: problem ? "color-mix(in oklab, var(--neg) 6%, var(--surface))" : CONNECTED_BG } : {}) }}
    >
      {logo}
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b>{name}</b>
          {connected && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: problem ? "var(--neg)" : "var(--pos)", fontSize: 12, fontWeight: 600 }}>
              <span className={problem ? undefined : "pulse"} style={{ width: 7, height: 7, borderRadius: 4, background: problem ? "var(--neg)" : "var(--pos)" }} />{problem ? "Needs attention" : "Connected"}
            </span>
          )}
        </div>
        <div className="sub" style={{ margin: 0, fontSize: 13 }}>
          {connected
            ? accounts.length > 0
              ? `${accounts.length} ${accounts.length === 1 ? accountWord : accountWord.replace(/y$/, "ie") + "s"}: ${accounts.join(", ")}${lastSync ? ` · synced ${ago(lastSync)}` : ""}`
              : lastSync ? `Synced ${ago(lastSync)}` : "No accounts selected yet. Click Choose accounts."
            : desc}
        </div>
        {problem && <div style={{ fontSize: 13, color: "var(--neg)", marginTop: 2 }}>{problem}</div>}
        {warning && <div style={{ fontSize: 13, color: "var(--warn)", marginTop: 2 }}>{warning}</div>}
      </div>
      {action}
    </Card>
  );
}
