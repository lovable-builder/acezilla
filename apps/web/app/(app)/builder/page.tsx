import { FeaturePage } from "@/components/app/feature-page";
import { FEATURES } from "@/lib/feature-content";

export const metadata = { title: "Builder · acezilla" };

export default function Page() {
  return <FeaturePage {...FEATURES.builder!} />;
}
