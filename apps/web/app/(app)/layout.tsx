import { Shell } from "@/components/shell/shell";
import { getLastSync, getWorkspaceContext } from "@/lib/workspace";
import { ago } from "@/lib/format";

/** The signed-in app. Public pages (login, legal) live outside this group so they never touch the database. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, workspaces, current } = await getWorkspaceContext();
  const [claims, last] = await Promise.all([supabase.auth.getClaims(), current ? getLastSync(current.id) : Promise.resolve(null)]);
  const email = (claims.data?.claims?.email as string | undefined) ?? null;
  return (
    <Shell workspaces={workspaces} currentId={current?.id ?? null} email={email} syncLabel={last ? `Synced ${ago(last)}` : "No data synced"}>
      {children}
    </Shell>
  );
}
