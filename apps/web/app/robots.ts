import type { MetadataRoute } from "next";
import { SITE } from "@/lib/legal";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      // The signed-in app and its API are private; the sign-in pages are kept crawlable so their noindex tag is seen.
      disallow: ["/dashboard", "/connections", "/copilot", "/planner", "/builder", "/creative", "/attribution", "/rules", "/api/", "/auth/", "/reset-password"],
    }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
