import { GA4_SCOPE, GOOGLE_ADS_SCOPE, MERCHANT_SCOPE, SEARCH_CONSOLE_SCOPE } from "@acezilla/connectors";

/** The Google services that can be connected in one step, and the connection each one becomes. */
export const SUITE: Record<string, { platform: string; scope: string; label: string }> = {
  ads: { platform: "google", scope: GOOGLE_ADS_SCOPE, label: "Google Ads" },
  ga4: { platform: "ga4", scope: GA4_SCOPE, label: "Google Analytics" },
  searchconsole: { platform: "searchconsole", scope: SEARCH_CONSOLE_SCOPE, label: "Search Console" },
  merchant: { platform: "merchant", scope: MERCHANT_SCOPE, label: "Merchant Center" },
};
