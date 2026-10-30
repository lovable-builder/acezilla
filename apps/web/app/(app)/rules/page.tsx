import { redirect } from "next/navigation";

/**
 * Hidden for now: this page only described a feature that is not built. It is not in the sidebar, and the old address
 * sends people to the Command center. The explainer text is kept in lib/feature-content.ts for when the feature exists.
 */
export default function Page() {
  redirect("/dashboard");
}
