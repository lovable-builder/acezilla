import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in · acezilla", description: "Sign in to your acezilla workspace to see and approve your ad performance across platforms.", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
