import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "acezilla", short_name: "acezilla",
    description: "Your AI marketing agency for Meta, Google and TikTok.",
    start_url: "/dashboard", display: "standalone", background_color: "#111015", theme_color: "#7C5CFF",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }, { src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  };
}
