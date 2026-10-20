import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const ui = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "acezilla",
  description: "Plan, buy and understand paid media in one loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
