import type { Metadata } from "next";
import { Shell } from "@/components/shell/shell";
import { getSyncLabel, getWorkspaceContext } from "@/lib/workspace";
import { ago } from "@/lib/format";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The signed-in app. Public pages (login, legal) live outside this group so they never touch the database. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, workspaces, current } = await getWorkspaceContext();
  const [claims, syncLabel] = await Promise.all([supabase.auth.getClaims(), current ? getSyncLabel(current.id, ago) : Promise.resolve("No data synced")]);
  const email = (claims.data?.claims?.email as string | undefined) ?? null;
  return (
    <Shell workspaces={workspaces} currentId={current?.id ?? null} email={email} syncLabel={syncLabel}>
      {children}
    </Shell>
  );
}
