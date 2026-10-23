import { CopilotChat } from "@/components/copilot/chat";
import { getWorkspaceContext } from "@/lib/workspace";

export const metadata = { title: "Copilot · acezilla" };
const LABEL: Record<string, string> = { meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads", woocommerce: "WooCommerce", allegro: "Allegro", shopify: "Shopify" };

export default async function Copilot() {
  const { supabase, current } = await getWorkspaceContext();
  const { data } = current ? await supabase.from("connection").select("platform").eq("workspace_id", current.id) : { data: [] };
  const sources = (data ?? []).map((c) => LABEL[c.platform as string]).filter(Boolean) as string[];
  return (
    <>
      <div>
        <div className="eyebrow">Overview</div>
        <h1 className="page">Copilot</h1>
      </div>
      <CopilotChat sources={sources} />
    </>
  );
}
