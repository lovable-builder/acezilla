export const NAV = [
  { label: "Overview", items: [{ href: "/dashboard", name: "Command center" }, { href: "/copilot", name: "Copilot" }] },
  { label: "Plan", items: [{ href: "/planner", name: "Planner & forecast", soon: true }, { href: "/builder", name: "Campaign builder" }] },
  { label: "Analyze", items: [{ href: "/creative", name: "Creative", soon: true }, { href: "/products", name: "Products" }, { href: "/attribution", name: "Attribution" }, { href: "/seo", name: "SEO & AI search" }] },
  { label: "Automate", items: [{ href: "/rules", name: "Rules & approvals", soon: true }] },
  { label: "Setup", items: [{ href: "/connections", name: "Connections" }, { href: "/workspace", name: "Workspace settings" }] },
] as const;
