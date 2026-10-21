import { getWorkspaceContext } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createWorkspace, updateWorkspace } from "./actions";

const CURRENCIES = ["USD", "EUR", "GBP", "PLN", "EGP", "AED", "SAR", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "CZK", "HUF", "RON", "TRY", "INR", "JPY", "BRL", "MXN", "ZAR"];

function CurrencySelect({ value }: { value: string }) {
  const list = CURRENCIES.includes(value) ? CURRENCIES : [value, ...CURRENCIES];
  return <select name="currency" defaultValue={value} className="field" aria-label="Currency">{list.map((c) => <option key={c} value={c}>{c}</option>)}</select>;
}

export default async function Workspaces({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { notice, error } = await searchParams;
  const { workspaces, current } = await getWorkspaceContext();
  if (!current) return <Card>No workspace found for this account.</Card>;
  return (
    <>
      <div>
        <div className="eyebrow">Workspace</div>
        <h1 className="page">Workspaces</h1>
        <p className="sub">A workspace is one business or client. Its ad accounts, store, orders, currency, SEO sites and approvals stay separate from your other workspaces.</p>
      </div>
      {notice && <Card style={{ color: "var(--pos)" }}>{notice}</Card>}
      {error && <Card style={{ color: "var(--neg)" }}>{error}</Card>}

      <Card style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
        <b>This workspace</b>
        <form action={updateWorkspace} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="eyebrow" htmlFor="ws-name">Name</label>
          <input id="ws-name" name="name" className="field" defaultValue={current.name} minLength={2} maxLength={60} required />
          <label className="eyebrow" htmlFor="ws-cur">Currency</label>
          <CurrencySelect value={current.currency} />
          <div className="sub" style={{ margin: 0, fontSize: 12 }}>All money in this workspace is shown in this currency. Pick the one your store and ad accounts use. Figures are not converted.</div>
          <div><Button>Save changes</Button></div>
        </form>
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
        <b>Add a workspace</b>
        <div className="sub" style={{ margin: 0, fontSize: 13 }}>For a second store or a client. You will connect its accounts separately.</div>
        <form action={createWorkspace} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input name="name" className="field" placeholder="Name, for example Acme Shoes" minLength={2} maxLength={60} required aria-label="New workspace name" />
          <CurrencySelect value={current.currency} />
          <div><Button variant="outline">Create workspace</Button></div>
        </form>
      </Card>

      <Card style={{ maxWidth: 560 }}>
        <b>Your workspaces</b>
        <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {workspaces.map((w) => (
            <li key={w.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span>{w.name}</span><span className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{w.currency}</span>
              {w.id === current.id && <span className="seo-chip seo-chip-good">Active</span>}
            </li>
          ))}
        </ul>
        <p className="sub" style={{ fontSize: 12, marginBottom: 0 }}>Switch between them with the Workspace menu in the sidebar.</p>
      </Card>
    </>
  );
}
