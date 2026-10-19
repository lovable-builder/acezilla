import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell/shell";
import { getLastSync, getWorkspaceContext } from "@/lib/workspace";
import { ago } from "@/lib/format";

const ui = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "acezilla",
  description: "Plan, buy and understand paid media in one loop.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { supabase, workspaces, current } = await getWorkspaceContext();
  const { data: auth } = await supabase.auth.getUser();
  const last = current ? await getLastSync(current.id) : null;
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`}>
      <body suppressHydrationWarning>
        <Shell workspaces={workspaces} currentId={current?.id ?? null} email={auth.user?.email ?? null} syncLabel={last ? `Synced ${ago(last)}` : "No data synced"}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
