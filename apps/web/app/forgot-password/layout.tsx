import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reset your password · acezilla", description: "Request a link to choose a new acezilla password.", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
