import { FeaturePage } from "@/components/app/feature-page";
import { FEATURES } from "@/lib/feature-content";

export const metadata = { title: "Rules · acezilla" };

export default function Page() {
  return <FeaturePage {...FEATURES.rules!} />;
}
