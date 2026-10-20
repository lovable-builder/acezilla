export interface RobotsRules { groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[]; sitemaps: string[] }

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsRules["groups"] = [];
  const sitemaps: string[] = [];
  let cur: RobotsRules["groups"][number] | null = null, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase(), val = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") sitemaps.push(val);
    else if ((key === "allow" || key === "disallow") && cur) cur.rules.push({ allow: key === "allow", path: val });
  }
  return { groups, sitemaps };
}

const toRegex = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));

/** Longest matching rule wins; allow beats disallow on a tie; no matching group means allowed. */
export function isAllowed(r: RobotsRules, agent: string, path: string): boolean {
  const a = agent.toLowerCase();
  const exact = r.groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const groups = exact.length ? exact : r.groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of groups) for (const rule of g.rules) {
    if (rule.path === "") continue;                       // "Disallow:" with no path allows everything
    if (!toRegex(rule.path).test(path)) continue;
    if (!best || rule.path.length > best.len || (rule.path.length === best.len && rule.allow)) best = { allow: rule.allow, len: rule.path.length };
  }
  return best ? best.allow : true;
}
