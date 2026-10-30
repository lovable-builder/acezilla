export interface NavTab { href: string; name: string }
export interface NavItem { href: string; name: string; /** Pages that share this sidebar entry, shown as tabs at the top of each of them. */ tabs?: NavTab[] }

/**
 * Six sidebar entries instead of fourteen. Related pages are tabs of one entry, so the sidebar says where you are in the job
 * (look at results, plan, research) and the tabs say which tool. Creative and Rules are not listed until they do something;
 * their pages still exist.
 */
export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ href: "/dashboard", name: "Home", tabs: [{ href: "/dashboard", name: "Command center" }, { href: "/copilot", name: "Ask Copilot" }] }] },
  { label: "Plan", items: [{ href: "/strategy", name: "Plan", tabs: [{ href: "/strategy", name: "Strategy map" }, { href: "/planner", name: "Budget planner" }, { href: "/forecaster", name: "Profit forecaster" }, { href: "/builder", name: "Campaign builder" }] }] },
  { label: "Analyze", items: [
    { href: "/attribution", name: "Results", tabs: [{ href: "/attribution", name: "Ads vs real sales" }, { href: "/products", name: "Products" }] },
    { href: "/competitors", name: "Research", tabs: [{ href: "/competitors", name: "Competitor ads" }, { href: "/seo", name: "SEO & search words" }] },
  ] },
  { label: "Setup", items: [{ href: "/connections", name: "Connections" }, { href: "/workspace", name: "Settings" }] },
];

/** The sidebar entry a path belongs to, if any. */
export function itemFor(path: string): NavItem | undefined {
  return NAV.flatMap((g) => g.items).find((i) => (i.tabs ?? [{ href: i.href }]).some((t) => path === t.href || path.startsWith(`${t.href}/`)));
}
