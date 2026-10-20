export const NAV = [
  { label: "Overview", items: [{ href: "/dashboard", name: "Command center" }, { href: "/copilot", name: "Copilot" }] },
  { label: "Plan", items: [{ href: "/planner", name: "Planner & forecast" }, { href: "/builder", name: "Campaign builder" }] },
  { label: "Analyze", items: [{ href: "/creative", name: "Creative" }, { href: "/attribution", name: "Attribution" }, { href: "/seo", name: "SEO" }] },
  { label: "Automate", items: [{ href: "/rules", name: "Rules & approvals" }] },
  { label: "Workspace", items: [{ href: "/connections", name: "Connections" }] },
] as const;
