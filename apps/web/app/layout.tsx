import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/legal";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const ui = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#111015" },
    { media: "(prefers-color-scheme: light)", color: "#F6F5F2" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "acezilla",
  description: "Plan, buy and understand paid media in one loop.",
};

/** Applies the saved (or system) theme before first paint so the app never flashes the wrong one. */
const themeInit = `(function(){try{var s=localStorage.getItem("az-theme");var t=s==="dark"||s==="light"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
