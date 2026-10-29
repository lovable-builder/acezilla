import { getWorkspaceContext } from "@/lib/workspace";
import { loadForecastDefaults } from "@/lib/forecast-defaults";
import { Card } from "@/components/ui/card";
import { Forecaster } from "@/components/forecaster/forecaster";

export const metadata = { title: "Profit forecaster · acezilla" };

export default async function Page() {
  const { supabase, current } = await getWorkspaceContext();
  if (!current) return <Card>No workspace found for this account.</Card>;
  const defaults = await loadForecastDefaults(supabase, current.id, current.currency);
  return (
    <>
      <div>
        <div className="eyebrow">Plan · Profit forecaster</div>
        <h1 className="page">Will this campaign make money?</h1>
        <p className="sub">Imagine a campaign before you spend. Set the budget, the cost per click and the sales channel&apos;s fees, and acezilla plays it out 10,000 times with luck on clicks, conversions and returns. You see the chance of profit or loss, not one hopeful number. Nothing here changes an ad platform.</p>
      </div>
      <Forecaster d={defaults} />
    </>
  );
}
