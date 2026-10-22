/** Plain-language meanings for the numbers we show. Keyed by the label as it appears on screen. */
export const GLOSSARY: Record<string, string> = {
  Spend: "What you paid the ad platforms in this period.",
  Revenue: "Sales the ad platforms say their ads produced. Each platform counts its own, so this is often too high.",
  "Blended ROAS": "Return on ad spend across all platforms, as they report it: revenue divided by spend. 3.0x means 3 earned for every 1 spent.",
  "Platform ROAS": "The return one platform claims for itself. Platforms tend to over-count, so compare it with Modeled or Store ROAS.",
  "Modeled ROAS": "Return measured on real store orders that carry this campaign's name in their UTM tags. Blank means no order is tagged with it.",
  "Store ROAS": "Real store revenue divided by your total ad spend. The most honest return, because it counts orders that happened.",
  CPA: "Cost per acquisition: spend divided by conversions. Lower is better.",
  Conversions: "Purchases or other goals the ad platforms recorded.",
  "Store revenue": "Money from real orders in your store, after tax, shipping and refunds.",
  Orders: "Orders that count as sales (completed, processing, on hold).",
  "Average order": "Store revenue divided by orders.",
};
