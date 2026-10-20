import type { MetadataRoute } from "next";
import { SITE } from "@/lib/legal";

const UPDATED = new Date("2026-10-20");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: UPDATED, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/privacy`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/data-deletion`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
  ];
}
