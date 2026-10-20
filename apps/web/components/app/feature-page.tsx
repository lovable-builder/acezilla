import Link from "next/link";
import { FeatureCarousel, type Slide } from "./feature-carousel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface FeatureContent {
  eyebrow: string; title: string; subtitle: string; slides: Slide[];
  /** What the user can do today while this tab is being built. */
  meanwhile: { text: string; href: string; cta: string };
}

/** Shown for tabs that are not built yet: what the tab is responsible for, as a simple banner carousel. */
export function FeaturePage({ eyebrow, title, subtitle, slides, meanwhile }: FeatureContent) {
  return (
    <>
      <div>
        <div className="eyebrow" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {eyebrow}<span className="fc-soon mono">Coming soon</span>
        </div>
        <h1 className="page">{title}</h1>
        <p className="sub">{subtitle}</p>
      </div>
      <FeatureCarousel slides={slides} label={`What ${title} will do`} />
      <Card style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <span style={{ color: "var(--ink2)" }}>{meanwhile.text}</span>
        <Button asChild variant="outline"><Link href={meanwhile.href}>{meanwhile.cta}</Link></Button>
      </Card>
    </>
  );
}
